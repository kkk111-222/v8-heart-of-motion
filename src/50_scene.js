/* ---------------------------- 渲染器 / 场景 / 灯光 ---------------------------- */
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
} catch (err) {
  window.__pushErr('WebGL 初始化失败: ' + err.message);
  throw err;
}
if (!renderer.capabilities.isWebGL2) {
  window.__pushErr('当前浏览器/显卡不支持 WebGL2，无法运行本作品。请使用新版 Chrome / Edge / Safari。');
  throw new Error('WebGL2 unsupported');
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a0e, 0.0042);

/* 背景渐变（程序生成，不依赖外部图片） */
(function backgroundGradient() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#0E151D');
  g.addColorStop(0.34, '#0A1017');
  g.addColorStop(0.7, '#070A0F');
  g.addColorStop(1.0, '#04060A');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
})();

const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.8;
controls.panSpeed = 0.6;
controls.minDistance = 6;
controls.maxDistance = 130;
controls.maxPolarAngle = Math.PI * 0.505;
controls.minPolarAngle = 0.12;
controls.target.set(0, 9, 0);

/* 环境反射（摄影棚柔光箱，由 RoomEnvironment 程序生成） */
let envReady = false;
try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.05);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.8;
  envReady = true;
  room.traverse(o => { if (o.material) o.material.dispose && o.material.dispose(); });
} catch (e) {
  console.warn('environment failed', e);
}

/* 灯光：主光 / 轮廓光 / 补光 / 环境 */
const keyLight = new THREE.DirectionalLight(0xfff0dd, 2.3);
keyLight.position.set(56, 82, -46);
keyLight.target.position.set(0, 2, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -42; keyLight.shadow.camera.right = 42;
keyLight.shadow.camera.top = 46; keyLight.shadow.camera.bottom = -34;
keyLight.shadow.camera.near = 20; keyLight.shadow.camera.far = 220;
keyLight.shadow.bias = -0.0006;
keyLight.shadow.normalBias = 0.03;
keyLight.shadow.radius = 3;
scene.add(keyLight, keyLight.target);

const rimLight = new THREE.DirectionalLight(0x8fb9dc, 1.55);
rimLight.position.set(-58, 38, 76);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xffd0a8, 0.38);
fillLight.position.set(-30, -28, -60);
scene.add(fillLight);

const topLight = new THREE.SpotLight(0xbcd8f0, 34, 190, 0.55, 1.0, 1.8);
topLight.position.set(8, 78, 6);
scene.add(topLight);

// 观察者方向补光：让剖切内部不发死黑
const viewFill = new THREE.DirectionalLight(0xcddff0, 0.95);
viewFill.position.set(42, 26, -78);
scene.add(viewFill);

scene.add(new THREE.HemisphereLight(0x22313f, 0x04060a, 0.42));

// 曲轴箱内部补光：保证暗部仍能看清曲轴与连杆
const interiorLight = new THREE.PointLight(0xa8c8e4, 90, 95, 2);
interiorLight.position.set(6, 0, 0);
scene.add(interiorLight);

// 下方补光：让曲轴配重与连杆大头有轮廓光
const underLight = new THREE.DirectionalLight(0x9fb8d0, 0.4);
underLight.position.set(28, -48, -30);
scene.add(underLight);

/* 地面 / 展示台 */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), MAT.ground);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -19.6;
ground.receiveShadow = true;
scene.add(ground);

/* 接触阴影（径向渐变，程序生成） */
(function contactShadow() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.4, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(76, 56), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 0.92
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -19.5, 0);
  scene.add(m);
  // 展台圆盘
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(33, 34, 0.4, 64), new THREE.MeshStandardMaterial({
    color: 0x06090d, metalness: 0.5, roughness: 0.46, envMapIntensity: 0.35
  }));
  disc.position.y = -19.45;
  disc.receiveShadow = true;
  scene.add(disc);
})();

scene.add(engine);

/* ---------------------------- 后处理 ---------------------------- */
let composer = null, bloomPass = null, usePost = true;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.6, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
} catch (e) {
  console.warn('post processing unavailable, fallback to direct render', e);
  composer = null; usePost = false;
}

/* ---------------------------- 尺寸 / 画质 ---------------------------- */
function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  const ch = document.querySelectorAll('canvas.ch');
  ch.forEach(cv => { /* CSS 控制宽度，内部像素在绘制时处理 */ });
}
window.addEventListener('resize', () => {
  resize();
  if (!state.userMovedCamera && !camState.tween) setCameraPose(state.camera, 0, true);
});

