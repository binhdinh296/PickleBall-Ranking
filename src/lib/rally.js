// Hình học sân pickleball chuẩn và quỹ đạo pha "dink rally" cho minh họa trang chủ.
// Toạ độ sân theo feet: x 0→20 (chiều ngang), y 0→44 (y = 0 là baseline phía xa), z là độ cao.
// Kích thước chuẩn: sân 20×44 ft, kitchen 7 ft mỗi bên lưới (y 15 và 29), lưới cao 36" ở cột, 34" ở giữa.
// Phép chiếu phối cảnh: camera đứng sau baseline gần, cao H ft, cách baseline C ft.

const VB = { w: 560, h: 440 };
const CAM = { cx: 280, horizon: -118, F: 1035, H: 21, C: 45 };
const DUR = 4.2; // giây cho một vòng rally
const BALL_R = 0.62; // bán kính bóng (đã phóng to để dễ nhìn)

function project(x, y, z = 0) {
  const dz = 44 + CAM.C - y;
  const s = CAM.F / dz;
  return { x: +(CAM.cx + (x - 10) * s).toFixed(2), y: +(CAM.horizon + (CAM.H - z) * s).toFixed(2), s };
}
const pt = (x, y, z) => { const p = project(x, y, z); return `${p.x},${p.y}`; };
const poly = (pts) => pts.map(([x, y, z]) => pt(x, y, z || 0)).join(' ');
const seg = (a, b) => { const p = project(...a); const q = project(...b); return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }; };

// ---- Mặt sân ----
function court() {
  return {
    apron: poly([[-7, -12], [27, -12], [27, 56], [-7, 56]]),
    surface: poly([[0, 0], [20, 0], [20, 44], [0, 44]]),
    kitchenFar: poly([[0, 15], [20, 15], [20, 22], [0, 22]]),
    kitchenNear: poly([[0, 22], [20, 22], [20, 29], [0, 29]]),
    lines: [
      seg([0, 0], [20, 0]), seg([20, 0], [20, 44]), seg([20, 44], [0, 44]), seg([0, 44], [0, 0]), // biên
      seg([0, 15], [20, 15]), seg([0, 29], [20, 29]), // vạch kitchen
      seg([10, 0], [10, 15]), seg([10, 29], [10, 44]), // vạch giữa: không đi qua kitchen
    ],
    kitchenLabel: project(15, 25.6),
  };
}

// ---- Lưới ----
function net() {
  const top = (x) => 3 - 0.17 * (1 - Math.abs(x - 10) / 11); // 36" ở cột → 34" ở giữa
  const mesh = [];
  for (let x = -1; x <= 21; x += 1) mesh.push(seg([x, 22, 0.15], [x, 22, top(x)]));
  for (let z = 0.5; z < 2.9; z += 0.5) mesh.push(seg([-1, 22, z], [21, 22, z]));
  const tape = [];
  for (let x = -1; x <= 21; x += 2) tape.push(pt(x, 22, top(x)));
  return {
    body: poly([[-1, 22, 0.1], [21, 22, 0.1], [21, 22, 3], [10, 22, 2.83], [-1, 22, 3]]),
    mesh,
    tape: tape.join(' '),
    posts: [seg([-1, 22, 0], [-1, 22, 3.15]), seg([21, 22, 0], [21, 22, 3.15])],
  };
}

// ---- Quỹ đạo bóng: 4 đoạn parabol ----
const N_HIT = [7, 30.4, 1.4]; // vợt gần, đứng sau vạch kitchen
const F_HIT = [12.8, 13.6, 1.3]; // vợt xa
const B_FAR = [12.2, 17.2, 0]; // bóng nảy trong kitchen phía xa
const B_NEAR = [8, 26.6, 0]; // bóng nảy trong kitchen phía gần
const SEGMENTS = [
  { from: N_HIT, to: B_FAR, t0: 0, t1: 0.4, apex: 4.3 },
  { from: B_FAR, to: F_HIT, t0: 0.4, t1: 0.52, apex: 1.7 },
  { from: F_HIT, to: B_NEAR, t0: 0.52, t1: 0.9, apex: 4.1 },
  { from: B_NEAR, to: N_HIT, t0: 0.9, t1: 1, apex: 1.8 },
];

function ballAt(t) {
  const sg = SEGMENTS.find((s) => t >= s.t0 && t <= s.t1) || SEGMENTS[SEGMENTS.length - 1];
  const u = (t - sg.t0) / (sg.t1 - sg.t0);
  const lerp = (a, b) => a + (b - a) * u;
  const base = Math.max(sg.from[2], sg.to[2]);
  const z = lerp(sg.from[2], sg.to[2]) + 4 * (sg.apex - base) * u * (1 - u);
  return [lerp(sg.from[0], sg.to[0]), lerp(sg.from[1], sg.to[1]), Math.max(0, z)];
}

