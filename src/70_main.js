/* ---------------------------- 交互绑定 ---------------------------- */
function setPreset(name) {
  const map = {
    idle: [0, 0], cruise: [0.22, 0.18], wot: [1, 0.5], limit: [1, 0]
  };
  if (!map[name]) { document.querySelectorAll('.presets button').forEach(b => b.classList.remove('on')); return; }
  const [t, l] = map[name];
  state.throttle = t; state.load = l;
  el.throttle.value = String(Math.round(t * 100));
  el.load.value = String(Math.round(l * 100));
  document.querySelectorAll('.presets button').forEach(b => b.classList.toggle('on', b.dataset.preset === name));
}

function toggleSound() {
  if (!audio.supported) {
    window.__pushErr('当前浏览器不支持 Web Audio，声音功能不可用。');
    return;
  }
  state.sound = !state.sound;
  const ok = audio.setEnabled(state.sound);
  if (!ok) state.sound = false;
  audio.volume = state.volume;
  updateUI(true);
}

function bindUI() {
  el.throttle.addEventListener('input', e => {
    state.throttle = +e.target.value / 100;
    endCinematic('用户操作油门');
    setPreset(null);
  });
  el.load.addEventListener('input', e => {
    state.load = +e.target.value / 100;
    endCinematic('用户操作负载');
    setPreset(null);
  });
  document.querySelectorAll('.presets button').forEach(b => {
    b.addEventListener('click', () => { endCinematic('用户切换预设'); setPreset(b.dataset.preset); });
  });

  el.btnStart.addEventListener('click', () => {
    endCinematic('用户启动/熄火');
    toggleEngine();
    updateUI(true);
  });
  el.btnCine.addEventListener('click', () => {
    if (state.cinematic) endCinematic('用户停止演示'); else startCinematic();
  });
  el.btnReset.addEventListener('click', () => { endCinematic('用户复位'); resetCamera(); });
  el.btnPause.addEventListener('click', () => { endCinematic('用户暂停'); togglePause(); });

  document.querySelectorAll('.viewbtn').forEach(b => {
    b.addEventListener('click', () => { endCinematic('用户切换视图'); setView(b.dataset.view); });
  });
  el.quality2.addEventListener('change', e => { endCinematic('用户切换视图'); setView(e.target.value); });
  document.querySelectorAll('.cambtn').forEach(b => {
    b.addEventListener('click', () => { endCinematic('用户切换镜头'); setCamera(b.dataset.cam, 1100); });
  });

  document.querySelectorAll('[data-step]').forEach(b => {
    b.addEventListener('click', () => {
      endCinematic('用户步进');
      state.paused = true; syncPauseUI();
      state.theta += Number(b.dataset.step);
      state.prevTheta = state.theta;
      updateMechanics(performance.now() / 1000);
      updateUI(true); drawTimeline();
    });
  });

  el.btnFlow.addEventListener('click', () => { state.flow = !state.flow; updateUI(true); });
  el.btnAnno.addEventListener('click', () => { state.annotations = !state.annotations; updateUI(true); });
  el.btnSound.addEventListener('click', toggleSound);
  el.btnSound2.addEventListener('click', toggleSound);
  el.btnDebug.addEventListener('click', () => { el.debug.classList.toggle('show'); });

  el.speedMode.addEventListener('change', e => {
    state.speedMode = e.target.value;
    el.manualWrap.style.display = state.speedMode === 'manual' ? 'flex' : 'none';
    updateUI(true);
  });
  el.manualScale.addEventListener('input', e => {
    state.manualScale = +e.target.value / 100;
    el.manualVal.textContent = state.manualScale.toFixed(3) + '×';
    state.speedMode = 'manual';
    el.speedMode.value = 'manual';
    el.manualWrap.style.display = 'flex';
    updateUI(true);
  });

  el.quality.addEventListener('change', e => { applyQuality(e.target.value); });
  el.helpClose.addEventListener('click', () => el.help.classList.remove('show'));
  el.help.addEventListener('click', e => { if (e.target === el.help) el.help.classList.remove('show'); });
  el.btnHelp.addEventListener('click', () => el.help.classList.toggle('show'));

  const vol = document.getElementById('volume');
  if (vol) vol.addEventListener('input', e => {
    state.volume = +e.target.value / 100;
    audio.volume = state.volume;
    const lab = document.getElementById('volVal');
    if (lab) lab.textContent = e.target.value;
    if (state.sound) audio.setEnabled(true);
  });

  canvas.addEventListener('pointerdown', () => { endCinematic('用户接管镜头'); });

  // 点击气缸选择（Raycaster）
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downPos = null;
  canvas.addEventListener('pointerdown', e => { downPos = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6 || state.explodeTarget) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const targets = [];
    for (const c of P.cylinders) { targets.push(c.piston, c.rod); c.valves.forEach(v => targets.push(v.group)); }
    const hits = ray.intersectObjects(targets, true);
    if (hits.length) {
      let obj = hits[0].object, found = null;
      while (obj && !found) {
        const c = P.cylinders.find(cc => cc.piston === obj || cc.rod === obj || cc.valves.some(v => v.group === obj));
        if (c) found = c; else obj = obj.parent;
      }
      if (found) { endCinematic('用户选择气缸'); selectCylinder(found.cyl.n, true); updateUI(true); }
    }
  });

  // 键盘
  window.addEventListener('keydown', e => {
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || t.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || e.code === 'Space') { e.preventDefault(); endCinematic('用户暂停'); togglePause(); return; }
    if (k === 'r') { endCinematic('用户复位'); resetCamera(); return; }
    if (k === 'c') { endCinematic('用户切换视图'); setView(state.view === 'section' ? 'exterior' : 'section'); return; }
    if (k === 'e') { endCinematic('用户切换视图'); setView(state.view === 'explode' ? 'section' : 'explode'); return; }
    if (k === 'm') { toggleSound(); return; }
    if (k === 'd') { el.debug.classList.toggle('show'); return; }
    if (k === '?') { el.help.classList.toggle('show'); return; }
    if (['1', '2', '3', '4'].includes(k)) {
      const names = ['whole', 'crank', 'cylinder', 'valvetrain'];
      endCinematic('用户切换镜头');
      setCamera(names[Number(k) - 1], 1100);
      return;
    }
    if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      const step = (e.shiftKey ? 15 : 1) * (k === 'arrowleft' ? -1 : 1);
      state.paused = true; syncPauseUI();
      state.theta += step; state.prevTheta = state.theta;
      updateMechanics(performance.now() / 1000); updateUI(true); drawTimeline();
    }
  });
}

