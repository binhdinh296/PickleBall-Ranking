const crypto = require('crypto');
const { all, get, run, tx } = require('../db');

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadTeams(divisionId) {
  return all('SELECT * FROM teams WHERE division_id = ? ORDER BY COALESCE(seed, 9999), id', divisionId);
}

async function loadMatches(divisionId) {
  return all('SELECT * FROM matches WHERE division_id = ? ORDER BY round_order, position, id', divisionId);
}

// Tạo đội từ các đơn đăng ký đã duyệt (bỏ qua đơn đã có đội)
async function syncTeamsFromRegistrations(divisionId) {
  return tx(async () => {
    const regs = await all(`SELECT r.* FROM registrations r WHERE r.division_id = ? AND r.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.registration_id = r.id) ORDER BY r.id`, divisionId);
    for (const r of regs) {
      await run('INSERT INTO teams(division_id, registration_id, name, athlete1_id, athlete2_id) VALUES (?,?,?,?,?)',
        divisionId, r.id, `${r.name1} / ${r.name2}`, r.athlete1_id, r.athlete2_id);
    }
    return regs.length;
  });
}

function roundName(matchesInRound, roundIndex) {
  if (matchesInRound === 1) return { name: 'Chung kết', prefix: 'CK' };
  if (matchesInRound === 2) return { name: 'Bán kết', prefix: 'BK' };
  if (matchesInRound === 4) return { name: 'Tứ kết', prefix: 'TK' };
  return { name: `Vòng ${roundIndex}`, prefix: roundIndex === 1 ? 'T' : `V${roundIndex}-` };
}

// Thứ tự hạt giống chuẩn cho nhánh 2^k: hạt giống cao không gặp nhau sớm
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

// Dựng danh sách trận của nhánh loại trực tiếp (chưa ghi CSDL).
// Mỗi trận: { key, order, name, code, a, b } với ô = { team } hoặc { src: key trận nguồn, kind: 'winner' | 'loser' }.
// playoff = true (giống giaidau.pickna.vn): thua Vòng 1 xuống Playoff đấu vớt, thắng Vòng 1 vào Vòng 2;
// đội thắng Vòng 2 gặp đội thắng Playoff (xếp chéo để không gặp lại ngay), sau đó loại trực tiếp tới Chung kết.
function knockoutPlan(slots, playoff) {
  const plan = [];
  const add = (order, name, code, a, b) => { const m = { key: code, order, name, code, a, b }; plan.push(m); return m; };
  const W = (m) => ({ src: m.key, kind: 'winner' });
  const L = (m) => ({ src: m.key, kind: 'loser' });
  const size = slots.length;
  const r1 = [];
  for (let i = 0; i < size / 2; i++) r1.push(add(1, 'Vòng 1', `T${i + 1}`, { team: slots[i * 2] }, { team: slots[i * 2 + 1] }));
  let prev = r1;
  let order = 2;
  if (playoff && size >= 4) {
    // Playoff chỉ ghép đội thua của các trận có đủ 2 đội; cặp toàn trận miễn đấu thì không tạo trận Playoff,
    // suất đó là "Miễn đấu" (lấy đội thua của trận miễn đấu = không có) → đội thắng Vòng 2 được đi thẳng
    const real = r1.filter((m) => m.a.team && m.b.team);
    const pool = [...real, ...r1.filter((m) => !(m.a.team && m.b.team))];
    let n = 0;
    const poOut = [];
    for (let i = 0; i < pool.length; i += 2) {
      const [x, y] = [pool[i], pool[i + 1]];
      if (!real.includes(x) && !real.includes(y)) poOut.push({ ...L(x), label: 'Miễn đấu' });
      else poOut.push(W(add(2, 'Playoff', `PO${++n}`, L(x), L(y))));
    }
    const v2 = [];
    for (let i = 0; i < r1.length / 2; i++) v2.push(add(3, 'Vòng 2', `V2-${i + 1}`, W(r1[i * 2]), W(r1[i * 2 + 1])));
    // Gộp nhánh thắng Vòng 2 và nhánh vớt Playoff, xếp chéo; suất miễn đấu (cuối danh sách) rơi vào nhánh hạt giống cao
    const k = v2.length;
    const { name, prefix } = roundName(k, 4);
    prev = v2.map((m, i) => add(4, name, k === 1 ? prefix : `${prefix}${i + 1}`, W(m), poOut[k - 1 - i]));
    order = 5;
  }
  for (let count = prev.length / 2; count >= 1; count /= 2, order++) {
    const { name, prefix } = roundName(count, order);
    const cur = [];
    for (let i = 0; i < count; i++) cur.push(add(order, name, count === 1 ? prefix : `${prefix}${i + 1}`, W(prev[i * 2]), W(prev[i * 2 + 1])));
    prev = cur;
  }
  return plan;
}