function rally() {
  const N = 84;
  const times = [];
  for (let i = 0; i <= N; i++) times.push(i / N);
  // Thêm đúng các mốc chạm/nảy để không bị "trượt" qua điểm nảy
  for (const s of SEGMENTS) times.push(s.t0, s.t1);
  const ts = [...new Set(times.map((t) => +t.toFixed(4)))].sort((a, b) => a - b);
  const ball = { cx: [], cy: [], r: [], front: [], back: [] };
  const shadow = { cx: [], cy: [], rx: [], ry: [], op: [] };
  for (const t of ts) {
    const [x, y, z] = ballAt(t);
    const p = project(x, y, z + BALL_R);
    ball.cx.push(p.x); ball.cy.push(p.y); ball.r.push(+(BALL_R * p.s).toFixed(2));
    const inFront = y >= 22;
    ball.front.push(inFront ? 'visible' : 'hidden');
    ball.back.push(inFront ? 'hidden' : 'visible');
    const g = project(x, y, 0);
    const k = 1 / (1 + z * 0.35);
    shadow.cx.push(g.x); shadow.cy.push(g.y);
    shadow.rx.push(+(BALL_R * 1.25 * g.s * k).toFixed(2)); shadow.ry.push(+(BALL_R * 0.42 * g.s * k).toFixed(2));
    shadow.op.push(+(0.55 * k).toFixed(2));
  }
  const join = (a) => a.join(';');
  const keyTimes = join(ts);
  const nh = project(...N_HIT); const fh = project(...F_HIT);
  const bf = project(...B_FAR); const bn = project(...B_NEAR);
  return {
    dur: `${DUR}s`,
    keyTimes,
    ball: { cx: join(ball.cx), cy: join(ball.cy), r: join(ball.r), front: join(ball.front), back: join(ball.back) },
    shadow: { cx: join(shadow.cx), cy: join(shadow.cy), rx: join(shadow.rx), ry: join(shadow.ry), op: join(shadow.op) },
    // Vợt: vị trí mặt vợt tại điểm chạm, tỉ lệ theo độ xa; góc vung theo nhịp
    // Vợt vẽ với tay cầm ở gốc toạ độ, tâm mặt vợt ở (0, -16): đặt sao cho tâm mặt vợt trùng điểm chạm khi góc = 0
    paddles: [
      { id: 'near', x: nh.x, y: +(nh.y + 16 * (nh.s / 14)).toFixed(2), k: +(nh.s / 14).toFixed(3), flip: false,
        rot: '0;24;0;0;-40;0', rotTimes: '0;0.08;0.22;0.8;0.94;1' },
      { id: 'far', x: fh.x, y: +(fh.y + 16 * (fh.s / 14)).toFixed(2), k: +(fh.s / 14).toFixed(3), flip: true,
        rot: '0;0;-40;0;24;0;0', rotTimes: '0;0.36;0.47;0.52;0.6;0.72;1' },
    ],
    hits: [
      { x: nh.x, y: nh.y, r: +(1.4 * nh.s).toFixed(1), op: '0.95;0;0', times: '0;0.12;1' },
      { x: fh.x, y: fh.y, r: +(1.4 * fh.s).toFixed(1), op: '0;0;0.95;0;0', times: '0;0.519;0.52;0.63;1' },
    ],
    bounces: [
      { x: bf.x, y: bf.y, rx: +(1.1 * bf.s).toFixed(1), ry: +(0.38 * bf.s).toFixed(1), op: '0;0;0.95;0;0', times: '0;0.399;0.4;0.56;1', label: { x: bf.x + 6, y: bf.y - 30 } },
      { x: bn.x, y: bn.y, rx: +(1.1 * bn.s).toFixed(1), ry: +(0.38 * bn.s).toFixed(1), op: '0;0;0.95;0;0', times: '0;0.899;0.9;0.99;1', label: { x: bn.x - 6, y: bn.y - 34 } },
    ],
    kitchenPulse: { far: '0.18;0.18;0.6;0.18;0.18', farTimes: '0;0.39;0.42;0.6;1', near: '0.18;0.18;0.6;0.18;0.18', nearTimes: '0;0.89;0.92;0.99;1' },
  };
}

let cache = null;
function build() {
  if (!cache) cache = { vb: VB, court: court(), net: net(), rally: rally() };
  return cache;
}

module.exports = { build, project };
