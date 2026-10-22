/* ---------------------------- UI 引用 ---------------------------- */
const $ = id => document.getElementById(id);
const el = {
  hdrState: $('hdrState'), hdrRpm: $('hdrRpm'), hdrMech: $('hdrMech'), hdrScale: $('hdrScale'), hdrAngle: $('hdrAngle'),
  quality: $('quality'), btnSound: $('btnSound'), btnHelp: $('btnHelp'),
  rpmBig: $('rpmBig'), rpmFill: $('rpmFill'), rpmBar: $('rpmBar'), pDot: $('pDot'), pState: $('pState'), pSub: $('pSub'),
  tqVal: $('tqVal'), pwVal: $('pwVal'), pwHp: $('pwHp'), gearTxt: $('gearTxt'),
  throttle: $('throttle'), throttleVal: $('throttleVal'), throttleEff: $('throttleEff'),
  load: $('load'), loadVal: $('loadVal'),
  dTemp: $('dTemp'), dOil: $('dOil'), dAfr: $('dAfr'), dMap: $('dMap'), dAdv: $('dAdv'), dMech: $('dMech'), dScale: $('dScale'), dCyl: $('dCyl'),
  chTorque: $('chTorque'), chPV: $('chPV'),
  cylA: $('cylA'), cylB: $('cylB'),
  tlCyl: $('tlCyl'), tlPhaseName: $('tlPhaseName'), tlAngle: $('tlAngle'), timeline: $('timeline'),
  btnPause: $('btnPause'), btnFlow: $('btnFlow'), btnStart: $('btnStart'), btnCine: $('btnCine'), btnReset: $('btnReset'),
  btnAnno: $('btnAnno'), speedMode: $('speedMode'), manualScale: $('manualScale'), manualWrap: $('manualWrap'),
  manualVal: $('manualVal'), autoScaleTag: $('autoScaleTag'),
  viewName: $('viewName'), viewSub: $('viewSub'), debug: $('debug'), fpsTag: $('fpsTag'),
  soundDot: $('soundDot'), hdrDot: $('hdrDot'), quality2: $('quality2'), btnSound2: $('btnSound2'), btnDebug: $('btnDebug'),
  help: $('help'), helpClose: $('helpClose'), loading: $('loading'), fireOrderTag: $('fireOrderTag')
};

/* ---------------------------- 视图 / 镜头 ---------------------------- */
const VIEW_INFO = {
  section: { name: '机械切面', sub: 'SECTION CUTAWAY' },
  exterior: { name: '外观视图', sub: 'EXTERIOR' },
  explode: { name: '分层爆炸', sub: 'EXPLODED VIEW' }
};

let pausedBeforeExplode = false;

function setView(name, silent) {
  if (!VIEW_INFO[name]) name = 'section';
  state.view = name;
  if (name === 'explode') {
    if (!state.explodeTarget) pausedBeforeExplode = state.paused;
    state.explodeTarget = 1;
    state.paused = true;
  } else {
    if (state.explodeTarget) {
      state.explodeTarget = 0;
      state.paused = pausedBeforeExplode;
    }
  }
  document.querySelectorAll('.viewbtn').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (el.quality2) el.quality2.value = name;
  el.viewName.textContent = VIEW_INFO[name].name;
  el.viewSub.textContent = VIEW_INFO[name].sub;
  if (name === 'exterior') state.userMovedCamera = state.userMovedCamera;
  syncPauseUI();
  // 进入/退出爆炸图时重新构图（工况不变，只调整取景）
  if (state.camera === 'whole' && !silent) {
    setCameraPose('whole', 900);
  }
}

function setCamera(name, duration = 1100) {
  if (!VIEW_META[name]) name = 'whole';
  state.camera = name;
  document.querySelectorAll('.cambtn').forEach(b => b.classList.toggle('on', b.dataset.cam === name));
  setCameraPose(name, duration);
  state.userMovedCamera = false;
  if (state.cinematic === null) camState.driftT = 0;
}

