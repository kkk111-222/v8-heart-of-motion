/* ---------------------------- 音频（程序生成） ---------------------------- */
class EngineAudio {
  constructor() {
    this.ctx = null; this.nodes = null; this.enabled = false; this.volume = 0.5;
    this.supported = !!(window.AudioContext || window.webkitAudioContext);
  }
  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);

    // 噪声源
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = 0.7 * last + 0.3 * w; data[i] = last; }
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };

    // 低频轰鸣（曲轴/燃烧基频）
    const rumble = ctx.createOscillator(); rumble.type = 'sawtooth';
    const rumbleLP = ctx.createBiquadFilter(); rumbleLP.type = 'lowpass'; rumbleLP.frequency.value = 320; rumbleLP.Q.value = 2.2;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
    rumble.connect(rumbleLP); rumbleLP.connect(rumbleGain); rumbleGain.connect(master);

    // 中频机械谐波
    const order = ctx.createOscillator(); order.type = 'triangle';
    const orderBP = ctx.createBiquadFilter(); orderBP.type = 'bandpass'; orderBP.frequency.value = 480; orderBP.Q.value = 1.1;
    const orderGain = ctx.createGain(); orderGain.gain.value = 0;
    order.connect(orderBP); orderBP.connect(orderGain); orderGain.connect(master);

    // 燃烧脉冲（噪声 + 点火频率调制）
    const pulseNoise = noise();
    const pulseBP = ctx.createBiquadFilter(); pulseBP.type = 'bandpass'; pulseBP.frequency.value = 170; pulseBP.Q.value = 1.3;
    const pulseGain = ctx.createGain(); pulseGain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt); lfoAmt.connect(pulseGain.gain);
    pulseNoise.connect(pulseBP); pulseBP.connect(pulseGain); pulseGain.connect(master);

    // 进气 / 排气
    const intakeN = noise();
    const intakeBP = ctx.createBiquadFilter(); intakeBP.type = 'bandpass'; intakeBP.frequency.value = 950; intakeBP.Q.value = 0.7;
    const intakeGain = ctx.createGain(); intakeGain.gain.value = 0;
    intakeN.connect(intakeBP); intakeBP.connect(intakeGain); intakeGain.connect(master);

    const exhaustN = noise();
    const exhaustLP = ctx.createBiquadFilter(); exhaustLP.type = 'lowpass'; exhaustLP.frequency.value = 420; exhaustLP.Q.value = 0.9;
    const exhaustGain = ctx.createGain(); exhaustGain.gain.value = 0;
    exhaustN.connect(exhaustLP); exhaustLP.connect(exhaustGain); exhaustGain.connect(master);

    // 启动机
    const starter = ctx.createOscillator(); starter.type = 'sawtooth';
    const starterBP = ctx.createBiquadFilter(); starterBP.type = 'bandpass'; starterBP.frequency.value = 380; starterBP.Q.value = 6;
    const starterGain = ctx.createGain(); starterGain.gain.value = 0;
    starter.connect(starterBP); starterBP.connect(starterGain); starterGain.connect(master);

    [rumble, order, lfo, starter].forEach(o => o.start());
    [pulseNoise, intakeN, exhaustN].forEach(n => n.start());

    this.nodes = { master, comp, rumble, rumbleGain, order, orderGain, lfo, lfoAmt, pulseBP, pulseGain, intakeGain, intakeBP, exhaustGain, exhaustLP, starterGain, starterBP, noiseBuf: buf };
    this.ctx.resume && this.ctx.resume();
  }
  setEnabled(on) {
    if (on && !this.supported) { return false; }
    if (on && !this.ctx) { try { this.build(); } catch (e) { console.warn('audio build failed', e); return false; } }
    this.enabled = !!on;
    if (this.ctx) { if (on) this.ctx.resume(); this.applyGain(); }
    return this.enabled;
  }
  applyGain() {
    if (!this.ctx) return;
    const g = this.nodes.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.enabled ? 0.85 : 0, t, 0.08);
  }
  update(s, pScale) {
    if (!this.enabled || !this.ctx) return;
    const n = this.nodes, t = this.ctx.currentTime, k = 0.04;
    const rpm = Math.max(s.rpm, 0);
    const firing = Math.max(rpm / 15, 8);           // 四冲程 V8：每转 4 次点火 → RPM/15 Hz
    const thr = s.throttleEff, load = s.load;
    const running = s.fuelOn && rpm > 40;

    n.rumble.frequency.setTargetAtTime(Math.max(18, firing * 0.5), t, k);
    n.order.frequency.setTargetAtTime(Math.max(40, firing * 1.5), t, k);
    n.lfo.frequency.setTargetAtTime(firing, t, k);
    n.orderBP.frequency.setTargetAtTime(300 + firing * 0.6, t, k);
    n.pulseBP.frequency.setTargetAtTime(110 + firing * 0.25, t, k);

    const vol = this.volume;
    n.rumbleGain.gain.setTargetAtTime(running ? vol * (0.16 + 0.20 * thr) : 0, t, 0.09);
    n.orderGain.gain.setTargetAtTime(running ? vol * (0.02 + 0.05 * rpm / 7500) : 0, t, 0.09);
    n.pulseGain.gain.setTargetAtTime(running ? vol * (0.10 + 0.14 * load) : 0, t, 0.09);
    n.intakeGain.gain.setTargetAtTime(running ? vol * (0.005 + 0.075 * thr) : 0, t, 0.10);
    n.intakeBP.frequency.setTargetAtTime(700 + 1400 * thr * (0.4 + 0.6 * rpm / 7500), t, 0.1);
    n.exhaustGain.gain.setTargetAtTime(running ? vol * (0.02 + 0.10 * thr + 0.05 * load) : 0, t, 0.10);
    n.exhaustLP.frequency.setTargetAtTime(260 + 700 * thr, t, 0.1);
    n.starterGain.gain.setTargetAtTime(s.starter && s.mode === 'starting' ? vol * 0.10 : 0, t, 0.05);
    n.starterBP.frequency.setTargetAtTime(300 + Math.min(rpm, 400) * 1.6, t, 0.05);
  }
  tick(strength = 1, bright = 0.5) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.nodes.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + 2200 * bright; bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10 * strength * this.volume, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp); bp.connect(g); g.connect(this.nodes.master);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.12);
  }
}
const audio = new EngineAudio();

