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

// Nhánh loại trực tiếp có bye; đội được bye tự đi tiếp
async function generateKnockout(divisionId, { randomize = true } = {}) {
  const teams = await loadTeams(divisionId);
  if (teams.length < 2) throw Object.assign(new Error('Cần ít nhất 2 đội để tạo nhánh đấu'), { expose: true });
  const ordered = randomize ? shuffle(teams) : teams;
  let size = 1;
  while (size < ordered.length) size *= 2;
  const slots = seedOrder(size).map((s) => ordered[s - 1] || null);
  const rounds = Math.log2(size);

  return tx(async () => {
    await run('DELETE FROM matches WHERE division_id = ?', divisionId);
    const ids = [];
    let count = size / 2;
    for (let r = 1; r <= rounds; r++, count /= 2) {
      const { name, prefix } = roundName(count, r);
      ids[r] = [];
      for (let p = 1; p <= count; p++) {
        const row = await get('INSERT INTO matches(division_id, round_order, round_name, position, code) VALUES (?,?,?,?,?) RETURNING id',
          divisionId, r, name, p, count === 1 ? prefix : `${prefix}${p}`);
        ids[r].push(row.id);
      }
    }
    for (let r = 1; r < rounds; r++) {
      for (let i = 0; i < ids[r].length; i++) {
        await run('UPDATE matches SET next_match_id = ?, next_slot = ? WHERE id = ?', ids[r + 1][Math.floor(i / 2)], i % 2 === 0 ? 'a' : 'b', ids[r][i]);
      }
    }
    for (let i = 0; i < ids[1].length; i++) {
      const a = slots[i * 2];
      const b = slots[i * 2 + 1];
      await run('UPDATE matches SET team_a_id = ?, team_b_id = ? WHERE id = ?', a ? a.id : null, b ? b.id : null, ids[1][i]);
      const lone = a && !b ? a.id : !a && b ? b.id : null;
      if (lone) {
        const m = await get("UPDATE matches SET status = 'done' WHERE id = ? RETURNING next_match_id, next_slot", ids[1][i]);
        if (m.next_match_id) await run(`UPDATE matches SET team_${m.next_slot}_id = ? WHERE id = ?`, lone, m.next_match_id);
      }
    }
    return ids.flat().length;
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
  'court', 'code', 'round_name', 'live_stream_id', 'video_offset'];

// Cập nhật trận, tự đẩy đội thắng sang trận kế tiếp (nhánh loại trực tiếp)
async function updateMatch(matchId, data) {
  return tx(async () => {
    const m = await get('SELECT * FROM matches WHERE id = ? FOR UPDATE', matchId);
    if (!m) throw Object.assign(new Error('Không tìm thấy trận'), { expose: true });
    const next = { ...m };
    for (const k of MATCH_FIELDS) if (k in data) next[k] = data[k];
    if (next.legs && typeof next.legs !== 'string') next.legs = JSON.stringify(next.legs);
    await run(`UPDATE matches SET ${MATCH_FIELDS.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`,
      ...MATCH_FIELDS.map((k) => next[k]), matchId);
    if (m.next_match_id && m.next_slot) {
      await run(`UPDATE matches SET team_${m.next_slot}_id = ?, updated_at = now() WHERE id = ?`, winnerOf(next), m.next_match_id);
    }
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
  const matches = await loadMatches(divisionId);
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

module.exports = {
  loadTeams, loadMatches, syncTeamsFromRegistrations, generateKnockout, generateRoundRobin,
  updateMatch, winnerOf, loserOf, standings, suggestHonors, groupRounds, MATCH_FIELDS,
};