function resetCamera() {
  setView('section');
  setCamera('whole', 900);
  controls.target.set(...viewPose('whole').target.toArray());
  state.userMovedCamera = false;
}

/* ---------------------------- 气缸状态带 ---------------------------- */
const cellEls = {};
function buildCylinderCells() {
  const make = (container, nums) => {
    nums.forEach(n => {
      const cyl = CYL_BY_N[n];
      const d = document.createElement('div');
      d.className = 'cylcell';
      d.dataset.cyl = String(n);
      d.innerHTML = `<div class="n">${n}<span style="font-size:8px;color:#5C6877;font-family:var(--mono)">${cyl.bank}</span></div>
        <div class="ph">—</div><div class="bar"><i></i></div>`;
      d.addEventListener('click', () => selectCylinder(n, true));
      container.appendChild(d);
      cellEls[n] = { root: d, ph: d.querySelector('.ph'), bar: d.querySelector('.bar i'), fireAt: -1e9 };
    });
  };
  make(el.cylA, CFG.bankNumbers.A);
  make(el.cylB, CFG.bankNumbers.B);
}

function selectCylinder(n, focus) {
  state.selected = n;
  for (const k in cellEls) cellEls[k].root.classList.toggle('sel', Number(k) === n);
  if (focus && !state.explodeTarget) {
    setCamera('cylinder', 1000);
    // 单缸观察：进一步减速
  }
  if (focus) state.userMovedCamera = false;
}

/* ---------------------------- 暂停 / 播放 ---------------------------- */
function togglePause(force) {
  const next = typeof force === 'boolean' ? force : !state.paused;
  state.paused = next;
  syncPauseUI();
  return state.paused;
}
function syncPauseUI() {
  el.btnPause.innerHTML = state.paused ? '▶ 继续机构' : '⏸ 暂停机构';
  el.btnPause.classList.toggle('on', state.paused);
}

/* ---------------------------- 点火反馈 ---------------------------- */
const pointLights = [];
function onIgnition(cyl) {
  const entry = cellEls[cyl.n];
  if (entry) {
    entry.root.classList.remove('fire');
    void entry.root.offsetWidth;
    entry.root.classList.add('fire');
  }
  state.impact = Math.min(1, (state.impact || 0) + 0.55);
  if (audio.enabled && state.mode === 'starting') audio.tick(1.2, 0.75);
}

/* ---------------------------- 机械姿态 ---------------------------- */
const _tmpKin = { s: 0, d: 0, eta: 0, bigX: 0, bigY: 0, rodAngle: 0, pinX: 0, pinY: 0 };
const _lp = new THREE.Vector3();