function applyQuality(q) {
  state.quality = q;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  let target = 1;
  if (q === 'high') target = Math.min(dpr, 2);
  else if (q === 'smooth') target = Math.min(dpr, 1);
  else target = Math.min(dpr, 1.6);
  renderer.setPixelRatio(target);
  state.dpr = target;
  const wantShadow = q !== 'smooth';
  if (renderer.shadowMap.enabled !== wantShadow) {
    renderer.shadowMap.enabled = wantShadow;
    scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
  }
  if (bloomPass) bloomPass.enabled = q !== 'smooth';
  if (composer) usePost = q !== 'low';
  // 粒子数量
  const size = q === 'high' ? 6.2 : q === 'smooth' ? 3.6 : 5;
  P.flows.forEach(f => { if (f && f.intake) { f.intake.mat.size = size; f.exhaust.mat.size = size; } });
  resize();
}

/* ---------------------------- 镜头导演 ---------------------------- */
const VIEW_META = {
  whole: { name: '全机视角', sub: 'FULL ASSEMBLY' },
  crank: { name: '曲柄机构', sub: 'CRANK TRAIN' },
  cylinder: { name: '燃烧室 / 单缸', sub: 'COMBUSTION CHAMBER' },
  valvetrain: { name: '配气机构', sub: 'VALVETRAIN' }
};

const camState = {
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
  restPos: new THREE.Vector3(),
  restTarget: new THREE.Vector3(),
  tween: null,
  driftT: 0
};

function viewPose(name) {
  const S = SCALE;
  if (name === 'crank') {
    // 侧下方靠近曲轴：观察连杆大头、曲柄销与配重
    return {
      pos: new THREE.Vector3(84, 12, -44),
      target: new THREE.Vector3(0, 1, -8)
    };
  }
  if (name === 'cylinder') {
    const cyl = CYL_BY_N[state.selected] || CYL[0];
    const a = rad(cyl.alpha);
    const cx = Math.sin(a) * 168 * S, cy = Math.cos(a) * 168 * S, cz = cyl.z * S;
    const t = new THREE.Vector3(cx, cy, cz);
    const p = new THREE.Vector3(cx + 44, cy + 26, cz - 44);
    return { pos: p, target: t };
  }
  if (name === 'valvetrain') {
    return {
      pos: new THREE.Vector3(56, 40, -40),
      target: new THREE.Vector3(4, 17, -8)
    };
  }
  const ex = state.explodeTarget ? 1.8 : 1.0;
  return {
    pos: new THREE.Vector3(90 * ex, 26 * ex + (ex > 1 ? 4 : 0), -68 * ex),
    target: new THREE.Vector3(0, 5 + (ex > 1 ? 13 : 0), -2)
  };
}

/* 按窗口宽高比自动调整取景距离：窄屏时后退，避免主体被裁掉 */
function aspectScale() {
  const a = camera.aspect || 1.6;
  return a < 1.55 ? Math.min(2.1, Math.pow(1.55 / a, 0.85)) : 1;
}
function fitPose(pose) {
  const k = aspectScale();
  if (k === 1) return pose;
  return {
    pos: pose.target.clone().add(pose.pos.clone().sub(pose.target).multiplyScalar(k)),
    target: pose.target.clone()
  };
}

function setCameraPose(name, duration = 1100, immediate = false) {
  const pose = fitPose(viewPose(name));
  if (immediate) {
    camera.position.copy(pose.pos);
    controls.target.copy(pose.target);
    camState.restPos.copy(pose.pos); camState.restTarget.copy(pose.target);
    camState.tween = null;
    controls.update();
    return;
  }
  camState.tween = {
    t: 0, dur: duration / 1000,
    fromPos: camera.position.clone(), toPos: pose.pos.clone(),
    fromTarget: controls.target.clone(), toTarget: pose.target.clone()
  };
  camState.restPos.copy(pose.pos);
  camState.restTarget.copy(pose.target);
}

function updateCamera(dt, time) {
  if (camState.tween) {
    const tw = camState.tween;
    tw.t += dt;
    const k = easeInOut(clamp(tw.t / tw.dur, 0, 1));
    camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    if (k >= 1) {
      camState.tween = null;
      camState.restPos.copy(tw.toPos);
      camState.restTarget.copy(tw.toTarget);
    }
    controls.update();
    return;
  }
  // 自动运镜：极小幅度呼吸式推进（用户操作后停止）
  if (!state.userMovedCamera && !state.paused && !state.explodeTarget && state.view !== 'exterior') {
    camState.driftT += dt;
    const t = camState.driftT;
    const push = 1 + 0.006 * Math.sin(t * 0.22);
    const dx = 0.55 * Math.sin(t * 0.17);
    const dy = 0.28 * Math.sin(t * 0.11 + 1.3);
    const p = camState.restPos.clone().sub(controls.target).multiplyScalar(push).add(controls.target);
    camera.position.set(p.x + dx, p.y + dy, p.z + dx * 0.6);
    controls.target.copy(camState.restTarget);
  }
  controls.update();
}

controls.addEventListener('start', () => {
  state.userMovedCamera = true;
  camState.tween = null;
  if (state.cinematic) endCinematic('用户接管镜头');
  canvas.classList.add('dragging');
});
controls.addEventListener('end', () => canvas.classList.remove('dragging'));