/* ---------------------------- 车型物理：工况模型 ---------------------------- */
const ADV_PTS = [[600, 10], [1000, 16], [2000, 26], [3000, 31], [4500, 33], [6000, 32], [6800, 29], [7500, 24]];
const advanceCurve = makeSpline(ADV_PTS);

function startEngine() {
  if (state.fuelOn || state.mode === 'starting') return;
  state.starter = true; state.starterTime = 0; state.fuelOn = false;
  state.mode = 'starting'; state.fuelCut = 0;
  state.theta = state.theta; // 保持当前展示角度
  if (state.paused) togglePause(false);
}
function stopEngine() {
  state.fuelOn = false; state.starter = false; state.fuelCut = 0;
  state.throttleEff = 0;
  state.mode = 'off';
}
function toggleEngine() {
  if (state.fuelOn || state.mode === 'starting') stopEngine(); else startEngine();
}

function updateOperating(dt) {
  const rpm = state.omega * 60 / (2 * Math.PI);
  state.rpm = rpm;

  // 启动机
  let tStarter = 0;
  if (state.starter) {
    state.starterTime += dt;
    tStarter = 78 * clamp(1 - state.starterTime / 2.4, 0.25, 1);
    if (rpm > 180) state.fuelOn = true;
    if (rpm > 620 || state.starterTime > 3.2) { state.starter = false; state.starterTime = 0; }
  }

  // 怠速控制器
  let idleThr = 0;
  if (state.fuelOn && rpm < 1200) {
    const err = CFG.idleRpm + 40 - rpm;
    idleThr = clamp(err / 420, 0, 1) * 0.30;
  }
  let demand = Math.max(state.throttle, idleThr);

  // 限转：断油
  if (state.fuelOn && rpm > CFG.limiter) state.fuelCut = 0.10;
  if (state.fuelCut > 0) { state.fuelCut = Math.max(0, state.fuelCut - dt); demand = 0; }
  if (!state.fuelOn) demand = 0;

  state.throttleEff = damp(state.throttleEff, demand, state.fuelOn ? 10 : 6, dt);

  // 燃烧扭矩
  let tComb = 0;
  if (state.fuelOn && state.throttleEff > 0.002) {
    const run = clamp(rpm / 260, 0, 1);
    tComb = torqueCurve(Math.max(rpm, 620)) * state.throttleEff * run;
    if (state.fuelCut > 0) tComb *= 0.15;
  }
  state.tComb = tComb;

  const tFric = 9 + 0.0040 * rpm + 1.6e-7 * rpm * rpm;
  state.tFric = tFric;
  // 附件（发电机、水泵、机油泵）恒定吸收扭矩
  const tAcc = state.fuelOn ? 20 + 0.0016 * rpm : 0;
  state.tAcc = tAcc;
  const tLoad = state.load * 640 * clamp(rpm / 6800, 0, 1.05);
  state.tLoad = tLoad;

  // 微分方程：J dω/dt = T燃烧 − T摩擦 − T附件 − T负载 (+ 启动机)
  const net = tComb + tStarter - tFric - tAcc - tLoad;
  state.omega = Math.max(0, state.omega + net / CFG.inertia * dt);
  if (state.omega < 0.6 && !state.fuelOn && !state.starter) state.omega = 0;

  // 仪表值（注意：输出扭矩不是净加速扭矩）
  const brake = Math.max(0, tComb - tFric);
  state.tq = damp(state.tq, brake, 6, dt);
  const r2 = state.omega * 60 / (2 * Math.PI);
  state.powerKW = state.tq * r2 / 9549.3;
  state.powerHP = state.powerKW * 1.34102;

  // 诊断参数
  state.advance = advanceCurve(clamp(r2, 600, 7500));
  const mapT = clamp(0.235 + 0.745 * state.throttleEff * (0.6 + 0.4 * clamp(r2 / 7500, 0, 1)), 0.2, 1.0);
  state.map = damp(state.map, mapT, 4, dt);
  const afrT = state.fuelOn ? clamp(14.7 - 3.3 * state.throttleEff - (r2 > 6600 ? 0.5 : 0), 11.4, 14.9) : 14.7;
  state.afr = damp(state.afr, afrT, 2.5, dt);
  const coolT = state.fuelOn ? 88 + 9 * state.throttleEff : 26;
  state.coolant = damp(state.coolant, coolT, state.fuelOn ? 0.03 : 0.012, dt);
  const oilT = (0.35 + 3.7 * Math.pow(clamp(r2 / 7500, 0, 1), 0.72)) * (1.28 - 0.28 * clamp(state.coolant / 100, 0, 1));
  state.oil = damp(state.oil, state.fuelOn ? oilT : 0, state.fuelOn ? 3 : 1.2, dt);

  // 状态机
  let mode;
  if (state.starter && !state.fuelOn) mode = 'starting';
  else if (!state.fuelOn) mode = 'off';
  else if (state.starter) mode = 'starting';
  else if (state.fuelCut > 0) mode = 'limit';
  else if (state.omega * 60 / (2 * Math.PI) < 1060) mode = 'idle';
  else mode = 'running';
  state.mode = mode;
}