function updateMechanics(time) {
  const th = state.theta;
  P.crank.rotation.z = -rad(th);

  for (const c of P.cylinders) {
    const cyl = c.cyl;
    const k = cylinderKinematics(cyl, th, _tmpKin);
    c.piston.position.set(0, k.s, cyl.z);
    c.rod.position.set(k.bigX, k.bigY, cyl.z);
    c.rod.rotation.z = k.rodAngle;

    const liftIn = intakeLift(cyl, th) * CFG.camLift;
    const liftEx = exhaustLift(cyl, th) * CFG.camLift;
    for (const v of c.valves) {
      const lift = v.isIntake ? liftIn : liftEx;
      v.group.position.y = CFG.valveTipY - lift;
      const h = Math.max(4, 24 - lift);
      v.spring.position.y = 258 + h / 2;
      v.spring.scale.y = h / 24;
    }

    // 燃烧辉光
    const burn = combustionIntensity(cyl, th);
    const spark = state.fuelOn ? sparkIntensity(cyl, th, state.advance) : 0;
    c.glow.material.opacity = burn * 0.9;
    const gs = 26 + 86 * burn;
    c.glow.scale.set(gs, gs * 0.75, 1);
    c.glow.visible = burn > 0.012;
    c.spark.material.opacity = spark * 0.95;
    const ss = 9 + 30 * spark;
    c.spark.scale.set(ss, ss, 1);
    c.spark.visible = spark > 0.02;

    // 选中高亮
    const showHl = state.selected === cyl.n && state.view !== 'exterior';
    c.hl.visible = showHl;
    if (showHl) {
      c.hl.material.opacity = 0.28 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2.2));
    }

    // 点火脉冲衰减
    state.sparkPulse[cyl.n] = Math.max(0, (state.sparkPulse[cyl.n] || 0) - 0.06);
  }

  for (const cam of P.cams) {
    cam.group.rotation.z = rad(180 - (th - cam.center) / 2);
  }

  // 两个点光源跟随最强的燃烧
  let best = null, bestI = 0, second = null, secondI = 0;
  for (const c of P.cylinders) {
    const i = c.glow.material.opacity;
    if (i > bestI) { second = best; secondI = bestI; best = c; bestI = i; }
    else if (i > secondI) { second = c; secondI = i; }
  }
  for (let i = 0; i < 2; i++) {
    if (!pointLights[i]) {
      const L = new THREE.PointLight(0xffa95e, 0, 46, 2);
      scene.add(L);
      pointLights[i] = L;
    }
    const src = i === 0 ? best : second;
    const inten = i === 0 ? bestI : secondI;
    const L = pointLights[i];
    if (src && inten > 0.02) {
      src.glow.getWorldPosition(_lp);
      L.position.copy(_lp).add(new THREE.Vector3(0, 1.2, 0));
      L.intensity = 34 * inten;
    } else L.intensity = 0;
  }

  // 节气门蝶阀
  if (P.butterfly) P.butterfly.rotation.z = rad(8 + 76 * state.throttleEff);
}

/* ---------------------------- 气流粒子 ---------------------------- */
function updateFlows(dt, time) {
  const active = state.flow && !state.explodeTarget && state.mode !== 'off';
  for (const c of P.cylinders) {
    const cyl = c.cyl;
    const phi = cyclePhase(cyl, state.theta);
    const inOpen = phi > CFG.intakeOpen && phi < CFG.intakeClose;
    const exOpen = phi > CFG.exhaustOpen && phi < CFG.exhaustClose;
    const thr = state.throttleEff;
    updateFlowBand(c.flow.intake, active && inOpen && thr > 0.03, time, 0.62, dt);
    updateFlowBand(c.flow.exhaust, active && exOpen, time, 0.5, dt);
  }
}
function updateFlowBand(band, on, time, speed, dt) {
  const mat = band.mat;
  const target = on ? 0.85 : 0;
  mat.opacity = damp(mat.opacity, target, 8, dt);
  if (mat.opacity < 0.02) { band.pts.visible = false; return; }
  band.pts.visible = true;
  const pos = band.geo.attributes.position.array;
  for (let i = 0; i < band.offsets.length; i++) {
    const t = pmod(band.offsets[i] + time * speed, 1);
    band.curve.getPoint(t, _lp);
    pos[i * 3] = _lp.x; pos[i * 3 + 1] = _lp.y; pos[i * 3 + 2] = _lp.z;
  }
  band.geo.attributes.position.needsUpdate = true;
}