// Tạo nhánh loại trực tiếp (xoá trận cũ); đội gặp ô trống được miễn đấu và tự đi tiếp
async function generateKnockout(divisionId, { randomize = true, playoff = false } = {}) {
  const teams = await loadTeams(divisionId);
  if (teams.length < 2) throw Object.assign(new Error('Cần ít nhất 2 đội để tạo nhánh đấu'), { expose: true });
  if (playoff && teams.length < 3) throw Object.assign(new Error('Cần ít nhất 3 đội để có vòng Playoff'), { expose: true });
  const ordered = randomize ? shuffle(teams) : teams;
  let size = 1;
  while (size < ordered.length) size *= 2;
  const slots = seedOrder(size).map((s) => ordered[s - 1] || null);
  const plan = knockoutPlan(slots, playoff);

  return tx(async () => {
    await run('DELETE FROM matches WHERE division_id = ?', divisionId);
    const id = {};
    const pos = {};
    for (const m of plan) {
      pos[m.order] = (pos[m.order] || 0) + 1;
      const t = (x) => (x.team ? x.team.id : null);
      id[m.key] = (await get('INSERT INTO matches(division_id, round_order, round_name, position, code, team_a_id, team_b_id) VALUES (?,?,?,?,?,?,?) RETURNING id',
        divisionId, m.order, m.name, pos[m.order], m.code, t(m.a), t(m.b))).id;
    }
    for (const m of plan) {
      for (const [s, x] of [['a', m.a], ['b', m.b]]) {
        if (x.src) await run(`UPDATE matches SET src_${s}_match_id = ?, src_${s}_kind = ?, label_${s} = ? WHERE id = ?`, id[x.src], x.kind, x.label || null, id[m.key]);
      }
    }
    // Trận Vòng 1 thiếu đội: miễn đấu, kết quả chảy tiếp (Playoff thiếu đội cũng tự miễn đấu theo dây chuyền)
    for (const m of plan.filter((x) => x.order === 1)) {
      if (!m.a.team || !m.b.team) {
        await run("UPDATE matches SET status = 'done' WHERE id = ?", id[m.key]);
        await propagate(id[m.key]);
      }
    }
    return plan.length;
  });
}

// Lịch vòng tròn theo phương pháp xoay vòng; mỗi lượt là một vòng
async function generateRoundRobin(divisionId, { randomize = true, relayLegs = 0 } = {}) {
  const teams = await loadTeams(divisionId);
  if (teams.length < 2) throw Object.assign(new Error('Cần ít nhất 2 đội để tạo lịch vòng tròn'), { expose: true });
  const list = (randomize ? shuffle(teams) : teams).map((t) => t.id);
  if (list.length % 2) list.push(null);
  const n = list.length;
  const legs = relayLegs > 0 ? JSON.stringify(Array.from({ length: relayLegs }, () => '')) : null;

  return tx(async () => {
    await run('DELETE FROM matches WHERE division_id = ?', divisionId);
    let total = 0;
    const arr = list.slice();
    for (let r = 0; r < n - 1; r++) {
      let pos = 1;
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a && b) {
          await run('INSERT INTO matches(division_id, round_order, round_name, position, code, team_a_id, team_b_id, legs) VALUES (?,?,?,?,?,?,?,?)',
            divisionId, r + 1, `Lượt ${r + 1}`, pos, `Trận ${pos}`, a, b, legs);
          pos++;
          total++;
        }
      }
      arr.splice(1, 0, arr.pop());
    }
    return total;
  });
}