/* ---------------------------- 电影演示 ---------------------------- */
const CINE_STEPS = [
  {
    t: 0.0, fn: () => {
      if (!state.fuelOn) startEngine();
      state.throttle = 0; state.load = 0;
      setPreset('idle');
      setView('section');
      setCamera('whole', 1400);
    }
  },
  { t: 4.2, fn: () => { setCamera('crank', 1400); } },
  {
    t: 9.2, fn: () => {
      selectCylinder(1, false);
      setCamera('cylinder', 1400);
    }
  },
  {
    t: 15.2, fn: () => {
      setCamera('whole', 1400);
      state.throttle = 0.72; state.load = 0.35;
      el.throttle.value = '72'; el.load.value = '35';
      setPreset(null);
    }
  },
  {
    t: 20.0, fn: () => {
      state.throttle = 0.06; state.load = 0.05;
      el.throttle.value = '6'; el.load.value = '5';
      setCamera('whole', 1500);
    }
  }
];

function startCinematic() {
  if (state.explodeTarget) setView('section');
  state.cinematic = { t: 0, idx: 0 };
  el.btnCine.classList.add('on');
  el.btnCine.textContent = '停止演示';
  camState.driftT = 0;
  state.userMovedCamera = false;
}
function endCinematic(reason) {
  if (!state.cinematic) return;
  state.cinematic = null;
  el.btnCine.classList.remove('on');
  el.btnCine.textContent = '电影演示';
}
function updateCinematic(dt) {
  const c = state.cinematic;
  if (!c) return;
  c.t += dt;
  while (c.idx < CINE_STEPS.length && c.t >= CINE_STEPS[c.idx].t) {
    CINE_STEPS[c.idx].fn();
    c.idx++;
  }
  if (c.t > 23.5) endCinematic('演示结束');
}