/* 展示时钟：与工况转速解耦 */
function updateDisplayClock(dt) {
  const rpm = state.rpm;
  let scale = 1;
  switch (state.speedMode) {
    case 'auto': {
      const target = state.camera === 'cylinder' ? CFG.cylMechRpm : CFG.autoMechRpm;
      scale = rpm > 0.5 ? Math.min(1, target / rpm) : 0;
      break;
    }
    case 'slow': scale = rpm > 0.5 ? Math.min(1, 8 / rpm) : 0; break;
    case 'manual': scale = state.manualScale; break;
    case 'real': scale = 1; break;
  }
  if (state.paused || state.dragging) scale = 0;
  state.presentationScale = scale;
  state.prevTheta = state.theta;
  if (scale > 0 && rpm > 0.3 && !state.hidden) {
    state.theta += 6 * rpm * dt * scale;
  }
  state.mechRpm = rpm * scale;
}

/* 点火事件：检查上一角度到当前角度之间跨过的事件（不能只看当前相位） */
let ignitionCounter = 0;
function detectIgnitions(prev, cur) {
  if (cur <= prev || cur - prev > 5000) return;
  const adv = state.advance;
  for (const cyl of CYL) {
    const sparkAt = cyl.Fi - adv;
    let a = Math.floor((prev - sparkAt) / 720) * 720 + sparkAt;
    while (a <= cur) {
      if (a > prev) {
        ignitionCounter++;
        state.sparkPulse[cyl.n] = 1;
        state.ignitionFlash[cyl.n] = performance.now();
        if (audio.enabled && state.presentationScale < 0.35) audio.tick(0.8, 0.6);
        onIgnition(cyl);
      }
      a += 720;
    }
  }
}