function winnerOf(m) {
  if (m.status !== 'done') return null;
  if (m.team_a_id && !m.team_b_id) return m.team_a_id;
  if (m.team_b_id && !m.team_a_id) return m.team_b_id;
  if (m.score_a === null || m.score_b === null || m.score_a === m.score_b) return null;
  return m.score_a > m.score_b ? m.team_a_id : m.team_b_id;
}

function loserOf(m) {
  const w = winnerOf(m);
  if (!w || !m.team_a_id || !m.team_b_id) return null;
  return w === m.team_a_id ? m.team_b_id : m.team_a_id;
}

const MATCH_FIELDS = ['team_a_id', 'team_b_id', 'score_a', 'score_b', 'status', 'players_a', 'players_b', 'legs', 'current_leg',
  'court', 'code', 'round_name', 'round_order', 'live_stream_id', 'video_offset', 'referee_id',
  'src_a_match_id', 'src_a_kind', 'src_b_match_id', 'src_b_kind', 'label_a', 'label_b', 'start_time', 'zone'];

// Đội đi tiếp từ một trận: 'winner' → đội thắng, 'loser' → đội thua (null khi chưa có kết quả)
const resultOf = (m, kind) => (kind === 'loser' ? loserOf(m) : winnerOf(m));

// Đẩy kết quả trận sang mọi trận lấy nguồn từ nó; nếu trận nhận đã có kết quả thì đẩy tiếp (dây chuyền)
async function propagate(matchId, seen = new Set()) {
  if (seen.has(matchId) || seen.size > 500) return;
  seen.add(matchId);
  const m = await get('SELECT * FROM matches WHERE id = ?', matchId);
  if (!m) return;
  const kids = await all('SELECT * FROM matches WHERE src_a_match_id = ? OR src_b_match_id = ?', m.id, m.id);
  for (const k of kids) {
    let changed = false;
    for (const s of ['a', 'b']) {
      if (k[`src_${s}_match_id`] !== m.id) continue;
      const team = resultOf(m, k[`src_${s}_kind`]);
      if (k[`team_${s}_id`] !== team) {
        await run(`UPDATE matches SET team_${s}_id = ?, updated_at = now() WHERE id = ?`, team, k.id);
        changed = true;
      }
    }
    const walkover = await autoWalkover(k.id); // luôn kiểm tra, kể cả khi vừa nhận đội
    if (changed || walkover) await propagate(k.id, seen);
  }
}

// Ô lấy nguồn từ trận đã xong mà không có đội (vd. đội thua của trận miễn đấu) thì sẽ trống mãi:
// trận nhận tự xử miễn đấu để đội còn lại đi tiếp. Ô chưa có nguồn mà trống (chờ BTC gán) thì không tự xử.
async function autoWalkover(matchId) {
  const k = await get('SELECT * FROM matches WHERE id = ?', matchId);
  if (!k || k.status === 'done') return false;
  const settled = async (s) => {
    if (k[`team_${s}_id`]) return true;
    const src = k[`src_${s}_match_id`] ? await get('SELECT status FROM matches WHERE id = ?', k[`src_${s}_match_id`]) : null;
    return !!src && src.status === 'done';
  };
  if (!(await settled('a')) || !(await settled('b'))) return false;
  if (k.team_a_id && k.team_b_id) return false;
  await run("UPDATE matches SET status = 'done', updated_at = now() WHERE id = ?", k.id);
  return true;
}