/* ---------------------------- 主循环 ---------------------------- */
let lastT = performance.now();
let clockT = 0;
let uiAccum = 0, chartAccum = 0;
let fpsFrames = 0, fpsTimer = 0, fpsValue = 60;
let degraded = false, lowFpsTime = 0;

function updateDebug() {
  if (window.__SIM__) return;
  if (!el.debug.classList.contains('show')) return;
  el.debug.textContent =
    `FPS ${fpsValue.toFixed(0)}  ·  calls ${renderer.info.render.calls}  ·  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n` +
    `工况 ${state.rpm.toFixed(0)} RPM  机构 ${state.mechRpm.toFixed(1)} RPM  ×${state.presentationScale.toFixed(3)}\n` +
    `θ ${state.theta.toFixed(1)}°  φ#${state.selected} ${cyclePhase(CYL_BY_N[state.selected], state.theta).toFixed(1)}°\n` +
    `dpr ${renderer.getPixelRatio().toFixed(2)}  post ${usePost ? 'on' : 'off'}  env ${envReady ? 'on' : 'off'}`;
}

/* 单步模拟：把“状态推进”与“渲染”分离，便于自动化校验 */
function stepSim(dt) {
  clockT += dt;
  updateCinematic(dt);
  updateOperating(dt);
  updateDisplayClock(dt);
  detectIgnitions(state.prevTheta, state.theta);
  updateMechanics(clockT);
  updateFlows(dt, clockT);
  updateCoverState(dt);
  updateCamera(dt, clockT);
  updateAnnotations();
  state.impact = damp(state.impact || 0, 0, 6, dt);
  const fov = 31 - state.impact * 0.75;
  if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(Math.max(raw, 0), 1 / 20);

  // FPS
  fpsFrames++; fpsTimer += raw;
  if (fpsTimer > 0.5) {
    fpsValue = fpsFrames / fpsTimer;
    fpsFrames = 0; fpsTimer = 0;
    el.fpsTag.textContent = fpsValue.toFixed(0) + ' FPS';
    // 自动降载（仅在“自动”画质下）
    if (state.quality === 'auto' && !degraded) {
      if (fpsValue < 30) lowFpsTime += 0.5; else lowFpsTime = Math.max(0, lowFpsTime - 0.5);
      if (lowFpsTime > 4) {
        degraded = true;
        renderer.setPixelRatio(1);
        if (bloomPass) bloomPass.strength *= 0.6;
        el.fpsTag.textContent = fpsValue.toFixed(0) + ' FPS · 已自动降载';
      }
    }
  }

  if (state.hidden) { return; }

  renderer.info.reset();
  stepSim(dt);

  // UI / 图表分帧刷新
  uiAccum += dt; chartAccum += dt;
  if (uiAccum > 0.06) { updateUI(); uiAccum = 0; }
  if (chartAccum > 0.11) {
    drawTorqueChart(); drawPVChart(); drawTimeline();
    updateDebug();
    chartAccum = 0;
  }

  state.frames = (state.frames || 0) + 1;
  window.__DIAG2__ = { frames: state.frames, view: state.view, coverT: +coverT.toFixed(3), camCoverT: +camCoverT.toFixed(3), explode: +state.explode.toFixed(3), err: window.__ERR__.length, calls: renderer.info.render.calls };
  audio.update(state, state.presentationScale);

  if (usePost && composer) composer.render();
  else renderer.render(scene, camera);
}

