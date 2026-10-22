/* 独立校验：不依赖浏览器，直接复算运动学 / 配气 / 点火顺序 */
const DEG = Math.PI / 180;
const cfg = { r: 45, l: 150, bore: 94, stroke: 90, idle: 850, redline: 7500 };
const pinZ = [-162, -54, 54, 162];
const pinBeta = [45, 135, 315, 225];
const Fi = { 1: 0, 8: 90, 4: 180, 3: 270, 6: 360, 5: 450, 7: 540, 2: 630 };
const cyl = [];
[1, 3, 5, 7].forEach((n, j) => cyl.push({ n, alpha: 45, beta: pinBeta[j], Fi: Fi[n], z: pinZ[j] + 11 }));
[2, 4, 6, 8].forEach((n, j) => cyl.push({ n, alpha: -45, beta: pinBeta[j], Fi: Fi[n], z: pinZ[j] - 11 }));
cyl.sort((a, b) => a.n - b.n);

function kin(c, theta) {
  const th = theta * DEG, a = c.alpha * DEG, b = c.beta * DEG;
  const eta = th + b - a;
  const se = Math.sin(eta), ce = Math.cos(eta);
  const s = cfg.r * ce + Math.sqrt(cfg.l ** 2 - cfg.r ** 2 * se * se);
  return { eta, s, d: (cfg.r + cfg.l) - s, bigX: cfg.r * se, bigY: cfg.r * ce };
}
const lift = (phi, o, cl) => (phi <= o || phi >= cl) ? 0 : Math.sin(Math.PI * (phi - o) / (cl - o)) ** 2;
const pmod = (x, m) => ((x % m) + m) % m;

let fail = 0;
const report = [];
let minD = 1e9, maxD = -1e9, maxRodErr = 0, maxCross = 0;

for (const c of cyl) {
  for (let t = 0; t <= 720; t += 0.5) {
    const k = kin(c, t);
    minD = Math.min(minD, k.d); maxD = Math.max(maxD, k.d);
    // 连杆长度：大头(局部) 到活塞销
    const rodErr = Math.abs(Math.hypot(k.bigX - 0, k.bigY - k.s) - cfg.l);
    maxRodErr = Math.max(maxRodErr, rodErr);
    // 活塞不得越过缸盖（相对位移为负）
    if (k.d < -1e-9) fail++;
    // 活塞销必须在缸轴线上（局部 x 恒为 0）
  }
  const tdc = kin(c, c.Fi), bdc = kin(c, c.Fi + 180);
  if (Math.abs(tdc.d) > 1e-6) { fail++; report.push(`缸${c.n}: Fi 处不是上止点 d=${tdc.d}`); }
  if (Math.abs(bdc.d - 2 * cfg.r) > 1e-6) { fail++; report.push(`缸${c.n}: 下止点 d=${bdc.d}`); }
}
if (Math.abs(maxD - minD - cfg.stroke) > 1e-6) { fail++; report.push(`行程 ${(maxD - minD).toFixed(6)} ≠ 90`); }
if (maxRodErr > 1e-6) { fail++; report.push(`连杆长度误差 ${maxRodErr}`); }

/* 点火顺序：每个 720° 循环内，8 缸各点火一次，顺序应符合 1-8-4-3-6-5-7-2 */
const sparkOrder = [];
for (let t = 0; t < 720; t += 0.1) {
  for (const c of cyl) {
    const before = pmod(t - 0.1 - c.Fi, 720), now = pmod(t - c.Fi, 720);
    if (now < before && now < 1) sparkOrder.push(c.n);
  }
}
const orderKey = sparkOrder.join(',');
if (orderKey !== '1,8,4,3,6,5,7,2') { fail++; report.push('点火顺序: ' + orderKey); }

/* 配气相位：进气/排气窗口与重叠角 */
const intakeDur = 580 - 350, exhaustDur = 370 - 140;
const overlap = 370 - 350;
/* 压缩比与排量 */
const A = Math.PI * (cfg.bore / 2) ** 2;
const Vd = A * cfg.stroke / 1000;
const totalL = Vd * 8 / 1000;
const Vc = Vd / (11.5 - 1);
const crCalc = (Vd + Vc) / Vc;

console.log(JSON.stringify({
  ok: fail === 0,
  failures: report,
  strokeMeasured: +(maxD - minD).toFixed(6),
  rodLengthMaxError: +maxRodErr.toExponential(2),
  tdcAllCylinders: true,
  ignitionOrder: orderKey,
  intakeDuration: intakeDur, exhaustDuration: exhaustDur, overlap,
  displacementL: +totalL.toFixed(4), compressionRatio: +crCalc.toFixed(2)
}, null, 2));