/* ---------------------------- 覆盖件 / 爆炸 ---------------------------- */
let coverT = 0, camCoverT = 0;
function updateCoverState(dt) {
  const coverTarget = state.view === 'exterior' ? 1 : 0;
  const camCoverTarget = state.view === 'section' ? 0 : 1;
  coverT = damp(coverT, coverTarget, 5.5, dt);
  camCoverT = damp(camCoverT, camCoverTarget, 5.5, dt);

  const fade = (m, t) => {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const tr = t < 0.995;
    mats.forEach(mm => {
      if (mm.transparent !== tr) { mm.transparent = tr; mm.needsUpdate = true; }
      mm.opacity = t;
      mm.depthWrite = !tr;
      if (!tr) mm.side = THREE.DoubleSide;
    });
    m.visible = t > 0.015;
  };
  for (const m of P.covers) fade(m, coverT);
  for (const m of P.camCovers) fade(m, camCoverT);

  // 爆炸
  state.explode = damp(state.explode, state.explodeTarget, 2.4, dt);
  if (Math.abs(state.explode - state.explodeTarget) < 0.002) state.explode = state.explodeTarget;
  const e = easeInOut(clamp(state.explode, 0, 1));
  for (const item of P.explode) {
    item.obj.position.copy(item.base).addScaledVector(item.offset, e);
  }
}

/* ---------------------------- 图表 ---------------------------- */
const chartCtx = {
  tq: el.chTorque.getContext('2d'),
  pv: el.chPV.getContext('2d')
};
let pvCache = null, pvKey = '';

function dprSet(canvas, w, h) {
  canvas.width = w; canvas.height = h;
}

