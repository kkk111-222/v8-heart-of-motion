/* ---------------------------- 程序纹理与材质 ---------------------------- */
function grainTexture(size = 256, contrast = 0.30, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  let a = seed;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < size * size; i++) {
    const v = clamp(200 + (rnd() - 0.5) * 2 * contrast * 255, 90, 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function glowTexture() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,236,208,0.85)');
  g.addColorStop(0.55, 'rgba(255,171,94,0.30)');
  g.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const TEX = {
  grain: grainTexture(256, 0.22, 7),
  castGrain: grainTexture(256, 0.34, 31),
  brushed: grainTexture(256, 0.16, 91),
  glow: glowTexture()
};
TEX.grain.repeat.set(3, 3);
TEX.castGrain.repeat.set(2, 2);
TEX.brushed.repeat.set(14, 2);

const MAT = {
  cast: new THREE.MeshStandardMaterial({ color: 0x606a75, metalness: 0.86, roughness: 0.58, roughnessMap: TEX.castGrain, envMapIntensity: 0.9 }),
  castDark: new THREE.MeshStandardMaterial({ color: 0x3f4750, metalness: 0.88, roughness: 0.58, roughnessMap: TEX.castGrain, envMapIntensity: 0.8 }),
  cover: new THREE.MeshStandardMaterial({ color: 0x2c333b, metalness: 0.7, roughness: 0.36, roughnessMap: TEX.grain, envMapIntensity: 0.95, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b949e, metalness: 1.0, roughness: 0.26, roughnessMap: TEX.grain, envMapIntensity: 1.1 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x474e57, metalness: 1.0, roughness: 0.4, roughnessMap: TEX.grain, envMapIntensity: 1.0 }),
  piston: new THREE.MeshStandardMaterial({ color: 0xc4c9d0, metalness: 1.0, roughness: 0.26, roughnessMap: TEX.grain, envMapIntensity: 1.15 }),
  liner: new THREE.MeshStandardMaterial({ color: 0xa3abb4, metalness: 1.0, roughness: 0.16, roughnessMap: TEX.brushed, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  ring: new THREE.MeshStandardMaterial({ color: 0x1f2328, metalness: 0.95, roughness: 0.5 }),
  cam: new THREE.MeshStandardMaterial({ color: 0x99a2ac, metalness: 1.0, roughness: 0.2, roughnessMap: TEX.grain, envMapIntensity: 1.15 }),
  valve: new THREE.MeshStandardMaterial({ color: 0xd2d7dd, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  spring: new THREE.MeshStandardMaterial({ color: 0x7a828c, metalness: 1.0, roughness: 0.32 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xdcdde0, metalness: 0.06, roughness: 0.44 }),
  manifold: new THREE.MeshStandardMaterial({ color: 0x59616a, metalness: 0.82, roughness: 0.44, roughnessMap: TEX.grain }),
  exhaust: new THREE.MeshStandardMaterial({ color: 0x7a6a58, metalness: 0.92, roughness: 0.38, roughnessMap: TEX.grain }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.1, roughness: 0.86 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x080c11, metalness: 0.3, roughness: 0.6, envMapIntensity: 0.35 }),
  crankSteel: new THREE.MeshStandardMaterial({ color: 0x6f7781, metalness: 1.0, roughness: 0.34, roughnessMap: TEX.grain, envMapIntensity: 1.0 }),
  glowRing: new THREE.MeshBasicMaterial({ color: 0x70d8e5, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
};

/* ------------------------------ 几何工具 ------------------------------ */
function cylZ(rt, rb, h, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}
function cylX(rt, rb, h, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  return g;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function extrude(shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12
  });
}
function boxGeom(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

/* 由 XY 截面沿 Z 挤出的墙体（sign<0 时反转顶点保证法线朝外） */
function wallPrism(parent, pts, zMin, zMax, mat, sign, bevel = 1.5) {
  const src = sign < 0 ? pts.map(p => [-p[0], p[1]]).reverse() : pts;
  const sh = new THREE.Shape();
  src.forEach((p, i) => { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
  sh.closePath();
  const g = extrude(sh, zMax - zMin, bevel);
  g.translate(0, 0, zMin);
  const m = mesh(g, mat, parent);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* 活塞（含裙部、三道环槽、销座）—— 局部原点在活塞销中心 */
function pistonGeometries() {
  const R = 46.6;
  const p = [];
  const V = (x, y) => p.push(new THREE.Vector2(x, y));
  V(0, -30); V(30, -30); V(43, -28.5); V(46.0, -24.5);
  V(R, -6);
  const grooves = [[-6, -2.6], [-1.6, 1.8], [3.2, 6.6]];
  for (const g of grooves) {
    V(R, g[0]); V(43.3, g[0] + 0.5); V(43.3, g[1] - 0.5); V(R, g[1]);
  }
  V(R, 22.4); V(45.4, 24.8); V(43.6, 25.4); V(38, 26.0); V(22, 25.0); V(0, 24.6);
  const body = new THREE.LatheGeometry(p, 56);
  const rings = new THREE.TorusGeometry(46.9, 1.35, 8, 44);
  rings.rotateX(Math.PI / 2);
  const boss = cylX(15, 15, 54, 20);
  const pin = cylX(13, 13, 64, 20);
  return { body, rings, boss, pin };
}

function valveGeometry() {
  const p = [];
  const V = (x, y) => p.push(new THREE.Vector2(x, y));
  V(0, -38); V(9.5, -37.4); V(15.4, -35.6); V(15.6, -33.2);
  V(11.6, -31.2); V(6.2, -30.4); V(3.4, -29.2); V(3.4, 0); V(0, 0);
  return new THREE.LatheGeometry(p, 32);
}

function springGeometry() {
  const pts = [];
  const turns = 5.2, h = 24, R = 7.4;
  for (let i = 0; i <= 130; i++) {
    const t = i / 130;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, (t - 0.5) * h, Math.sin(a) * R));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 190, 1.05, 4, false);
}

function camShapeGeom(depth = 20) {
  const shape = new THREE.Shape();
  const N = 128, base = 18, lift = 9, half = 112;
  let first = true;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    const d = pmod(deg(a) + 180, 360) - 180;
    const r = Math.abs(d) < half ? base + lift * Math.pow(Math.cos(Math.PI * d / (2 * half)), 2) : base;
    const x = r * Math.sin(a), y = r * Math.cos(a);
    if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = extrude(shape, depth, 0.6);
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/* 喇叭形曲柄臂 + 配重 */
function webShapeGeom(depth = 24) {
  const shape = new THREE.Shape();
  const N = 120;
  let first = true;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    const d = pmod(deg(a) + 180, 360) - 180;
    const lobe = smoothstep(90, 118, Math.abs(d)) * (1 - smoothstep(168, 180, Math.abs(d)));
    const r = 58 + 12 * lobe;
    const x = r * Math.sin(a), y = r * Math.cos(a);
    if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = extrude(shape, depth, 0.8);
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/* 带孔的缸体上平面（deck plate） */
function deckPlateGeom(zList, zMin, zMax, thickness = 8) {
  const shape = new THREE.Shape();
  shape.moveTo(-58, -zMax); shape.lineTo(58, -zMax); shape.lineTo(58, -zMin); shape.lineTo(-58, -zMin); shape.closePath();
  for (const z of zList) {
    const hole = new THREE.Path();
    hole.absarc(0, -z, 47, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = extrude(shape, thickness, 0.8);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* ------------------------------ 发动机装配 ------------------------------ */
const engine = new THREE.Group();
engine.scale.setScalar(SCALE);

const P = {
  root: engine,
  crank: null,
  banks: {},
  headGroups: [],
  cylinders: [],
  valves: [],
  cams: [],
  covers: [],
  camCovers: [],
  explode: [],
  flows: [],
  anchors: {}
};

function buildCrank() {
  const g = new THREE.Group();
  P.crank = g;
  engine.add(g);

  const journalGeo = cylZ(34, 34, 30, 32);
  for (const z of [-216, -108, 0, 108, 216]) {
    const j = mesh(journalGeo, MAT.steel, g, 0, 0, z);
    j.castShadow = true;
  }
  mesh(cylZ(24, 24, 40, 24), MAT.steel, g, 0, 0, -242);
  mesh(cylZ(46, 46, 18, 32), MAT.steel, g, 0, 0, 234);

  const webGeo = webShapeGeom(24);
  const pinGeo = cylZ(32, 32, 58, 28);
  const cwGeo = cylZ(64, 64, 20, 40, false);

  for (let j = 0; j < 4; j++) {
    const throwG = new THREE.Group();
    throwG.position.z = CFG.pinZ[j];
    throwG.rotation.z = -rad(CFG.pinBeta[j]);
    g.add(throwG);

    const pin = mesh(pinGeo, MAT.steel, throwG, 0, CFG.crankR, 0);
    pin.castShadow = true;

    const w1 = mesh(webGeo, MAT.crankSteel, throwG, 0, 0, CFG.rodOffsetZ + 24);
    const w2 = mesh(webGeo, MAT.crankSteel, throwG, 0, 0, -CFG.rodOffsetZ - 24);
    w1.castShadow = w2.castShadow = true;
    const cw = mesh(cwGeo, MAT.crankSteel, throwG, 0, -54, CFG.rodOffsetZ + 24);
    const cw2 = mesh(cwGeo, MAT.crankSteel, throwG, 0, -54, -CFG.rodOffsetZ - 24);
    cw.castShadow = cw2.castShadow = true;
  }

  // 飞轮 + 齿圈
  const fly = mesh(cylZ(104, 104, 16, 56), MAT.steelDark, g, 0, 0, 252);
  fly.castShadow = true;
  mesh(cylZ(60, 60, 22, 32), MAT.steel, g, 0, 0, 252);
  const teethGeo = new THREE.BoxGeometry(6, 9, 10);
  const teeth = new THREE.InstancedMesh(teethGeo, MAT.steel, 56);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 56; i++) {
    const a = i / 56 * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 107, Math.cos(a) * 107, 252);
    dummy.rotation.set(0, 0, -a);
    dummy.updateMatrix();
    teeth.setMatrixAt(i, dummy.matrix);
  }
  g.add(teeth);

  // 前端皮带轮
  const pulley = mesh(cylZ(74, 74, 30, 40), MAT.steelDark, g, 0, 0, -264);
  pulley.castShadow = true;
  const pulRing = new THREE.TorusGeometry(72, 2.2, 6, 48);
  pulRing.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) mesh(pulRing, MAT.steel, g, 0, 0, -276 + i * 6);
}

/* 单个缸列 */
function buildBank(key) {
  const alpha = CFG.bankAlpha[key];
  const bankGroup = new THREE.Group();
  bankGroup.rotation.z = -rad(alpha);
  engine.add(bankGroup);

  const cyls = CYL.filter(c => c.bank === key);
  const zList = cyls.map(c => c.z);
  const intakeSign = CFG.bankIntakeSign[key];
  const half = (zList[1] - zList[0]) / 2;                 // 54
  const zMin = zList[0] - half - 8, zMax = zList[3] + half + 8;
  const bulkZ = [zList[0] - half, (zList[0] + zList[1]) / 2, (zList[1] + zList[2]) / 2, (zList[2] + zList[3]) / 2, zList[3] + half];
  const openSide = key === 'A';                            // A 列剖切展示，B 列保持完整

  const bank = { key, group: bankGroup, cyls: [], head: null };
  P.banks[key] = bank;

  /* ---- 缸套 ---- */
  const linerH = CFG.deckY - CFG.linerBottom;
  // A 列剖切：缸套只保留约 230°，开口朝向观察者一侧，可看到活塞与剖切边厚度
  const linerGeo = openSide
    ? new THREE.CylinderGeometry(CFG.linerOuter, CFG.linerOuter, linerH, 48, 1, true, rad(188), rad(164))
    : new THREE.CylinderGeometry(CFG.linerOuter, CFG.linerOuter, linerH, 48, 1, true);
  const linerInnerGeo = openSide
    ? new THREE.CylinderGeometry(CFG.linerR, CFG.linerR, linerH, 48, 1, true, rad(188), rad(164))
    : new THREE.CylinderGeometry(CFG.linerR, CFG.linerR, linerH, 48, 1, true);
  const flangeGeo = new THREE.CylinderGeometry(57, 57, 7, 48);
  const linerMatInner = new THREE.MeshStandardMaterial({ color: 0x555c65, metalness: 1, roughness: 0.36, side: THREE.BackSide });

  /* ---- 缸体：上部 deck 板 + 隔板 + 下部裙壁 ---- */
  const deck = mesh(deckPlateGeom(zList, zMin, zMax, 8), MAT.cast, bankGroup, 0, CFG.deckY, 0);
  deck.castShadow = true; deck.receiveShadow = true;

  const bulkGeo = boxGeom(124, CFG.deckY - 62, 13);
  for (const z of bulkZ) {
    // 隔板在缸套外缘处收窄，避免与缸筒相交
    const b = mesh(bulkGeo, MAT.cast, bankGroup, 0, (CFG.deckY + 62) / 2, z);
    b.castShadow = true; b.receiveShadow = true;
  }
  // 下部裙壁（A 列近侧开口，露出曲柄连杆；远侧与 B 列保留完整裙壁）
  wallPrism(bankGroup, [[54, -40], [70, -18], [70, 66], [54, 72]], zMin, zMax, MAT.cast, -1);
  if (openSide) {
    wallPrism(bankGroup, [[54, -40], [70, -26], [70, -12], [54, -4]], zMin, zMax, MAT.cast, 1);
  } else {
    wallPrism(bankGroup, [[54, -40], [70, -18], [70, 66], [54, 72]], zMin, zMax, MAT.cast, 1);
  }
  // 剖切上缘的机加工高光条
  const trimGeo = boxGeom(4, 4, zMax - zMin - 4);
  mesh(trimGeo, MAT.steel, bankGroup, -66, 68, (zMin + zMax) / 2);
  // 前后端面（B 列封闭；A 列剖切保留后端面）
  if (!openSide) {
    mesh(boxGeom(136, 106, 10), MAT.cast, bankGroup, 0, 20, zMin + 4).castShadow = true;
    mesh(boxGeom(136, 106, 10), MAT.cast, bankGroup, 0, 20, zMax - 4).castShadow = true;
  } else {
    mesh(boxGeom(136, 106, 10), MAT.cast, bankGroup, 0, 20, zMax - 4).castShadow = true;
  }

  /* ---- 缸盖组（可爆炸）：气门室框 + 气门 + 凸轮轴 + 火花塞 ---- */
  const head = new THREE.Group();
  bankGroup.add(head);
  bank.head = head;
  P.headGroups.push(head);

  const zc = (zMin + zMax) / 2, zSpan = zMax - zMin;
  // 气门室周边框（保留缸孔开口，可俯视看到活塞）
  mesh(boxGeom(14, 14, zSpan), MAT.cast, head, 60, 250, zc).castShadow = true;
  mesh(boxGeom(14, 14, zSpan), MAT.cast, head, -60, 250, zc).castShadow = true;
  mesh(boxGeom(120, 14, 14), MAT.cast, head, 0, 250, zMin + 4).castShadow = true;
  mesh(boxGeom(120, 14, 14), MAT.cast, head, 0, 250, zMax - 4).castShadow = true;

  // 凸轮轴轴承支柱（位于隔板位置，避免与气门/凸轮相碰）
  const pillarGeo = boxGeom(30, 60, 24);
  const saddleGeo = boxGeom(34, 14, 26);
  for (const side of [intakeSign, -intakeSign]) {
    for (const z of bulkZ) {
      mesh(pillarGeo, MAT.cast, head, side * 30, 282, z).castShadow = true;
      mesh(saddleGeo, MAT.cast, head, side * 30, 316, z).castShadow = true;
    }
  }

  /* ---- 凸轮轴（两根） ---- */
  const lobeGeo = camShapeGeom(20);
  const shaftGeo = cylZ(13, 13, zSpan + 20, 20);
  const journalGeo = cylZ(20, 20, 18, 24);
  const cams = [];
  for (const side of [intakeSign, -intakeSign]) {
    const isIntake = side === intakeSign;
    const camG = new THREE.Group();
    camG.position.set(side * 30, CFG.camY, 0);
    head.add(camG);
    mesh(shaftGeo, MAT.cam, camG, 0, 0, 0);
    for (const z of bulkZ) mesh(journalGeo, MAT.cam, camG, 0, 0, z);
    for (const c of cyls) {
      for (const dz of [-CFG.valveZ, CFG.valveZ]) {
        const lobe = mesh(lobeGeo, MAT.cam, camG, 0, 0, c.z + dz);
        lobe.castShadow = true;
      }
    }
    cams.push({
      group: camG, side, isIntake,
      center: isIntake ? (CFG.intakeOpen + CFG.intakeClose) / 2 : (CFG.exhaustOpen + CFG.exhaustClose) / 2
    });
  }
  P.cams.push(...cams.map(c => Object.assign({}, c, { bank: key })));

  /* ---- 外观件：缸体侧壁 / 缸盖侧壁 / 凸轮罩 / 缸垫法兰 ---- */
  const coverMat = () => MAT.cover.clone();
  const addSides = (pts, matFactory, parent, fade, zPad) => {
    const m1 = wallPrism(parent, pts, zMin - zPad, zMax + zPad, matFactory(), 1);
    const m2 = wallPrism(parent, pts, zMin - zPad, zMax + zPad, matFactory(), -1);
    if (fade) P.covers.push(m1, m2);
    return [m1, m2];
  };
  const pickMat = () => (openSide ? coverMat() : MAT.cover);
  // 缸体侧壁（平顶，止于缸垫处）
  addSides([[58, -36], [74, -12], [74, 224], [58, 232]], pickMat, bankGroup, openSide, 6);
  // 缸盖侧壁（爆炸时随缸盖移动）
  addSides([[60, 240], [72, 246], [72, 294], [60, 300]], pickMat, head, openSide, 2);

  // 缸垫法兰（分模线）+ 螺栓，提高装配层次
  const flangeY = 236;
  mesh(boxGeom(24, 9, zSpan + 10), MAT.steelDark, bankGroup, 66, flangeY, zc).castShadow = true;
  mesh(boxGeom(24, 9, zSpan + 10), MAT.steelDark, bankGroup, -66, flangeY, zc).castShadow = true;
  const flangeBolt = new THREE.CylinderGeometry(5.2, 5.2, 9, 10);
  for (let i = 0; i < 9; i++) {
    const z = zMin + 16 + i * (zSpan - 32) / 8;
    mesh(flangeBolt, MAT.steel, bankGroup, 66, flangeY + 8, z);
    mesh(flangeBolt, MAT.steel, bankGroup, -66, flangeY + 8, z);
  }
  // 曲轴箱加强筋
  for (let i = 0; i < 7; i++) {
    const z = zMin + 30 + i * (zSpan - 60) / 6;
    mesh(boxGeom(8, 76, 12), MAT.cast, bankGroup, 74, 90, z).castShadow = true;
    mesh(boxGeom(8, 76, 12), MAT.cast, bankGroup, -74, 90, z).castShadow = true;
  }

  const ccShape = new THREE.Shape();
  ccShape.moveTo(-66, 300); ccShape.lineTo(66, 300); ccShape.lineTo(66, 312);
  ccShape.lineTo(58, 330); ccShape.lineTo(-58, 330); ccShape.lineTo(-66, 312);
  ccShape.closePath();
  const ccGeo = extrude(ccShape, zSpan, 2);
  ccGeo.translate(0, 0, zMin);
  const camCover = mesh(ccGeo, pickMat(), head, 0, 0, 0);
  camCover.castShadow = true;
  if (openSide) P.camCovers.push(camCover);

  /* ---- 每缸 ---- */
  const pistonGeo = pistonGeometries();
  const valveGeo = valveGeometry();
  const springGeo = springGeometry();
  const retainerGeo = new THREE.CylinderGeometry(9, 9, 3, 20);
  const guideGeo = new THREE.CylinderGeometry(6.8, 6.8, 26, 16);
  const plugBodyGeo = new THREE.CylinderGeometry(9, 9, 26, 16);
  const plugHexGeo = new THREE.CylinderGeometry(12, 12, 10, 6);
  const plugCeramicGeo = new THREE.CylinderGeometry(7.5, 8.8, 26, 16);
  const boreMat = new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.9, roughness: 0.55 });

  const glowMatBase = new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xffab5e, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const sparkMatBase = new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xffe0b8, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  for (const cyl of cyls) {
    const z = cyl.z;

    const liner = mesh(linerGeo, MAT.liner, bankGroup, 0, (CFG.linerBottom + CFG.deckY) / 2, z);
    const inner = mesh(linerInnerGeo, linerMatInner, bankGroup, 0, (CFG.linerBottom + CFG.deckY) / 2, z);
    inner.receiveShadow = true;
    mesh(flangeGeo, MAT.steel, bankGroup, 0, CFG.deckY - 4, z);

    // 活塞
    const pistonG = new THREE.Group();
    bankGroup.add(pistonG);
    const body = mesh(pistonGeo.body, MAT.piston, pistonG);
    body.castShadow = true;
    mesh(pistonGeo.rings, MAT.ring, pistonG, 0, 9.5, 0);
    mesh(pistonGeo.rings, MAT.ring, pistonG, 0, 14.6, 0);
    mesh(pistonGeo.rings, MAT.ring, pistonG, 0, 19.7, 0);
    mesh(pistonGeo.boss, MAT.steelDark, pistonG);
    mesh(pistonGeo.pin, MAT.steel, pistonG);

    // 连杆
    const rodG = new THREE.Group();
    bankGroup.add(rodG);
    const big = mesh(cylZ(38, 38, 26, 28, false), MAT.steelDark, rodG, 0, 0, 0);
    big.castShadow = true;
    mesh(cylZ(32.4, 32.4, 26.4, 28, false), boreMat, rodG, 0, 0, 0);
    mesh(boxGeom(26, 80, 18), MAT.steelDark, rodG, 0, 62, 0);
    mesh(boxGeom(16, 96, 9), MAT.steelDark, rodG, 0, 68, 0);
    const sm = mesh(cylZ(24, 24, 24, 22, false), MAT.steelDark, rodG, 0, CFG.rodLength, 0);
    sm.castShadow = true;
    mesh(cylZ(15, 15, 24.4, 20, false), boreMat, rodG, 0, CFG.rodLength, 0);
    mesh(cylZ(3.4, 3.4, 34, 8), MAT.steel, rodG, 22, -6, 0);
    mesh(cylZ(3.4, 3.4, 34, 8), MAT.steel, rodG, -22, -6, 0);

    // 气门
    const valves = [];
    for (let vi = 0; vi < 4; vi++) {
      const isIntake = vi < 2;
      const side = isIntake ? intakeSign : -intakeSign;
      const dz = (vi % 2 === 0) ? -CFG.valveZ : CFG.valveZ;
      const vx = side * CFG.valveX;

      const valveG = new THREE.Group();
      valveG.position.set(vx, CFG.valveTipY, z + dz);
      head.add(valveG);
      const vm = mesh(valveGeo, MAT.valve, valveG);
      vm.castShadow = true;
      mesh(retainerGeo, MAT.steel, valveG, 0, 0, 0);
      const seatRing = mesh(new THREE.TorusGeometry(8.2, 1.6, 6, 20), MAT.steel, valveG, 0, -2.4, 0);
      seatRing.rotation.x = Math.PI / 2;

      mesh(guideGeo, MAT.cast, head, vx, 268, z + dz);
      const spring = mesh(springGeo, MAT.spring, head, vx, 270, z + dz);

      valves.push({ group: valveG, spring, isIntake, bank: key, z: z + dz, x: vx });
      P.valves.push({ group: valveG, spring, isIntake, bank: key });
    }

    // 火花塞
    const plug = new THREE.Group();
    plug.position.set(0, 252, z);
    head.add(plug);
    mesh(plugBodyGeo, MAT.steelDark, plug, 0, 6, 0);
    mesh(plugHexGeo, MAT.steel, plug, 0, 21, 0);
    mesh(plugCeramicGeo, MAT.ceramic, plug, 0, 38, 0);
    mesh(new THREE.CylinderGeometry(1.8, 1.8, 12, 8), MAT.steel, plug, 0, -9, 0);

    // 燃烧辉光 / 火花
    const glow = new THREE.Sprite(glowMatBase.clone());
    glow.position.set(0, 218, z);
    glow.scale.setScalar(10);
    bankGroup.add(glow);
    const spark = new THREE.Sprite(sparkMatBase.clone());
    spark.position.set(0, 240, z);
    spark.scale.setScalar(6);
    bankGroup.add(spark);

    const flow = buildFlow(bankGroup, cyl, intakeSign);
    P.flows.push(flow);

    const hl = new THREE.Mesh(new THREE.TorusGeometry(52, 1.6, 6, 48), MAT.glowRing.clone());
    hl.rotation.x = Math.PI / 2;
    hl.position.set(0, CFG.deckY + 2, z);
    hl.visible = false;
    bankGroup.add(hl);

    bank.cyls.push({ cyl, pistonG, rodG, glow, spark, flow, hl, valves, liner, inner, plug });
    P.cylinders.push({ cyl, bank: key, piston: pistonG, rod: rodG, glow, spark, hl, valves, flow, bankGroup, head });
  }

  /* ---- 爆炸图 ---- */
  P.explode.push({ obj: head, base: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(0, 290, 0) });
  P.explode.push({ obj: camCover, base: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(0, 62, 0) });
}

/* 进排气示意粒子流（缸列局部坐标） */
function buildFlow(parent, cyl, intakeSign) {
  const zc = cyl.z;
  const intakeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(intakeSign * 62, 262, zc),
    new THREE.Vector3(intakeSign * 46, 258, zc),
    new THREE.Vector3(intakeSign * 34, 240, zc),
    new THREE.Vector3(intakeSign * 18, 226, zc),
    new THREE.Vector3(intakeSign * 6, 214, zc),
    new THREE.Vector3(0, 202, zc)
  ]);
  const exhaustCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 206, zc),
    new THREE.Vector3(-intakeSign * 16, 224, zc),
    new THREE.Vector3(-intakeSign * 38, 244, zc),
    new THREE.Vector3(-intakeSign * 58, 254, zc),
    new THREE.Vector3(-intakeSign * 78, 252, zc)
  ]);
  const N = 16;
  const mk = (curve, color) => {
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 5.2, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    parent.add(pts);
    return { pts, geo, mat, curve, offsets: Array.from({ length: N }, (_, i) => i / N + Math.random() * 0.02) };
  };
  const intake = mk(intakeCurve, 0x70d8e5);
  const exhaust = mk(exhaustCurve, 0xffab5e);
  return { intake, exhaust };
}

/* 进气系统：稳压腔 + 节气门 + 支管 */
function buildIntake() {
  const g = new THREE.Group();
  engine.add(g);
  P.intake = g;

  const plenumShape = new THREE.Shape();
  plenumShape.moveTo(-48, -30); plenumShape.lineTo(48, -30); plenumShape.lineTo(48, 24);
  plenumShape.lineTo(40, 32); plenumShape.lineTo(-40, 32); plenumShape.lineTo(-48, 24); plenumShape.closePath();
  const plenumGeo = extrude(plenumShape, 352, 4);
  plenumGeo.translate(0, 0, -176);
  const plenum = mesh(plenumGeo, MAT.manifold, g, 0, 214, 0);
  plenum.castShadow = true; plenum.receiveShadow = true;

  // 稳压腔顶部加强肋
  for (const z of [-120, -40, 40, 120]) {
    mesh(boxGeom(84, 5, 10), MAT.manifold, g, 0, 247, z);
  }
  // 节气门体（前端）
  const tb = new THREE.Group();
  tb.position.set(0, 214, -196);
  g.add(tb);
  mesh(cylZ(38, 40, 54, 28, true), MAT.manifold, tb, 0, 0, -12);
  const tbRing = mesh(new THREE.TorusGeometry(38, 3.4, 8, 32), MAT.steel, tb, 0, 0, -38);
  const butterfly = mesh(cylZ(35, 35, 3, 28), MAT.steel, tb, 0, 0, -14);
  P.butterfly = butterfly;

  for (const cyl of CYL) {
    const is = CFG.bankIntakeSign[cyl.bank];
    const a = rad(cyl.alpha);
    const lx = is * 44, ly = 258;
    const px = lx * Math.cos(a) + ly * Math.sin(a);
    const py = -lx * Math.sin(a) + ly * Math.cos(a);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(is * 30, 214, cyl.z),
      new THREE.Vector3(px * 0.5, 224, cyl.z),
      new THREE.Vector3(px * 0.82, 238, cyl.z),
      new THREE.Vector3(px, py, cyl.z)
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 13, 12, false), MAT.manifold);
    tube.castShadow = true;
    g.add(tube);
    mesh(cylZ(5.5, 5.5, 26, 10), MAT.steelDark, g, px * 0.8, py + 10, cyl.z - 16);
  }
  // 燃油轨
  mesh(boxGeom(12, 10, 300), MAT.steelDark, g, 92, 238, 0);
  mesh(boxGeom(12, 10, 300), MAT.steelDark, g, -92, 238, 0);

  P.explode.push({ obj: g, base: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(0, 200, 0) });
}

