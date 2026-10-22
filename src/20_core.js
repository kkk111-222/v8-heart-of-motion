<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =====================================================================
   V8 / THE HEART OF MOTION
   实时 3D 交互实验室 —— 单文件实现
   结构：Config → Math → Kinematics → Physics → Audio → Geometry → Scene →
        Directing → UI → Loop
   ===================================================================== */

/* ---------------------------- 常量与配置 ---------------------------- */
const DEG = Math.PI / 180;
const SCALE = 0.1;              // 1 场景单位 = 10 mm（模型内部统一用 mm 建模）
const EPS = 1e-6;

const CFG = {
  // 机械
  bore: 94, stroke: 90, crankR: 45, rodLength: 150, vAngle: 90,
  cylinderCount: 8, displacementL: 4.997, compressionRatio: 11.5,
  pinZ: [-162, -54, 54, 162],
  pinBeta: [45, 135, 315, 225],
  rodOffsetZ: 11,
  bankNumbers: { A: [1, 3, 5, 7], B: [2, 4, 6, 8] },
  bankAlpha: { A: 45, B: -45 },
  bankIntakeSign: { A: -1, B: 1 },
  // 缸体尺寸（mm，缸列局部坐标：+Y 为缸轴）
  linerBottom: 70, deckY: 232, linerR: 47, linerOuter: 53.5,
  pistonCH: 30, pistonSkirt: 32,
  camY: 300, camBaseR: 18, camLift: 9, valveTipY: 282,
  valveX: 30, valveZ: 14,
  // 配气正时（以各缸做功上止点为 0° 的 0..720 局部循环）
  exhaustOpen: 140, exhaustClose: 370, intakeOpen: 350, intakeClose: 580,
  // 工况
  idleRpm: 850, redline: 7500, limiter: 7440,
  inertia: 1.15,
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
  Fi: { 1: 0, 8: 90, 4: 180, 3: 270, 6: 360, 5: 450, 7: 540, 2: 630 },
  // 展示
  autoMechRpm: 58, cylMechRpm: 14,
  colors: {
    bg: 0x080b10, stage: 0x111821, panel: 0x0a0f15,
    cyan: 0x70d8e5, amber: 0xffab5e, red: 0xe45a52,
    power: 0xffab5e, exhaust: 0xb08f76, intake: 0x70d8e5, compress: 0x8fa6ba
  }
};

/* 每缸的固定几何参数 */
const CYL = [];
for (let j = 0; j < 4; j++) {
  CYL.push({
    n: CFG.bankNumbers.A[j], bank: 'A', alpha: CFG.bankAlpha.A,
    beta: CFG.pinBeta[j], pinIndex: j,
    z: CFG.pinZ[j] + CFG.rodOffsetZ,
    intakeSign: CFG.bankIntakeSign.A,
    Fi: CFG.Fi[CFG.bankNumbers.A[j]]
  });
  CYL.push({
    n: CFG.bankNumbers.B[j], bank: 'B', alpha: CFG.bankAlpha.B,
    beta: CFG.pinBeta[j], pinIndex: j,
    z: CFG.pinZ[j] - CFG.rodOffsetZ,
    intakeSign: CFG.bankIntakeSign.B,
    Fi: CFG.Fi[CFG.bankNumbers.B[j]]
  });
}
CYL.sort((a, b) => a.n - b.n);
const CYL_BY_N = {};
CYL.forEach(c => CYL_BY_N[c.n] = c);

/* ------------------------------ 数学 ------------------------------ */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || EPS), 0, 1); return t * t * (3 - 2 * t); };
const pmod = (x, m) => ((x % m) + m) % m;
const deg = r => r / DEG;
const rad = d => d * DEG;
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