function drawTorqueChart() {
  const cv = el.chTorque, ctx = chartCtx.tq;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const padL = 46, padR = 46, padT = 18, padB = 30;
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
  const rpmMin = 600, rpmMax = 7800;
  const nmMax = 600, kwMax = 400;
  const X = r => x0 + (clamp(r, rpmMin, rpmMax) - rpmMin) / (rpmMax - rpmMin) * (x1 - x0);
  const YN = v => y0 + (clamp(v, 0, nmMax) / nmMax) * (y1 - y0);
  const YK = v => y0 + (clamp(v, 0, kwMax) / kwMax) * (y1 - y0);

  // 网格
  ctx.strokeStyle = 'rgba(232,237,242,0.055)';
  ctx.lineWidth = 1;
  ctx.font = '21px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(126,140,154,0.72)';
  ctx.textAlign = 'center';
  for (let r = 1000; r <= 8000; r += 1000) {
    const x = X(r);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke();
    ctx.fillText(String(r), x, y0 + 22);
  }
  ctx.textAlign = 'right';
  for (let v = 0; v <= 600; v += 200) {
    const y = YN(v);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillText(String(v), x0 - 8, y + 5);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,171,94,0.7)';
  for (let v = 0; v <= 400; v += 100) {
    ctx.fillText(String(v), x1 + 8, YK(v) + 5);
  }

  // 红线区
  ctx.fillStyle = 'rgba(228,90,82,0.10)';
  ctx.fillRect(X(7000), y1, X(rpmMax) - X(7000), y0 - y1);
  ctx.fillStyle = 'rgba(228,90,82,0.55)';
  ctx.font = '20px ui-monospace, monospace';
  ctx.fillText('REDLINE', X(7020), y1 + 16);

  // 全油门扭矩
  const drawCurve = (fn, Y, color, width, dash) => {
    ctx.beginPath();
    ctx.setLineDash(dash || []);
    ctx.lineWidth = width; ctx.strokeStyle = color;
    for (let r = rpmMin; r <= rpmMax; r += 50) {
      const x = X(r), y = Y(fn(r));
      if (r === rpmMin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  drawCurve(r => torqueCurve(r), YN, 'rgba(255,171,94,0.92)', 2.6);
  drawCurve(r => torqueCurve(r) * 0.76, YN, 'rgba(255,171,94,0.30)', 1.4, [5, 5]);

  // 功率（由扭矩换算，保证一致）
  ctx.beginPath(); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(112,216,229,0.92)';
  for (let r = rpmMin; r <= rpmMax; r += 50) {
    const kw = torqueCurve(r) * r / 9549.3;
    const x = X(r), y = YK(kw);
    if (r === rpmMin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 当前工作点
  const r = state.rpm;
  if (r > 40) {
    const x = X(r);
    // 当前油门下的扭矩
    const curTq = torqueCurve(Math.max(r, 620)) * state.throttleEff;
    ctx.beginPath();
    ctx.arc(x, YN(curTq), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD2A3'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,171,94,0.6)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, YK(state.powerKW), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#BFF3FA'; ctx.fill();
    // 竖直指示
    ctx.strokeStyle = 'rgba(232,237,242,0.22)';
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke(); ctx.setLineDash([]);
  }

  // 轴标签
  ctx.fillStyle = 'rgba(126,140,154,0.55)';
  ctx.font = '19px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RPM', (x0 + x1) / 2, H - 4);

}

function buildPV() {
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const phi = i / 240 * 720;
    // 用当前选定缸的 θ 反推：直接以相位构造
    const V = V_C_CM3 + PISTON_AREA_MM2 * pistonDisplacementFromPhase(phi) / 1000;
    const p = pressureFromPhase(phi, state.throttleEff, V);
    pts.push([V, p]);
  }
  pvCache = pts;
}
function pistonDisplacementFromPhase(phi) {
  // φ：0 = 做功上止点。压缩/做功在 540..720 与 0..180 之间，活塞位移只与角度相关
  const theta = phi; // 与具体缸无关：位移相对 TDC 以 360° 为周期
  const eta = rad(theta);
  const r = CFG.crankR, l = CFG.rodLength;
  const s = r * Math.cos(eta) + Math.sqrt(l * l - r * r * Math.sin(eta) ** 2);
  return (r + l) - s;
}
function pressureFromPhase(phi, thr, V) {
  const load = clamp(thr, 0, 1);
  if (phi < 180) {
    const burn = smoothstep(0, 12, phi);
    const peak = (34 + 30 * load);
    const pExp = peak * Math.pow(Math.max(V, V_TDC * 1.1) / V_TDC, -1.32);
    const pComp = 16 * Math.pow(V_TDC / V, 1.32);
    return lerp(pComp, pExp, burn) + (1 - burn) * 6;
  }
  if (phi < 360) return 1.06 + 0.55 * Math.exp(-Math.max(0, phi - 180) / 26);
  if (phi < 540) return 0.42 + 0.4 * load;
  const p0 = 0.72 + 0.28 * load;
  const f = (phi - 540) / 180;
  return lerp(p0, p0 * Math.pow(V_BDC / V, 1.34), Math.pow(f, 0.75));
}

function drawPVChart() {
  const cv = el.chPV, ctx = chartCtx.pv;
  const W = cv.width, H = cv.height;
  const key = state.selected + '|' + state.throttleEff.toFixed(2);
  if (key !== pvKey) { pvKey = key; buildPV(); }
  const pts = pvCache;
  ctx.clearRect(0, 0, W, H);
  const padL = 46, padR = 14, padT = 12, padB = 28;
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
  let vMax = 0, pMax = 0;
  for (const [V, p] of pts) { vMax = Math.max(vMax, V); pMax = Math.max(pMax, p); }
  vMax = Math.ceil(vMax / 50) * 50; pMax = Math.ceil(pMax / 10) * 10;
  const X = v => x0 + (v / vMax) * (x1 - x0);
  const Y = p => y0 - (p / pMax) * (y0 - y1);

  ctx.strokeStyle = 'rgba(232,237,242,0.055)'; ctx.lineWidth = 1;
  ctx.font = '20px ui-monospace, monospace'; ctx.fillStyle = 'rgba(126,140,154,0.7)';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const v = vMax * i / 4, x = X(v);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke();
    ctx.fillText(String(Math.round(v)), x, y0 + 20);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const p = pMax * i / 4, y = Y(p);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillText(p.toFixed(0), x0 - 8, y + 5);
  }
  // P-V 循环
  ctx.beginPath();
  pts.forEach(([V, p], i) => { const x = X(V), y = Y(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.fillStyle = 'rgba(228,90,82,0.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(228,90,82,0.85)'; ctx.lineWidth = 2.4; ctx.stroke();

  // 当前点
  const phi = cyclePhase(CYL_BY_N[state.selected], state.theta);
  const V = V_C_CM3 + PISTON_AREA_MM2 * pistonDisplacementFromPhase(phi) / 1000;
  const p = pressureFromPhase(phi, state.throttleEff, V);
  ctx.beginPath(); ctx.arc(X(V), Y(p), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFC9C5'; ctx.fill();
  ctx.strokeStyle = 'rgba(228,90,82,0.55)'; ctx.lineWidth = 4; ctx.stroke();

  ctx.fillStyle = 'rgba(126,140,154,0.55)'; ctx.textAlign = 'center';
  ctx.font = '19px ui-monospace, monospace';
  ctx.fillText('V / cm³', (x0 + x1) / 2, H - 2);
  ctx.textAlign = 'left';
  ctx.fillText('p / bar', 4, y1 + 10);
  ctx.fillStyle = 'rgba(255,171,94,0.75)';
  ctx.fillText(`φ ${phi.toFixed(0)}°`, x0 + 6, y0 - 8);
}

/* ---------------------------- 720° 时间轴 ---------------------------- */
const tlCtx = el.timeline.getContext('2d');
let tlDragging = false;

function tlGeometry() {
  const W = el.timeline.width, H = el.timeline.height;
  return { W, H, x0: 8, x1: W - 8, yTop: 6, yBot: H - 10 };
}
function drawTimeline() {
  const { W, H, x0, x1, yTop, yBot } = tlGeometry();
  const ctx = tlCtx;
  ctx.clearRect(0, 0, W, H);
  const X = phi => x0 + phi / 720 * (x1 - x0);

  const bands = [
    [0, 180, '#FFAB5E', '做功'],
    [180, 360, '#B08F76', '排气'],
    [360, 540, '#70D8E5', '进气'],
    [540, 720, '#8FA6BA', '压缩']
  ];
  for (const [a, b, color, name] of bands) {
    ctx.fillStyle = color + '22';
    ctx.fillRect(X(a), yTop, X(b) - X(a), yBot - yTop);
    ctx.fillStyle = color + '99';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, (X(a) + X(b)) / 2, yTop + 22);
  }
  // 刻度
  ctx.strokeStyle = 'rgba(232,237,242,0.10)';
  ctx.lineWidth = 1;
  for (let a = 0; a <= 720; a += 90) {
    ctx.beginPath(); ctx.moveTo(X(a), yBottomSafe(yBot)); ctx.lineTo(X(a), yBot); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,237,242,0.06)';
    ctx.beginPath(); ctx.moveTo(X(a), yTop); ctx.lineTo(X(a), yTop + 6); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,237,242,0.10)';
  }
  // 气门窗口
  const vy = yBot - 14;
  ctx.fillStyle = 'rgba(112,216,229,0.55)';
  ctx.fillRect(X(CFG.intakeOpen), vy, X(CFG.intakeClose) - X(CFG.intakeOpen), 5);
  ctx.fillStyle = 'rgba(255,171,94,0.5)';
  ctx.fillRect(X(CFG.exhaustOpen), vy + 7, X(CFG.exhaustClose) - X(CFG.exhaustOpen), 5);
  // 重叠区
  ctx.fillStyle = 'rgba(232,237,242,0.13)';
  ctx.fillRect(X(350), vy, X(370) - X(350), 12);
  // 上止点 / 点火
  ctx.strokeStyle = 'rgba(232,237,242,0.32)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(X(0) + 0.5, yTop); ctx.lineTo(X(0) + 0.5, yBot); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(720) - 0.5, yTop); ctx.lineTo(X(720) - 0.5, yBot); ctx.stroke();
  ctx.setLineDash([]);
  const sparkPhi = pmod(-state.advance, 720);
  ctx.beginPath();
  const sx = X(sparkPhi), sy = yTop + 2;
  ctx.moveTo(sx, sy + 9); ctx.lineTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.closePath();
  ctx.fillStyle = 'rgba(255,214,170,0.95)'; ctx.fill();

  // 游标
  const cyl = CYL_BY_N[state.selected];
  const phi = cyclePhase(cyl, state.theta);
  const px = X(phi);
  ctx.strokeStyle = '#EAF7FA'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(px, yTop - 2); ctx.lineTo(px, yBot + 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(px, yTop + 4, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = '#EAF7FA'; ctx.fill();
}
function yBottomSafe(y) { return y - 22; }

function timelineSetFromX(clientX) {
  const rect = el.timeline.getBoundingClientRect();
  const { x0, x1 } = tlGeometry();
  const ratio = clamp((clientX - rect.left) / rect.width * el.timeline.width, 0, 1e9);
  // 换算到画布坐标空间
  const canvasX = (clientX - rect.left) / rect.width * el.timeline.width;
  const phi = clamp((canvasX - x0) / (x1 - x0), 0, 1) * 720;
  const cyl = CYL_BY_N[state.selected];
  const base = state.theta - cyclePhase(cyl, state.theta);
  state.theta = base + cyl.Fi + phi;
  state.prevTheta = state.theta;
  state.paused = true;
  syncPauseUI();
  updateMechanics(performance.now() / 1000);
  updateUI(true);
}
el.timeline.addEventListener('pointerdown', e => {
  endCinematic('用户拖动时间轴');
  tlDragging = true;
  el.timeline.setPointerCapture(e.pointerId);
  timelineSetFromX(e.clientX);
});
el.timeline.addEventListener('pointermove', e => { if (tlDragging) timelineSetFromX(e.clientX); });
el.timeline.addEventListener('pointerup', e => { tlDragging = false; });
el.timeline.addEventListener('pointercancel', () => { tlDragging = false; });

/* ---------------------------- UI 刷新 ---------------------------- */
function fmt(v, d = 0) { return v.toFixed(d); }

function updateUI(force) {
  const s = state;
  const rpm = s.rpm;
  // 顶栏
  const stateText = { off: '熄火', starting: '启动中', idle: '怠速', running: '运行', limit: '限转' }[s.mode] || '熄火';
  el.hdrState.childNodes[1] ? (el.hdrState.childNodes[1].textContent = ' ' + stateText) : (el.hdrState.textContent = stateText);
  el.hdrDot.className = 'dot ' + (s.mode === 'off' ? 'off' : s.mode === 'limit' ? 'limit' : s.mode === 'starting' ? 'hot' : 'run');
  el.hdrRpm.innerHTML = Math.round(rpm) + '<em>RPM</em>';
  el.hdrMech.innerHTML = Math.round(s.mechRpm) + '<em>RPM</em>';
  el.hdrScale.textContent = s.presentationScale.toFixed(3) + '×';
  el.hdrAngle.textContent = pmod(s.theta, 720).toFixed(1) + '°';

  // 面板
  const big = Math.round(rpm);
  if (el.rpmBig.textContent !== String(big)) el.rpmBig.textContent = big;
  el.rpmFill.style.width = clamp(rpm / 8000 * 100, 0, 100) + '%';
  el.rpmBar.classList.toggle('limit', rpm > CFG.redline * 0.97);
  el.pDot.className = 'dot ' + (s.mode === 'off' ? 'off' : s.mode === 'limit' ? 'limit' : s.mode === 'starting' ? 'hot' : 'run');
  el.pState.textContent = stateText;
  el.pSub.textContent = s.mode === 'off' ? 'FUEL OFF' : s.mode === 'limit' ? 'LIMITER CUT' : s.mode === 'starting' ? 'STARTER' : 'FUEL ON · IDLE CTRL';
  el.gearTxt.textContent = s.fuelCut > 0 ? 'LIMITER · FUEL CUT' : s.mode === 'starting' ? 'STARTER ENGAGED' : rpm < 1000 ? 'IDLE CTRL · ACTIVE' : 'WOT MAP · CLOSED LOOP';
  el.tqVal.innerHTML = fmt(s.tq, 0) + '<em>Nm</em>';
  el.pwVal.innerHTML = fmt(s.powerKW, 0) + '<em>kW</em>';
  el.pwHp.textContent = fmt(s.powerHP, 0) + ' hp';

  if (document.activeElement !== el.throttle) {
    el.throttle.value = String(Math.round(s.throttle * 100));
  }
  el.throttleVal.textContent = String(Math.round(s.throttle * 100));
  el.throttleEff.textContent = '· 有效 ' + Math.round(s.throttleEff * 100) + '%';
  if (document.activeElement !== el.load) el.load.value = String(Math.round(s.load * 100));
  el.loadVal.textContent = String(Math.round(s.load * 100));

  el.dTemp.innerHTML = fmt(s.coolant, 0) + '<em>°C</em>';
  el.dOil.innerHTML = fmt(s.oil, 1) + '<em>bar</em>';
  el.dAfr.innerHTML = fmt(s.afr, 1);
  el.dMap.innerHTML = fmt(s.map, 2) + '<em>bar</em>';
  el.dAdv.innerHTML = fmt(s.advance, 0) + '<em>°</em>';
  el.dMech.innerHTML = fmt(s.mechRpm, 0) + '<em>RPM</em>';
  el.dScale.innerHTML = s.presentationScale.toFixed(3) + '<em>×</em>';
  el.dCyl.textContent = '#' + s.selected;

  // 八缸状态带
  for (const cyl of CYL) {
    const c = cellEls[cyl.n];
    if (!c) continue;
    const phi = cyclePhase(cyl, s.theta);
    const ph = phaseOfCycle(phi);
    c.ph.textContent = PHASE_NAMES[ph];
    c.bar.style.width = (phi / 720 * 100).toFixed(1) + '%';
    c.bar.style.background = PHASE_COLORS[ph];
    c.root.classList.toggle('sel', s.selected === cyl.n);
  }

  // 时间轴文案
  const sc = CYL_BY_N[s.selected];
  const phi = cyclePhase(sc, s.theta);
  el.tlCyl.textContent = '#' + s.selected;
  el.tlPhaseName.textContent = PHASE_NAMES[phaseOfCycle(phi)];
  el.tlAngle.textContent = phi.toFixed(1) + '° / 720°';
  el.tlPhaseName.style.color = PHASE_COLORS[phaseOfCycle(phi)];

  // 手工倍率 UI
  el.autoScaleTag.textContent = s.speedMode === 'auto' ? '目标 ' + (s.camera === 'cylinder' ? CFG.cylMechRpm : CFG.autoMechRpm) + ' RPM'
    : s.speedMode === 'slow' ? '目标 8 RPM' : s.speedMode === 'real' ? '真实 1×' : '倍率 ' + s.manualScale.toFixed(3) + '×';

  el.btnPause.classList.toggle('on', s.paused);
  el.btnFlow.classList.toggle('on', s.flow);
  el.btnFlow.textContent = s.flow ? '开' : '关';
  el.btnAnno.classList.toggle('on', s.annotations);
  el.btnStart.textContent = (s.fuelOn || s.mode === 'starting') ? '熄火' : '启动发动机';
  el.btnStart.classList.toggle('amber', !(s.fuelOn || s.mode === 'starting'));
  el.btnSound.classList.toggle('on', s.sound);
  el.btnSound2.classList.toggle('on', s.sound);
  el.btnSound.firstChild.nextSibling.textContent = s.sound ? '声音 开' : '声音 关';
  el.soundDot.className = 'dot ' + (s.sound ? 'run' : 'off');
}