/* 排气系统：4-1 芭蕉 + 集合管 */
function buildExhaust() {
  const g = new THREE.Group();
  engine.add(g);
  P.exhaust = g;

  for (const key of ['A', 'B']) {
    const is = CFG.bankIntakeSign[key];
    const bankGroup = new THREE.Group();
    g.add(bankGroup);
    const a = rad(CFG.bankAlpha[key]);
    const cyls = CYL.filter(c => c.bank === key);
    const collector = new THREE.Vector3(-is * 248, -4, 150);
    for (const cyl of cyls) {
      const lx = -is * 52, ly = 264;
      const px = lx * Math.cos(a) + ly * Math.sin(a);
      const py = -lx * Math.sin(a) + ly * Math.cos(a);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, py, cyl.z),
        new THREE.Vector3(px * 1.12, py * 0.86, cyl.z),
        new THREE.Vector3(px * 1.2, 86, cyl.z * 0.78 + 22),
        new THREE.Vector3(px * 1.14, 34, cyl.z * 0.5 + 62),
        collector.clone().add(new THREE.Vector3(0, 8, cyl.z * 0.1))
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 11, 10, false), MAT.exhaust);
      tube.castShadow = true;
      bankGroup.add(tube);
      const fl = mesh(boxGeom(16, 26, 26), MAT.steelDark, bankGroup, px * 1.02, py * 0.97, cyl.z);
      fl.castShadow = true;
    }
    const coll = mesh(cylZ(24, 38, 84, 20), MAT.exhaust, bankGroup, collector.x, collector.y, collector.z + 24);
    coll.castShadow = true;
    const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(collector.x, collector.y - 6, collector.z + 64),
      new THREE.Vector3(collector.x, -60, collector.z + 92),
      new THREE.Vector3(collector.x * 0.94, -140, collector.z + 108)
    ]), 24, 15, 10, false), MAT.exhaust);
    bankGroup.add(tail);
    P.explode.push({ obj: bankGroup, base: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(-is * 160, -24, 0) });
  }
}