// Gán nguồn cho ô thì lấy ngay đội từ trận nguồn (nếu trận nguồn đã có kết quả)
async function pullSources(matchId) {
  const m = await get('SELECT * FROM matches WHERE id = ?', matchId);
  for (const s of ['a', 'b']) {
    const srcId = m[`src_${s}_match_id`];
    if (!srcId) continue;
    const src = await get('SELECT * FROM matches WHERE id = ?', srcId);
    const team = src ? resultOf(src, m[`src_${s}_kind`]) : null;
    if (m[`team_${s}_id`] !== team) await run(`UPDATE matches SET team_${s}_id = ? WHERE id = ?`, team, m.id);
  }
}

// Gán nguồn tạo vòng lặp? (đi ngược từ trận nguồn mà gặp lại chính trận đích)
async function wouldCycle(targetId, sourceId) {
  const seen = new Set();
  const stack = [sourceId];
  while (stack.length) {
    const id = stack.pop();
    if (id === targetId) return true;
    if (!id || seen.has(id) || seen.size > 500) continue;
    seen.add(id);
    const r = await get('SELECT src_a_match_id, src_b_match_id FROM matches WHERE id = ?', id);
    if (r) stack.push(r.src_a_match_id, r.src_b_match_id);
  }
  return false;
}

// Cập nhật trận rồi đẩy đội thắng/thua sang các trận lấy nguồn từ trận này
async function updateMatch(matchId, data) {
  return tx(async () => {
    const m = await get('SELECT * FROM matches WHERE id = ? FOR UPDATE', matchId);
    if (!m) throw Object.assign(new Error('Không tìm thấy trận'), { expose: true });
    const next = { ...m };
    for (const k of MATCH_FIELDS) if (k in data) next[k] = data[k];
    if (next.legs && typeof next.legs !== 'string') next.legs = JSON.stringify(next.legs);
    await run(`UPDATE matches SET ${MATCH_FIELDS.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`,
      ...MATCH_FIELDS.map((k) => next[k]), matchId);
    await pullSources(matchId);
    await propagate(matchId);
    return next;
  });
}

// Bảng xếp hạng vòng tròn: thắng → hiệu số tổng → đối đầu (2 đội) / bảng phụ (≥3 đội)
function standings(teams, matches) {
  const done = matches.filter((m) => m.status === 'done' && m.team_a_id && m.team_b_id && m.score_a !== null && m.score_b !== null);
  const tally = (ids, list) => {
    const rows = new Map(ids.map((id) => [id, { id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 }]));
    for (const m of list) {
      const a = rows.get(m.team_a_id);
      const b = rows.get(m.team_b_id);
      if (!a || !b) continue;
      a.played++; b.played++;
      a.pf += m.score_a; a.pa += m.score_b;
      b.pf += m.score_b; b.pa += m.score_a;
      if (m.score_a > m.score_b) { a.wins++; b.losses++; } else if (m.score_b > m.score_a) { b.wins++; a.losses++; }
    }
    for (const r of rows.values()) r.diff = r.pf - r.pa;
    return [...rows.values()];
  };

  const rows = tally(teams.map((t) => t.id), done).sort((x, y) => y.wins - x.wins || y.diff - x.diff);
  const subTables = [];
  const result = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].wins === rows[i].wins && rows[j].diff === rows[i].diff) j++;
    const group = rows.slice(i, j);
    if (group.length === 1 || group[0].played === 0) {
      for (const g of group) result.push({ ...g, basis: 'Trận thắng / hiệu số tổng' });
    } else {
      const ids = new Set(group.map((g) => g.id));
      const inner = done.filter((m) => ids.has(m.team_a_id) && ids.has(m.team_b_id));
      const mini = tally([...ids], inner);
      const byId = new Map(mini.map((r) => [r.id, r]));
      const basis = group.length === 2 ? 'Đối đầu' : 'Bảng phụ';
      group.sort((x, y) => byId.get(y.id).wins - byId.get(x.id).wins || byId.get(y.id).diff - byId.get(x.id).diff);
      group.forEach((g, k) => {
        const prev = k > 0 ? byId.get(group[k - 1].id) : null;
        const cur = byId.get(g.id);
        const tied = !!prev && prev.wins === cur.wins && prev.diff === cur.diff;
        result.push({ ...g, basis: tied ? 'Đồng hạng, cần bốc thăm' : basis, tiedWithPrev: tied });
      });
      subTables.push({ basis, rows: group.map((g) => byId.get(g.id)), matches: inner, wins: group[0].wins, diff: group[0].diff });
    }
    i = j;
  }
  let rank = 0;
  result.forEach((r, k) => { if (!r.tiedWithPrev) rank = k + 1; r.rank = rank; });
  return { rows: result, subTables };
}