/* 单调三次插值（用于扭矩曲线，保证平滑、无过冲） */
function makeSpline(pts) {
  const n = pts.length;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else m[i] = (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-9) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/* 全油门扭矩曲线（Nm）—— 集中管理 */
const TORQUE_PTS = [
  [600, 350], [900, 392], [1500, 438], [2200, 472], [3000, 498],
  [3800, 512], [4400, 516], [5000, 508], [5600, 494], [6200, 470],
  [6800, 442], [7100, 422], [7500, 398]
];
const torqueCurve = makeSpline(TORQUE_PTS);

/* 体积 / 压力（教学估算） */
const PISTON_AREA_MM2 = Math.PI * (CFG.bore / 2) ** 2;
const V_D_CM3 = PISTON_AREA_MM2 * CFG.stroke / 1000;              // 单缸排量 cm³
const V_C_CM3 = V_D_CM3 / (CFG.compressionRatio - 1);             // 余隙容积 cm³
const V_TDC = V_C_CM3, V_BDC = V_C_CM3 + V_D_CM3;

/* ------------------------------ 状态 ------------------------------ */
const state = {
  // 工况
  mode: 'off',              // off | starting | idle | running | limit
  fuelOn: false,
  starter: false,
  starterTime: 0,
  omega: 0,                 // rad/s
  rpm: 0,
  throttle: 0,              // 0..1 用户输入
  throttleEff: 0,           // 0..1 平滑后的有效值
  load: 0,                  // 0..1
  tq: 0, powerKW: 0, powerHP: 0,
  tComb: 0, tFric: 0, tLoad: 0,
  coolant: 24, oil: 0, afr: 14.7, map: 0.3, advance: 12,
  fuelCut: 0,
  // 展示时钟
  theta: 0,                 // 未取模的累计展示角度（度）
  prevTheta: 0,
  mechRpm: 0,
  presentationScale: 1,
  paused: false,
  dragging: false,
  // 交互 / 视图
  view: 'section',
  camera: 'whole',
  selected: 1,
  flow: true,
  annotations: true,
  sound: false,
  volume: 0.5,
  quality: 'auto',
  speedMode: 'auto',
  manualScale: 0.01,
  explode: 0,
  explodeTarget: 0,
  cinematic: null,
  userMovedCamera: false,
  impact: 0,
  // 运行时
  dpr: 1, fps: 0, drawCalls: 0, ready: false, hidden: false,
  ignitionFlash: {},         // 每缸最近一次点火时间（用于状态带闪烁）
  sparkPulse: {}             // 每缸点火强度 0..1
};

/* ------------------------------ 运动学 ------------------------------ */
/* 返回某缸在给定曲轴角下的状态（全部为缸列局部坐标，单位 mm） */
const kinTmp = { s: 0, d: 0, eta: 0, bigX: 0, bigY: 0, rodAngle: 0, pinX: 0, pinY: 0 };
function cylinderKinematics(cyl, thetaDeg, out = kinTmp) {
  const th = thetaDeg * DEG, a = cyl.alpha * DEG, b = cyl.beta * DEG;
  const eta = th + b - a;
  const sinE = Math.sin(eta), cosE = Math.cos(eta);
  const r = CFG.crankR, l = CFG.rodLength;
  const s = r * cosE + Math.sqrt(l * l - r * r * sinE * sinE);
  out.eta = eta;
  out.s = s;
  out.d = (r + l) - s;
  out.bigX = r * sinE;
  out.bigY = r * cosE;
  // 连杆：从大头指向小头，+Y 为杆身方向
  out.rodAngle = Math.atan2(r * sinE, s - r * cosE);
  // 活塞销局部坐标（缸轴上的点）
  out.pinX = 0;
  out.pinY = s;
  return out;
}

/* 配气：局部循环相位 φ = pmod(θ - Fi, 720)，0° = 做功上止点 */
function cyclePhase(cyl, thetaDeg) { return pmod(thetaDeg - cyl.Fi, 720); }

function valveLiftFromPhase(phi, openDeg, closeDeg) {
  if (phi <= openDeg || phi >= closeDeg) return 0;
  const x = (phi - openDeg) / (closeDeg - openDeg);
  const sn = Math.sin(Math.PI * x);
  return sn * sn;
}
function intakeLift(cyl, thetaDeg) { return valveLiftFromPhase(cyclePhase(cyl, thetaDeg), CFG.intakeOpen, CFG.intakeClose); }
function exhaustLift(cyl, thetaDeg) { return valveLiftFromPhase(cyclePhase(cyl, thetaDeg), CFG.exhaustOpen, CFG.exhaustClose); }

function phaseOfCycle(phi) {
  if (phi < 180) return 0;   // 做功
  if (phi < 360) return 1;   // 排气
  if (phi < 540) return 2;   // 进气
  return 3;                  // 压缩
}
const PHASE_NAMES = ['做功', '排气', '进气', '压缩'];
const PHASE_COLORS = ['#FFAB5E', '#B08F76', '#70D8E5', '#8FA6BA'];

/* 燃烧强度：火花极短、火焰在早期达到峰值并迅速衰减，不覆盖整个做功冲程 */
function combustionIntensity(cyl, thetaDeg) {
  const phi = cyclePhase(cyl, thetaDeg);
  if (phi > 105) return 0;
  const e = state.throttleEff * (state.fuelCut > 0 ? 0 : 1);
  if (e < 0.02) return 0;
  const rise = smoothstep(0, 7, phi);
  const decay = Math.exp(-Math.max(0, phi - 10) / 27);
  return clamp(rise * decay * (0.55 + 0.45 * e), 0, 1) * (0.35 + 0.65 * e);
}
function sparkIntensity(cyl, thetaDeg, advanceDeg) {
  const phi = pmod(thetaDeg - cyl.Fi + advanceDeg, 720);
  if (phi > 6) return 0;
  return 1 - phi / 6;
}

/* 缸内容积 cm³ */
function cylinderVolume(cyl, thetaDeg) {
  const k = cylinderKinematics(cyl, thetaDeg);
  return V_C_CM3 + PISTON_AREA_MM2 * k.d / 1000;
}
/* 教学用缸压 bar */
function cylinderPressure(cyl, thetaDeg, throttleEff) {
  const phi = cyclePhase(cyl, thetaDeg);
  const V = cylinderVolume(cyl, thetaDeg);
  const load = clamp(throttleEff, 0, 1);
  if (phi < 180) {
    const burn = smoothstep(0, 12, phi);
    const peak = (34 + 30 * load) * (0.9 + 0.1 * Math.sin(phi * 0.1));
    const pExp = peak * Math.pow(Math.max(V, V_TDC * 1.1) / V_TDC, -1.32);
    const pComp = 16 * Math.pow(V_TDC / V, 1.32);
    return lerp(pComp, pExp, burn) + (1 - burn) * 6;
  }
  if (phi < 360) return 1.06 + 0.55 * Math.exp(-Math.max(0, phi - 180) / 26);
  if (phi < 540) return 0.42 + 0.4 * clamp(throttleEff, 0, 1);
  const p0 = 0.72 + 0.28 * clamp(throttleEff, 0, 1);
  const f = (phi - 540) / 180;
  return lerp(p0, p0 * Math.pow(V_BDC / V, 1.34), Math.pow(f, 0.75));
}