/* 下部曲轴箱、油底壳、主轴承盖 */
function buildBottom() {
  const g = new THREE.Group();
  engine.add(g);
  P.bottom = g;

  const panShape = new THREE.Shape();
  panShape.moveTo(-146, -126); panShape.lineTo(146, -126); panShape.lineTo(124, -172);
  panShape.lineTo(92, -184); panShape.lineTo(-92, -184); panShape.lineTo(-124, -172);
  panShape.closePath();
  // 油底壳做成壳体（开口朝上），避免实体挡住曲轴配重
  const panGeo = extrude(panShape, 464, 4);
  panGeo.translate(0, 0, -235);
  const pan = mesh(panGeo, MAT.castDark, g, 0, 0, 0);
  pan.castShadow = true; pan.receiveShadow = true;

  mesh(boxGeom(240, 6, 430), MAT.castDark, g, 0, -186, 0);
  mesh(cylZ(9, 9, 12, 12), MAT.steel, g, 0, -190, 60);
  // 近侧曲轴箱盖（仅外观视图显示，切面时淡出）
  const crankCover = mesh(boxGeom(14, 104, 448), MAT.cover.clone(), g, 133, -74, 0);
  crankCover.castShadow = true;
  P.covers.push(crankCover);

  // 主轴承座做成框架，俯视可以看到曲轴与连杆
  mesh(boxGeom(26, 22, 452), MAT.cast, g, 118, -26, 0).castShadow = true;
  mesh(boxGeom(26, 22, 452), MAT.cast, g, -118, -26, 0).castShadow = true;
  for (const z of [-216, -108, 0, 108, 216]) {
    mesh(boxGeom(236, 22, 34), MAT.cast, g, 0, -26, z).castShadow = true;
  }
  const capGeo = boxGeom(120, 34, 44);
  const boltGeo = cylZ(5, 5, 40, 8);
  for (const z of [-216, -108, 0, 108, 216]) {
    const cap = mesh(capGeo, MAT.steelDark, g, 0, -46, z);
    cap.castShadow = true;
    mesh(boltGeo, MAT.steel, g, 46, -52, z);
    mesh(boltGeo, MAT.steel, g, -46, -52, z);
  }
  // 曲轴箱侧壁：近侧留空，便于观察曲轴与连杆
  mesh(boxGeom(10, 90, 452), MAT.cast, g, -132, -46, 0).castShadow = true;
  mesh(boxGeom(12, 24, 452), MAT.cast, g, 132, -90, 0).castShadow = true;

  P.explode.push({ obj: g, base: new THREE.Vector3(0, 0, 0), offset: new THREE.Vector3(0, -170, 0) });
}

/* 装配全部 */
function buildEngine() {
  buildCrank();
  buildBank('A');
  buildBank('B');
  buildIntake();
  buildExhaust();
  buildBottom();
  P.anchors.crank = new THREE.Vector3(0, 0, -40);
  P.anchors.plenum = new THREE.Vector3(0, 214, -120);
  P.anchors.flywheel = new THREE.Vector3(0, 0, 252);
}