/* ---------------------------- 工程标注 ---------------------------- */
const ANNO_DEFS = [
  { id: 'piston', label: '活塞', note: 'Ø94 mm · 行程 90 mm', get: () => worldOf(P.cylinders.find(c => c.cyl.n === 1)?.piston), side: 'left' },
  { id: 'rod', label: '连杆', note: '中心距 150 mm', get: () => worldOf(P.cylinders.find(c => c.cyl.n === 1)?.rod), side: 'left' },
  { id: 'crank', label: '曲轴', note: '十字平面 · 4 曲柄销', get: () => worldOf(P.crank, new THREE.Vector3(0, 0, -110)), side: 'right' },
  { id: 'cam', label: '凸轮轴', note: 'DOHC · 全机 4 根', get: () => P.cams[0] ? worldOf(P.cams[0].group, new THREE.Vector3(0, 0, -120)) : null, side: 'right' },
  { id: 'plug', label: '火花塞', note: '每缸 1 只 · 共 8 只', get: () => { const c = P.cylinders.find(c => c.cyl.n === 1); return c ? worldOf(c.head, new THREE.Vector3(0, 268, c.cyl.z)) : null; }, side: 'right' }
];

const annoEls = [];
const svgNS = 'http://www.w3.org/2000/svg';
const labelSvg = document.getElementById('labelSvg');
const labelsDiv = document.getElementById('labels');

function setupAnnotations() {
  for (const def of ANNO_DEFS) {
    const el = document.createElement('div');
    el.className = 'anno';
    el.innerHTML = `<div><b>${def.label}</b></div><div class="n">${def.note}</div>`;
    labelsDiv.appendChild(el);
    const line = document.createElementNS(svgNS, 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'rgba(126,140,154,0.42)');
    line.setAttribute('stroke-width', '0.8');
    line.setAttribute('stroke-dasharray', '2 3');
    labelSvg.appendChild(line);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('r', '2.2');
    dot.setAttribute('fill', 'rgba(112,216,229,0.85)');
    labelSvg.appendChild(dot);
    annoEls.push({ def, el, line, dot, alpha: 0 });
  }
}

const _v = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
function worldOf(obj, local) {
  if (!obj) return null;
  obj.updateWorldMatrix(true, false);
  const v = local ? local.clone() : new THREE.Vector3();
  return v.applyMatrix4(obj.matrixWorld);
}

function updateAnnotations() {
  if (!state.annotations || state.view === 'exterior' || state.cinematic) {
    for (const a of annoEls) { a.el.classList.remove('show'); a.line.setAttribute('points', ''); a.dot.setAttribute('r', '0'); a.alpha = 0; }
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const placed = { left: [], right: [] };
  for (const a of annoEls) {
    const world = a.def.get();
    if (!world) { a.el.classList.remove('show'); continue; }
    _v.copy(world).project(camera);
    const x = (_v.x * 0.5 + 0.5) * w;
    const y = (-_v.y * 0.5 + 0.5) * h;
    const dist = camera.position.distanceTo(world);
    const toPoint = _tmpA.copy(world).sub(camera.position);
    const facing = toPoint.dot(camera.getWorldDirection(_tmpB)) > 0;
    const inView = x > 4 && x < w - 4 && y > 10 && y < h - 6;
    const show = facing && inView && dist < 260 && dist > 3;
    a.el.classList.toggle('show', show);
    if (!show) { a.line.setAttribute('points', ''); a.dot.setAttribute('r', '0'); continue; }

    // 标签固定在左右留白列，同侧自动避让，避免压住机构与引线交叉
    const side = a.def.side === 'left' ? 'left' : 'right';
    let ly = clamp(y - 8, 24, h - 34);
    for (const prev of placed[side]) { if (Math.abs(prev - ly) < 42) ly = prev + 42; }
    ly = clamp(ly, 24, h - 34);
    placed[side].push(ly);
    const anchorX = side === 'left' ? 128 : w - 128;
    const fade = clamp((260 - dist) / 90, 0, 1);
    a.el.style.left = side === 'left' ? '22px' : 'auto';
    a.el.style.right = side === 'right' ? '22px' : 'auto';
    a.el.style.top = ly + 'px';
    a.el.style.textAlign = side === 'right' ? 'right' : 'left';
    a.el.style.opacity = String(clamp(fade + 0.35, 0, 1));
    a.line.setAttribute('points', `${x},${y} ${anchorX},${ly + 9} ${x},${y}`);
    a.line.setAttribute('opacity', String(clamp(fade + 0.2, 0, 1)));
    a.dot.setAttribute('cx', x); a.dot.setAttribute('cy', y); a.dot.setAttribute('r', '2.2');
    a.dot.setAttribute('opacity', String(clamp(fade + 0.3, 0, 1)));
  }
}