/* ---------------------------- 启动 ---------------------------- */
function boot() {
  try {
    buildEngine();
    P.cylinders.forEach(c => { /* 气流已在 buildFlow 中登记 */ });
    buildCylinderCells();
    setupAnnotations();
    bindUI();
    resize();
    applyQuality('auto');

    // 默认：温热怠速运行
    state.fuelOn = true;
    state.mode = 'idle';
    state.omega = CFG.idleRpm * 2 * Math.PI / 60;
    state.throttleEff = 0.13;
    state.coolant = 88;
    state.oil = 1.75;
    state.map = 0.35;
    state.tq = 46;
    state.powerKW = 4;
    state.powerHP = 5.4;
    state.prevTheta = state.theta;

    setView('section');
    setPreset('idle');
    setCameraPose('whole', 0, true);
    updateMechanics(0);
    updateCoverState(0.5);
    drawTorqueChart(); drawPVChart(); drawTimeline();
    updateUI(true);

    requestAnimationFrame(loop);
    setTimeout(() => {
      el.loading.classList.add('hide');
      setTimeout(() => { el.loading.style.display = 'none'; }, 700);
    }, 260);
    state.ready = true;
    window.__READY__ = true;

    /* 开发用参数：?shot=1 隐藏界面；?px,py,pz,tx,ty,tz 指定机位；?theta 指定展示角度 */
    const Q = new URLSearchParams(location.search);
    if (Q.has('shot')) {
      document.querySelectorAll('.stage-ui, .viewtag, header, aside, footer, #debug, #labels').forEach(n => n.style.display = 'none');
      document.body.style.gridTemplateRows = '1fr';
      document.body.style.display = 'block';
      const m = document.querySelector('main');
      if (m) { m.style.gridTemplateColumns = '1fr'; m.style.height = '100vh'; }
      document.getElementById('stage').style.height = '100vh';
    }
    if (Q.has('px')) {
      camera.position.set(+Q.get('px'), +Q.get('py'), +Q.get('pz'));
      controls.target.set(+(Q.get('tx') || 0), +(Q.get('ty') || 8), +(Q.get('tz') || 0));
      camState.restPos.copy(camera.position);
      camState.restTarget.copy(controls.target);
      camState.tween = null;
      state.userMovedCamera = true;
      controls.update();
    }
    if (Q.has('settle')) {
      for (let i = 0; i < 50; i++) updateCoverState(0.35);
      state.explode = state.explodeTarget;
      updateCoverState(0.001);
      camState.tween = null;
      const pose = viewPose(state.camera);
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      camState.restPos.copy(pose.pos);
      camState.restTarget.copy(pose.target);
      controls.update();
      updateMechanics(clockT);
    }
    if (Q.has('theta')) {
      state.theta = +Q.get('theta');
      state.prevTheta = state.theta;
      updateMechanics(clockT);
    }
    if (Q.has('view')) setView(Q.get('view'));
    if (Q.has('cam')) setCamera(Q.get('cam'), 0);
    if (Q.has('click')) {
      Q.get('click').split(',').forEach((id, i) => {
        setTimeout(() => {
          const node = document.getElementById(id);
          if (node) node.click();
          if (node && node.tagName === 'SELECT') { node.dispatchEvent(new Event('change')); }
        }, 200 + i * 350);
      });
    }
    if (Q.has('engine')) { if (Q.get('engine') === 'stop') stopEngine(); else startEngine(); }
    if (Q.has('cine')) startCinematic();
    function simReport() {
      window.__SIM__ = {
        rpm: Math.round(state.rpm), mode: state.mode, theta: +state.theta.toFixed(1),
        ign: ignitionCounter, cam: state.camera, view: state.view, explode: +state.explode.toFixed(2),
        paused: state.paused, tq: Math.round(state.tq), kw: Math.round(state.powerKW),
        hp: Math.round(state.powerHP), mech: +state.mechRpm.toFixed(1), cover: +coverT.toFixed(2), camCover: +camCoverT.toFixed(2),
        thr: +state.throttleEff.toFixed(3), adv: +state.advance.toFixed(1), oil: +state.oil.toFixed(2),
        temp: Math.round(state.coolant), afr: +state.afr.toFixed(1), map: +state.map.toFixed(2),
        selfcheck: (window.__SELFCHECK__ || {}).ok,
        cine: !!state.cinematic, camPos: [Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z)]
      };
      updateUI(true);
      drawTorqueChart(); drawPVChart(); drawTimeline();
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;background:rgba(4,8,11,.92);border:1px solid rgba(123,227,154,.35);color:#9BE8B4;font:13px ui-monospace,monospace;padding:10px 14px;border-radius:6px;white-space:pre;line-height:1.5';
      box.textContent = JSON.stringify(window.__SIM__, null, 1).replace(/[{}"]/g, ' ').trim();
      document.body.appendChild(box);
    }
    const waitSim = s => { const n = Math.round(s * 60); for (let i = 0; i < n; i++) stepSim(1 / 60); };
    if (Q.has('sim')) waitSim(Math.min(90, +Q.get('sim') || 5));
    if (Q.has('seq')) {
      Q.get('seq').split('|').forEach(seg => {
        const [cmd, arg] = seg.split(':');
        if (cmd === 'stop') stopEngine();
        else if (cmd === 'start') startEngine();
        else if (cmd === 'thr') { state.throttle = +arg / 100; }
        else if (cmd === 'load') { state.load = +arg / 100; }
        else if (cmd === 'cine') startCinematic();
        else if (cmd === 'explode') setView('explode');
        else if (cmd === 'section') setView('section');
        else if (cmd === 'exterior') setView('exterior');
        else if (cmd === 'cam') setCamera(arg, 0);
        else if (cmd === 'pause') togglePause(true);
        else if (cmd === 'theta') { state.theta = +arg; state.prevTheta = state.theta; }
        else if (cmd === 'wait') waitSim(Math.min(90, +arg || 1));
      });
    }
    if (Q.has('sim') || Q.has('seq')) simReport();    if (Q.has('anndbg')) setTimeout(() => {
      const n = document.querySelectorAll('.anno').length;
      const shown = document.querySelectorAll('.anno.show').length;
      const first = document.querySelector('.anno');
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;background:#111;color:#9f9;font:12px monospace;padding:8px;white-space:pre';
      box.textContent = 'annos=' + n + ' shown=' + shown + '\n' +
        (first ? ('rect=' + JSON.stringify(first.getBoundingClientRect()) + '\nop=' + getComputedStyle(first).opacity + '\ntxt=' + first.textContent) : 'none');
      document.body.appendChild(box);
    }, 2600);
    if (Q.has('only')) {
      const map = {
        crank: [P.crank], bankA: [P.banks.A.group], bankB: [P.banks.B.group],
        intake: [P.intake], exhaust: [P.exhaust], bottom: [P.bottom],
        bankAblock: [P.banks.A.group]
      };
      const keep = new Set(map[Q.get('only')] || []);
      for (const child of engine.children) child.visible = keep.has(child);
      if (Q.has('nohead')) P.headGroups.forEach(h => h.visible = false);
      state.userMovedCamera = true;
    }
    if (Q.has('hideintake')) P.intake.visible = false;
    if (Q.has('nohead')) P.headGroups.forEach(h => h.visible = false);
    if (Q.has('noglow')) { bloomPass && (bloomPass.strength = 0); usePost = false; }
    window.__DIAG__ = {
      cyl: P.cylinders.length, valves: P.valves.length, cams: P.cams.length,
      explode: P.explode.length, covers: P.covers.length
    };
  } catch (e) {
    console.error(e);
    window.__pushErr('初始化失败: ' + (e && e.message ? e.message : e));
  }
}

document.addEventListener('visibilitychange', () => {
  state.hidden = document.hidden;
  if (!document.hidden) { lastT = performance.now(); }
});

boot();

/* 参数自检：在控制台输出一次关键几何关系，便于外部核对 */
(function selfCheck() {
  const out = [];
  let ok = true;
  for (const cyl of CYL) {
    const k0 = cylinderKinematics(cyl, cyl.Fi);
    const k1 = cylinderKinematics(cyl, cyl.Fi + 360);
    if (Math.abs(k0.d) > 1e-6) { ok = false; out.push(`缸${cyl.n} 上止点位移 ${k0.d}`); }
    if (Math.abs(k1.d - 2 * CFG.crankR) > 1e-6) { ok = false; out.push(`缸${cyl.n} 下止点位移 ${k1.d}`); }
    // 连杆长度校验
    const th = 37;
    const kk = cylinderKinematics(cyl, th);
    const len = Math.hypot(kk.bigX - 0, kk.bigY - kk.s);
    if (Math.abs(len - CFG.rodLength) > 1e-6) { ok = false; out.push(`缸${cyl.n} 连杆长度 ${len}`); }
  }
  window.__SELFCHECK__ = { ok, issues: out };
  if (!ok) console.warn('几何自检异常', out);
})();
</script>
</body>
</html>