// Gợi ý vinh danh từ nhánh loại trực tiếp: vô địch, á quân, 2 đồng hạng ba
async function suggestHonors(divisionId) {
  const matches = (await loadMatches(divisionId)).filter((m) => !m.zone);
  const teams = new Map((await loadTeams(divisionId)).map((t) => [t.id, t]));
  if (!matches.length) return [];
  const maxRound = Math.max(...matches.map((m) => m.round_order));
  const final = matches.find((m) => m.round_order === maxRound);
  const semis = matches.filter((m) => m.round_order === maxRound - 1);
  const out = [];
  const push = (teamId, place) => { const t = teams.get(teamId); if (t) out.push({ place, team: t }); };
  if (final) { push(winnerOf(final), 1); push(loserOf(final), 2); }
  for (const s of semis) push(loserOf(s), 3);
  return out;
}

// Nhóm trận theo vòng để hiển thị cột
function groupRounds(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.round_order)) map.set(m.round_order, { order: m.round_order, name: m.round_name, matches: [] });
    map.get(m.round_order).matches.push(m);
  }
  return [...map.values()];
}

// Loại cột để tô màu tiêu đề (giống pickna): Vòng 1, Playoff, vòng giữa, Tứ kết, Bán kết, Chung kết
function roundKind(name, isFirst) {
  const n = String(name || '').toLowerCase();
  if (/chung kết|final/.test(n) && !/bán|tứ|semi|quarter/.test(n)) return 'ck';
  if (/bán kết|semi/.test(n)) return 'bk';
  if (/tứ kết|quarter/.test(n)) return 'tk';
  if (/play ?off|vớt|tranh/.test(n)) return 'po';
  return isFirst ? 'r1' : 'v2';
}

// Dữ liệu vẽ sơ đồ: cột theo thứ tự vòng (sơ đồ chính) + các khu riêng (vd. MINI);
// kèm mã trận theo id để ghi "Thắng T1" / "Thua T1" cho ô chưa có đội
function board(matches) {
  const main = matches.filter((m) => !m.zone);
  const columns = groupRounds(main).map((r, i) => ({ ...r, kind: roundKind(r.name, i === 0) }));
  const zones = new Map();
  for (const m of matches.filter((x) => x.zone)) {
    if (!zones.has(m.zone)) zones.set(m.zone, { name: m.zone, matches: [] });
    zones.get(m.zone).matches.push(m);
  }
  const codeById = Object.fromEntries(matches.map((m) => [m.id, m.code || `#${m.id}`]));
  const colOf = Object.fromEntries(columns.flatMap((c, i) => c.matches.map((m) => [m.id, i])));
  return { columns, zones: [...zones.values()], codeById, colOf };
}

module.exports = {
  loadTeams, loadMatches, syncTeamsFromRegistrations, generateKnockout, generateRoundRobin,
  updateMatch, propagate, wouldCycle, winnerOf, loserOf, standings, suggestHonors, groupRounds, board, MATCH_FIELDS,
};
