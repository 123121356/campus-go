// 3D 캠퍼스 뷰 — OpenStreetMap 건물 윤곽(data/campus3d.json)을 층수만큼 세워 조감도 느낌으로 그린 씬
// 모드: 둘러보기(회전·확대) / 걸어서 보기(1인칭: 속도 1~5단계, 스페이스 두 번 = 비행, R = 리스폰)
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildCampus } from "./buildings3d.js?v=35";
import { initNPCs } from "./npc.js?v=40";
import { buildStreetLights } from "./streetlights.js?v=37";

const LAT0 = 37.4528, LNG0 = 129.1618;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180), MZ = 110950;
const toXZ = ([lng, lat]) => [(lng - LNG0) * MX, -(lat - LAT0) * MZ];

// 조감도처럼: 밝은 벽 + 카테고리별 지붕색
const ROOF = { 강의: 0x4f9d74, 행정: 0xd0503f, 편의: 0x3e95a3, 생활: 0x3f72b8, 체육: 0x3f72b8, 출입: 0x8a94a6, 기타: 0x6f9a5c };
const ROAD_W = { tertiary: 9, tertiary_link: 7, residential: 6, unclassified: 6, living_street: 5, service: 5, pedestrian: 4, footway: 2.2, steps: 2.2, construction: 3 };
const PATHS = new Set(["footway", "steps", "pedestrian", "path"]);

const PALETTE = {
  light: { sky: 0xc5e4f6, fog: 0xd8ecd0, ground: 0x93c95a, outer: 0x7fb84c, road: 0x6c727b, path: 0xe2dcc8, pitch: 0x3f9b48, track: 0xc4553f, court: 0x3a74b8, wall: 0xffffff, edge: 0x3a4250, tree: 0xffffff, hemiSky: 0xffffff, hemiGround: 0x6f8f4a, glow: 0 },
  dark: { sky: 0x0d1626, fog: 0x0d1626, ground: 0x223d27, outer: 0x1b3220, road: 0x2e343d, path: 0x4a4a42, pitch: 0x245a2e, track: 0x6a2e24, court: 0x23466e, wall: 0x7d8594, edge: 0x05080d, tree: 0x5d7a62, hemiSky: 0x9fb2d8, hemiGround: 0x16241a, glow: 0.85 },
};

const SPEED_BASE = 4; // 1단계 = 4 m/s, 한 단계마다 2배
const EYE = 1.7, STEP = 0.6, GRAV = 22, MAX_ALT = 180, BOUND_MARGIN = 28;

function pip(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
function hull(pts) { // 볼록 껍질 (monotone chain)
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }

function windowTextures() {
  const mk = (draw) => { const c = document.createElement("canvas"); c.width = c.height = 64; draw(c.getContext("2d")); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3.2, 1 / 3.6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const map = mk((g) => {
    g.fillStyle = "#f3efe4"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#e3ddcf"; g.fillRect(0, 56, 64, 8); // 층 띠
    g.fillStyle = "#6f8fae"; g.fillRect(12, 14, 40, 30);
    g.fillStyle = "#a9c3dc"; g.fillRect(14, 16, 17, 12);
    g.fillStyle = "#e9e4d8"; g.fillRect(31, 14, 2, 30);
  });
  const glow = mk((g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#ffcf72"; g.fillRect(12, 14, 40, 30); });
  return { map, glow };
}

export function init3D(container, { data, buildings, onSelect, theme = "light" }) {
  const W = () => container.clientWidth, H = () => container.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.3, 4000);
  // 조감도와 같은 방향: 운동장이 화면 아래, 정문이 왼쪽
  const HOME_POS = new THREE.Vector3(560, 360, 40), HOME_T = new THREE.Vector3(40, 0, -30);
  camera.position.copy(HOME_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_T);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 25;
  controls.maxDistance = 1100;
  controls.screenSpacePanning = false;

  // 조명
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6f8f4a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
  sun.position.set(320, 420, 260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -520, right: 520, top: 520, bottom: -520, near: 10, far: 1500 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // ---------- 캠퍼스 영역 (건물·운동장을 감싸는 볼록 껍질 + 여유) ----------
  const bInfo = new Map(buildings.map((b) => [b.id, b]));
  const hullPts = [];
  for (const f of data.features) {
    const p = f.properties;
    if ((p.kind === "building" && (p.campus || p.id)) || p.kind === "pitch") f.geometry.coordinates[0].forEach((c) => hullPts.push(toXZ(c)));
  }
  buildings.forEach((b) => hullPts.push(toXZ([b.lng, b.lat])));
  const H0 = hull(hullPts);
  const distToHull = (x, z) => { let d = Infinity; for (let i = 0, j = H0.length - 1; i < H0.length; j = i++) d = Math.min(d, segDist(x, z, H0[j][0], H0[j][1], H0[i][0], H0[i][1])); return d; };
  const inBounds = (x, z, m = BOUND_MARGIN) => pip(x, z, H0) || distToHull(x, z) <= m;
  // 여유만큼 바깥으로 민 경계선(울타리 표시용)
  const cx = H0.reduce((s, p) => s + p[0], 0) / H0.length, cz = H0.reduce((s, p) => s + p[1], 0) / H0.length;
  const fenceRing = H0.map(([x, z], i) => {
    const a = H0[(i - 1 + H0.length) % H0.length], b = H0[(i + 1) % H0.length];
    const n1 = [-(z - a[1]), x - a[0]], n2 = [-(b[1] - z), b[0] - x];
    let nx = n1[0] / Math.hypot(...n1) + n2[0] / Math.hypot(...n2), nz = n1[1] / Math.hypot(...n1) + n2[1] / Math.hypot(...n2);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
    return [x + nx * BOUND_MARGIN, z + nz * BOUND_MARGIN];
  });
  const bMinX = Math.min(...fenceRing.map((p) => p[0])), bMaxX = Math.max(...fenceRing.map((p) => p[0]));
  const bMinZ = Math.min(...fenceRing.map((p) => p[1])), bMaxZ = Math.max(...fenceRing.map((p) => p[1]));

  // ---------- 바닥: 바깥 녹지 + 캠퍼스 잔디 ----------
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x7fb84c, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), outerMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x93c95a, roughness: 1 });
  const lawn = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(fenceRing.map(([x, z]) => new THREE.Vector2(x, -z)))), groundMat);
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.02; lawn.receiveShadow = true; scene.add(lawn);
  // 조감도처럼 캠퍼스를 둘러싼 낮은 언덕
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x7fb84c, roughness: 1, flatShading: false });
  const r1 = rng(7);
  // 건물 기초면 확보: 언덕이 건물 터(+여유 FOOT_PAD m)를 덮지 않도록 바깥으로 민다 (해솔관·두타관이 경사에 묻혔던 문제)
  const FOOT_PAD = 14, footPts = [];
  for (const f of data.features) if (f.properties.kind === "building") f.geometry.coordinates[0].forEach((c) => footPts.push(toXZ(c)));
  buildings.forEach((b) => footPts.push(toXZ([b.lng, b.lat])));
  const coversFoot = (hx, hz, sx, sz) => footPts.some(([px, pz]) => ((px - hx) / (sx + FOOT_PAD)) ** 2 + ((pz - hz) / (sz + FOOT_PAD)) ** 2 < 1);
  for (let i = 0; i < fenceRing.length; i += 1) {
    const [x, z] = fenceRing[i], dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
    let d = 150 + r1() * 120;
    const s = 140 + r1() * 120, hy = 25 + r1() * 45, sz = s * (0.7 + r1() * 0.5);
    for (let k = 0; k < 60 && coversFoot(x + (dx / l) * d, z + (dz / l) * d, s, sz); k++) d += 8;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.set(s, hy, sz);
    hill.position.set(x + (dx / l) * d, -2, z + (dz / l) * d);
    hill.receiveShadow = true; scene.add(hill);
  }

  // ---------- 도로·보행로 ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x6c727b, roughness: 0.95, side: THREE.DoubleSide });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xe2dcc8, roughness: 1, side: THREE.DoubleSide });
  const roadPos = [], pathPos = [], roadSegs = [];
  for (const f of data.features) {
    if (f.properties.kind !== "road") continue;
    const isPath = PATHS.has(f.properties.highway), out = isPath ? pathPos : roadPos;
    const w = (ROAD_W[f.properties.highway] || 4) / 2, y = isPath ? 0.07 : 0.06;
    const pts = f.geometry.coordinates.map(toXZ);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      roadSegs.push([x1, z1, x2, z2, w]);
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1, nx = (-dz / len) * w, nz = (dx / len) * w;
      out.push(x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 + nx, y, z2 + nz, x1 - nx, y, z1 - nz, x2 - nx, y, z2 - nz);
    }
    for (const [x, z] of pts) for (let k = 0; k < 10; k++) { // 꺾인 곳 이음새 메우기
      const a = (k / 10) * Math.PI * 2, b = ((k + 1) / 10) * Math.PI * 2;
      out.push(x, y, z, x + Math.cos(a) * w, y, z + Math.sin(a) * w, x + Math.cos(b) * w, y, z + Math.sin(b) * w);
    }
  }
  for (const [pos, mat] of [[roadPos, roadMat], [pathPos, pathMat]]) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  }
  const nearRoad = (x, z, pad) => roadSegs.some(([a, b, c, d, w]) => segDist(x, z, a, b, c, d) < w + pad);

  // ---------- 운동장·트랙·코트 ----------
  const pitchMat = new THREE.MeshStandardMaterial({ color: 0x3f9b48, roughness: 1 });
  const trackMat = new THREE.MeshStandardMaterial({ color: 0xc4553f, roughness: 1 });
  const courtMat = new THREE.MeshStandardMaterial({ color: 0x3a74b8, roughness: 1 });
  const pitches = [];
  for (const f of data.features) {
    if (f.properties.kind !== "pitch") continue;
    const sp = f.properties.sport, ring = f.geometry.coordinates[0].map(toXZ);
    pitches.push(ring);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))), sp === "tennis" ? courtMat : sp ? pitchMat : trackMat);
    m.rotation.x = -Math.PI / 2; m.position.y = sp ? 0.3 : 0.15; m.receiveShadow = !sp; m.receiveShadow = true; scene.add(m);
  }

  // ---------- 건물 (공식 사진 참고 모델: buildings3d.js) ----------
  let built;
  try { built = buildCampus({ scene, data, bInfo, roads: roadSegs, toXZ, buildings, pip }); }
  catch (e) { console.error("상세 건물 모델 실패 → 기본 모델로 표시", e); built = simpleCampus(); }
  // 상세 모델이 실패해도 3D는 뜨도록: 윤곽을 층수만큼 세운 기본 건물
  function simpleCampus() {
    for (let i = scene.children.length - 1; i >= 0; i--) if (scene.children[i].userData?.fromDetail) scene.remove(scene.children[i]);
    const meshes = [], byId = new Map(), solids = [], wallMats = [], edgeMat = new THREE.LineBasicMaterial({ color: 0x3a4250, transparent: true, opacity: 0.22 });
    const t = windowTextures(), wall = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.glow, emissive: 0, roughness: 0.8 }); wallMats.push(wall);
    for (const f of data.features) {
      if (f.properties.kind !== "building") continue;
      const p = f.properties, ring = f.geometry.coordinates[0].map(toXZ), xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
      solids.push({ ring, h: p.height, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: p.height, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      const roof = new THREE.MeshStandardMaterial({ color: ROOF[bInfo.get(p.id)?.category] || 0x9aa79a });
      const m = new THREE.Mesh(geo, [roof, wall]); m.castShadow = m.receiveShadow = true; m.userData = { id: p.id, roof }; scene.add(m);
      if (p.id) { meshes.push(m); geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); byId.set(p.id, { mesh: m, center: new THREE.Vector3(c.x, p.height, c.z), radius: 30, ring }); }
    }
    for (const b of buildings) { if (byId.has(b.id)) continue; const [x, z] = toXZ([b.lng, b.lat]); const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 12), new THREE.MeshStandardMaterial({ color: 0x2563eb })); m.position.set(x, 3, z); m.userData = { id: b.id }; scene.add(m); meshes.push(m); byId.set(b.id, { mesh: m, center: new THREE.Vector3(x, 6, z), radius: 8, point: true }); }
    return { meshes, byId, solids, wallMats, glassMats: [], edgeMat, changed: [], fallback: true };
  }
  const { meshes, byId, solids, wallMats, glassMats, edgeMat } = built;
  const inSolid = (x, z, pad = 0) => solids.some((s) => x > s.box[0] - pad && x < s.box[2] + pad && z > s.box[1] - pad && z < s.box[3] + pad && (pad ? pip(x, z, s.ring) || pip(x + pad, z, s.ring) || pip(x - pad, z, s.ring) || pip(x, z + pad, s.ring) || pip(x, z - pad, s.ring) : pip(x, z, s.ring)));
  // 가로등: 도로를 따라 세우고 밤(다크 테마)에만 켬
  const lamps = buildStreetLights({ scene, roadSegs, inSolid, inBounds });

  // ---------- 나무 (인스턴스) ----------
  const rand = rng(20251106), treeSpots = [];
  const tryTree = (x, z) => {
    if (!inBounds(x, z, 70) || inSolid(x, z, 4) || nearRoad(x, z, 2.5) || pitches.some((r) => pip(x, z, r))) return;
    treeSpots.push([x, z]);
  };
  for (let i = 0; i < 2600 && treeSpots.length < 900; i++) {
    const x = bMinX - 70 + rand() * (bMaxX - bMinX + 140), z = bMinZ - 70 + rand() * (bMaxZ - bMinZ + 140);
    const inner = pip(x, z, H0);
    if (inner && rand() < 0.55) continue; // 캠퍼스 안은 조금 성기게, 가장자리 숲은 빽빽하게
    tryTree(x, z);
  }
  const crownGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, treeMat, treeSpots.length), trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), col = new THREE.Color();
  const GREENS = [0x3f8f3a, 0x4ea145, 0x5bb04d, 0x367d34, 0x6bbd55];
  treeSpots.forEach(([x, z], i) => {
    const s = 2.2 + rand() * 2.6, th = 2 + rand() * 1.5;
    M4.compose(P3.set(x, th + s * 0.8, z), Q.setFromAxisAngle(S3.set(0, 1, 0), rand() * 6), S3.set(s, s * (0.9 + rand() * 0.4), s)); crowns.setMatrixAt(i, M4);
    crowns.setColorAt(i, col.setHex(GREENS[(rand() * GREENS.length) | 0]));
    M4.compose(P3.set(x, th / 2, z), Q.identity(), S3.set(1, th, 1)); trunks.setMatrixAt(i, M4);
  });
  crowns.castShadow = true; trunks.castShadow = true;
  scene.add(crowns, trunks);

  // ---------- 캠퍼스 경계 울타리 ----------
  const fenceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  { const fp = [];
    for (let i = 0; i < fenceRing.length; i++) {
      const [x1, z1] = fenceRing[i], [x2, z2] = fenceRing[(i + 1) % fenceRing.length];
      fp.push(x1, 0, z1, x2, 0, z2, x2, 1.4, z2, x1, 0, z1, x2, 1.4, z2, x1, 1.4, z1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    scene.add(new THREE.Mesh(g, fenceMat)); }

  // 선택 표시(떠 있는 화살표)
  const beacon = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 4), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  beacon.rotation.x = Math.PI; beacon.visible = false; scene.add(beacon);

  // ---------- 이름표 ----------
  const labelLayer = document.createElement("div");
  labelLayer.className = "v3d-labels";
  container.appendChild(labelLayer);
  const labels = [];
  for (const [id, o] of byId) {
    const b = bInfo.get(id);
    if (!b) continue;
    const el = document.createElement("button");
    el.className = "v3d-label";
    el.textContent = b.no ? `${b.no} ${b.name.replace(/^제/, "")}` : b.name;
    el.addEventListener("click", (e) => { e.stopPropagation(); pick(id, true); });
    labelLayer.appendChild(el);
    labels.push({ id, el, pos: o.center.clone().add(new THREE.Vector3(0, 3, 0)) });
  }

  // ---------- UI ----------
  const ui = document.createElement("div");
  ui.className = "v3d-ui";
  ui.innerHTML = `
    <div class="v3d-bar">
      <button data-a="walk">🚶 걸어서 보기</button>
      <button data-a="reset">전체 보기</button>
    </div>
    <div class="v3d-hud" hidden>
      <div class="v3d-row">
        <button data-a="slow" aria-label="느리게">−</button>
        <span class="v3d-speed"></span>
        <button data-a="fast" aria-label="빠르게">+</button>
        <button data-a="fly" class="v3d-fly"></button>
        <button data-a="respawn">↺ 리스폰</button>
        <button data-a="exit">나가기</button>
      </div>
      <div class="v3d-hint"></div>
    </div>
    <div class="v3d-cross" hidden>+</div>
    <div class="v3d-pad" hidden>
      <button data-k="f">▲</button><button data-k="l">◀</button><button data-k="b">▼</button><button data-k="r">▶</button>
      <button data-k="up" class="alt">⤒</button><button data-k="down" class="alt">⤓</button>
    </div>
    <div class="v3d-caption" hidden></div>`;
  container.appendChild(ui);
  const $ui = (s) => ui.querySelector(s);
  const hud = $ui(".v3d-hud"), hint = $ui(".v3d-hint"), cross = $ui(".v3d-cross"), pad = $ui(".v3d-pad"), caption = $ui(".v3d-caption");

  // ---------- 테마 ----------
  function applyTheme(t) {
    const P = PALETTE[t] || PALETTE.light;
    scene.background = new THREE.Color(P.sky);
    scene.fog = new THREE.Fog(P.fog, 700, 2200);
    groundMat.color.setHex(P.ground); outerMat.color.setHex(P.outer); hillMat.color.setHex(P.outer);
    roadMat.color.setHex(P.road); pathMat.color.setHex(P.path);
    pitchMat.color.setHex(P.pitch); trackMat.color.setHex(P.track); courtMat.color.setHex(P.court);
    for (const m of wallMats) { m.color.setHex(P.wall); m.emissive.setHex(P.glow ? 0xffffff : 0x000000); m.emissiveIntensity = P.glow; }
    for (const m of glassMats) { m.color.setHex(t === "dark" ? 0x8090a8 : 0xffffff); m.emissive.setHex(t === "dark" ? 0x1a2a40 : 0x000000); }
    edgeMat.color.setHex(P.edge); treeMat.color.setHex(P.tree);
    hemi.color.setHex(P.hemiSky); hemi.groundColor.setHex(P.hemiGround);
    sun.intensity = t === "dark" ? 0.6 : 2.0;
    hemi.intensity = t === "dark" ? 0.7 : 1.1;
    fenceMat.opacity = t === "dark" ? 0.18 : 0.35;
    lamps.setNight(t === "dark");
  }
  applyTheme(theme);

  // ---------- 선택 ----------
  let selected = null;
  function highlight(id) {
    const prev = selected && byId.get(selected);
    if (prev?.mesh.userData.roof) prev.mesh.userData.roof.emissive.setHex(0x000000);
    selected = id;
    const o = byId.get(id);
    if (o?.mesh.userData.roof) { o.mesh.userData.roof.emissive.setHex(0x2563eb); o.mesh.userData.roof.emissiveIntensity = 0.55; }
    beacon.visible = !!o;
    if (o) beacon.position.set(o.center.x, o.center.y + 12, o.center.z);
    labels.forEach((l) => l.el.classList.toggle("on", l.id === id));
    if (mode === "walk") updateHud();
  }
  function pick(id, notify) {
    highlight(id);
    if (mode === "orbit") flyTo(id);
    if (notify) onSelect?.(id);
  }

  // ---------- 카메라 이동 ----------
  let anim = null;
  function tweenCam(toPos, toTarget, ms = 1100) {
    const fromPos = camera.position.clone(), fromT = controls.target.clone(), t0 = performance.now();
    anim = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(fromPos, toPos, e);
      controls.target.lerpVectors(fromT, toTarget, e);
      if (k >= 1) anim = null;
    };
  }
  function flyTo(id, ms) {
    const o = byId.get(id);
    if (!o) return;
    const t = new THREE.Vector3(o.center.x, o.center.y * 0.5, o.center.z);
    const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
    if (!isFinite(dir.x) || dir.length() < 0.1) dir.set(1, 0, 0.1).normalize();
    const d = Math.max(70, o.radius * 2.6 + o.center.y * 1.5);
    tweenCam(t.clone().add(dir.multiplyScalar(d)).setY(t.y + d * 0.75), t, ms);
  }
  function resetView() { tweenCam(HOME_POS.clone(), HOME_T.clone()); }

  // 클릭으로 건물 고르기 (드래그와 구분)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (mode !== "orbit" || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit?.object.userData.id) pick(hit.object.userData.id, true);
  });

  // ---------- 걸어서 보기 (1인칭) ----------
  let mode = "orbit";
  const keys = {}, look = { yaw: 0, pitch: 0 };
  const me = { x: 0, z: 0, feet: 0, vy: 0, flying: false, level: 1 };
  const touch = matchMedia("(pointer: coarse)").matches;
  // 발 높이에서 서 있을 수 있는 바닥(땅 또는 지붕)
  function floorAt(x, z, feet) {
    let f = 0;
    for (const s of solids) if (s.h <= feet + STEP && s.h > f && x > s.box[0] && x < s.box[2] && z > s.box[1] && z < s.box[3] && pip(x, z, s.ring)) f = s.h;
    return f;
  }
  // 벽: 발보다 높은 건물 안으로는 못 들어감
  function blocked(x, z, feet) {
    if (!inBounds(x, z)) return true;
    for (const s of solids) if (s.h > feet + STEP && x > s.box[0] && x < s.box[2] && z > s.box[1] && z < s.box[3] && pip(x, z, s.ring)) return true;
    return false;
  }
  const speed = () => SPEED_BASE * 2 ** (me.level - 1);
  function updateHud() {
    $ui(".v3d-speed").innerHTML = `속도 <b>${me.level}</b>/5 · ${speed()} m/s`;
    $ui('[data-a="slow"]').disabled = me.level <= 1;
    $ui('[data-a="fast"]').disabled = me.level >= 5;
    const fly = $ui(".v3d-fly");
    fly.textContent = me.flying ? "🕊 비행 중" : "🕊 비행";
    fly.classList.toggle("on", me.flying);
    pad.querySelectorAll(".alt").forEach((b) => (b.hidden = !me.flying));
    const tgt = selected && bInfo.get(selected)?.name;
    $ui('[data-a="respawn"]').textContent = `↺ 리스폰${tgt ? " · " + tgt : " · 정문"}`;
    hint.innerHTML = touch
      ? "화면을 끌어 둘러보고 버튼으로 이동 · 건물을 보고 탭하면 정보 · 안내원 앞에서 대화 버튼"
      : `클릭 → 마우스로 둘러보기 · <b>WASD</b> 이동 · <b>+ / −</b> 속도 · <b>Space 두 번</b> ${me.flying ? "비행 끝(떨어짐)" : "비행"} · ${me.flying ? "<b>Space</b> 위로 · <b>C</b> 아래로 · " : "<b>Space</b> 점프 · "}<b>E</b> 안내원과 대화 · <b>T</b> AI 요정과 대화 · <b>G</b> 길안내 화살표 · <b>R</b> 리스폰 · <b>Esc</b> 나가기`;
  }
  function setLevel(n) { me.level = Math.max(1, Math.min(5, n)); updateHud(); flash(`속도 ${me.level}단계 · ${speed()} m/s`); }
  function setFly(on) {
    me.flying = on; me.vy = 0;
    if (on && me.feet < 1) me.feet = 1.5; // 살짝 떠오름
    updateHud(); flash(on ? "🕊 비행 시작 — Space 위로, C 아래로" : "비행 끝 — 떨어져요!");
  }
  let flashT = null;
  function flash(text) { caption.hidden = false; caption.innerHTML = `<b>${text}</b>`; clearTimeout(flashT); flashT = setTimeout(() => (caption.hidden = true), 1600); }

  // 리스폰 지점: 선택된 건물 바깥, 가장 가까운 길 위 (없으면 정문)
  function spawnPoint(id) {
    const o = id && byId.get(id);
    const gate = byId.get("n114")?.center;
    if (!o) return gate ? { x: gate.x, z: gate.z - 6, face: [gate.x, gate.z - 60] } : { x: 0, z: 60, face: [0, 0] };
    const c = o.center;
    let best = null, bd = Infinity;
    for (const [x1, z1, x2, z2] of roadSegs) {
      const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n, z = z1 + ((z2 - z1) * k) / n, d = Math.hypot(x - c.x, z - c.z);
        if (d > bd || d < 3 || !inBounds(x, z, 0) || inSolid(x, z, 1.5)) continue;
        const score = d + (inSolid(x, z, 10) ? 60 : 0) + (d < (o.radius || 8) * 0.7 + 12 ? 40 : 0); // 건물이 한눈에 보이게 조금 떨어진 곳
        if (score < bd) { bd = score; best = { x, z }; }
      }
    }
    if (!best || bd > 200) { // 길이 멀면 건물 둘레에서 빈 곳 찾기
      for (let r = (o.radius || 8) * 0.6; r < 120 && !best; r += 3)
        for (let a = 0; a < 16; a++) { const x = c.x + Math.cos((a / 16) * 6.283) * r, z = c.z + Math.sin((a / 16) * 6.283) * r; if (!inSolid(x, z, 1.5) && inBounds(x, z, 0)) { best = { x, z }; break; } }
    }
    best = best || { x: c.x + 20, z: c.z };
    return { ...best, face: [c.x, c.z] };
  }
  function respawn() {
    const p = spawnPoint(selected);
    me.x = p.x; me.z = p.z; me.vy = 0; me.flying = false;
    me.feet = floorAt(p.x, p.z, 0);
    look.yaw = Math.atan2(-(p.face[0] - p.x), -(p.face[1] - p.z)); look.pitch = 0.08;
    updateHud();
    flash(`↺ ${selected ? bInfo.get(selected)?.name + " 앞" : "정문"}에서 시작`);
  }

  function startWalk() {
    mode = "walk";
    controls.enabled = false;
    anim = null;
    labels.forEach((l) => l.el.classList.add("walk"));
    cross.hidden = false; pad.hidden = !touch; hud.hidden = false;
    $ui('[data-a="walk"]').textContent = "🛰 둘러보기로";
    respawn();
  }
  function stopWalk() {
    if (mode !== "walk") return;
    mode = "orbit";
    if (document.pointerLockElement) document.exitPointerLock();
    Object.keys(keys).forEach((k) => (keys[k] = false));
    controls.enabled = true;
    labels.forEach((l) => l.el.classList.remove("walk"));
    npc.closeChat();
    cross.hidden = true; pad.hidden = true; hud.hidden = true; caption.hidden = true;
    $ui('[data-a="walk"]').textContent = "🚶 걸어서 보기";
    resetView();
  }
  // ---------- 건물 안내 NPC (E키로 대화, 5공 앞은 AI 채팅) ----------
  const npc = initNPCs({
    scene, camera, container, byId, bInfo, roadSegs, inSolid, inBounds, me, getMode: () => mode,
    onOpenChat() { if (document.pointerLockElement) document.exitPointerLock(); Object.keys(keys).forEach((k) => (keys[k] = false)); },
    onTarget(id) { highlight(id); }, // 길안내 목적지: 빨간 표시 + R키 리스폰 위치
  });
  function lookingAt() {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit && hit.distance < (me.flying ? 400 : 120) ? hit.object.userData.id : null;
  }
  renderer.domElement.addEventListener("click", () => {
    if (mode !== "walk") return;
    if (!touch && !document.pointerLockElement) { renderer.domElement.requestPointerLock?.(); return; }
    const id = lookingAt();
    if (id) { highlight(id); onSelect?.(id); }
  });
  document.addEventListener("mousemove", (e) => {
    if (mode !== "walk" || document.pointerLockElement !== renderer.domElement) return;
    look.yaw -= e.movementX * 0.0025;
    look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch - e.movementY * 0.0025));
  });
  let lastTouch = null;
  renderer.domElement.addEventListener("touchstart", (e) => { if (mode === "walk") lastTouch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
  renderer.domElement.addEventListener("touchmove", (e) => {
    if (mode !== "walk" || !lastTouch) return;
    const t = e.touches[0];
    look.yaw -= (t.clientX - lastTouch[0]) * 0.005;
    look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch - (t.clientY - lastTouch[1]) * 0.005));
    lastTouch = [t.clientX, t.clientY];
  }, { passive: true });

  let lastSpace = 0;
  const KEYMAP = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", ShiftLeft: "fast", ShiftRight: "fast", Space: "up", KeyC: "down", ControlLeft: "down", ControlRight: "down" };
  const onKey = (down) => (e) => {
    if (mode !== "walk" || container.hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = down; e.preventDefault(); }
    if (!down) return;
    if (e.code === "Space" && !e.repeat) {
      const now = performance.now();
      if (now - lastSpace < 350) { setFly(!me.flying); lastSpace = 0; }
      else { lastSpace = now; if (!me.flying && me.vy === 0 && Math.abs(me.feet - floorAt(me.x, me.z, me.feet)) < 0.05) me.vy = 7; } // 점프
    }
    if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") { setLevel(me.level + 1); e.preventDefault(); }
    if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") { setLevel(me.level - 1); e.preventDefault(); }
    if (e.code === "KeyR" && !e.repeat) respawn();
    if (e.code === "KeyE" && !e.repeat) npc.interact();
    if (e.code === "KeyT" && !e.repeat) { npc.talkAI(); e.preventDefault(); }
    if (e.code === "KeyG" && !e.repeat && npc.toggleArrow()) flash(npc.guide.on ? "🧭 길안내 화살표 켬" : "길안내 화살표 끔 (G로 다시 켜기)");
    if (e.code === "Escape" && !document.pointerLockElement) stopWalk();
  };
  document.addEventListener("keydown", onKey(true));
  document.addEventListener("keyup", onKey(false));
  pad.querySelectorAll("button").forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => (keys[k] = false)));
  });

  ui.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-a]"), a = btn?.dataset.a;
    if (!a) return;
    btn.blur(); // 스페이스바가 버튼을 다시 누르지 않도록
    if (a === "walk") mode === "walk" ? stopWalk() : startWalk();
    else if (a === "reset") { stopWalk(); resetView(); }
    else if (a === "exit") stopWalk();
    else if (a === "fast") setLevel(me.level + 1);
    else if (a === "slow") setLevel(me.level - 1);
    else if (a === "fly") setFly(!me.flying);
    else if (a === "respawn") respawn();
  });

  function stepWalk(dt) {
    const sp = speed() * (keys.fast ? 2 : 1) * dt;
    const fwd = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3();
    if (keys.f) mv.add(fwd); if (keys.b) mv.sub(fwd); if (keys.r) mv.add(right); if (keys.l) mv.sub(right);
    if (mv.lengthSq()) {
      mv.normalize().multiplyScalar(sp);
      // 빠른 속도에서도 벽을 뚫지 않도록 잘게 나눠 이동
      const n = Math.max(1, Math.ceil(sp / 0.8));
      for (let i = 0; i < n; i++) {
        const nx = me.x + mv.x / n, nz = me.z + mv.z / n;
        if (!blocked(nx, me.z, me.feet)) me.x = nx; // 벽에 닿으면 미끄러지듯
        if (!blocked(me.x, nz, me.feet)) me.z = nz;
      }
    }
    if (me.flying) {
      const vs = Math.max(4, speed() * 0.6) * dt;
      if (keys.up) me.feet = Math.min(MAX_ALT, me.feet + vs);
      if (keys.down) me.feet = Math.max(floorAt(me.x, me.z, me.feet), me.feet - vs);
    } else {
      me.vy -= GRAV * dt;
      me.feet += me.vy * dt;
      const fl = floorAt(me.x, me.z, me.feet - me.vy * dt);
      if (me.feet <= fl) { me.feet = fl; me.vy = 0; }
    }
    camera.position.set(me.x, me.feet + EYE, me.z);
    camera.rotation.set(look.pitch, look.yaw, 0, "YXZ");
  }

  // ---------- 렌더 루프 ----------
  const clock = new THREE.Clock(), v = new THREE.Vector3();
  let running = true, lastLook = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (anim) anim(now);
    if (beacon.visible) { beacon.rotation.y += dt * 1.5; const o = byId.get(selected); if (o) beacon.position.y = o.center.y + 12 + Math.sin(now / 300) * 1.5; }
    if (mode === "walk") {
      stepWalk(dt);
      if (now - lastLook > 200) {
        lastLook = now;
        const id = lookingAt();
        cross.classList.toggle("on", !!id);
        cross.dataset.name = id ? bInfo.get(id)?.name || "" : "";
      }
    } else {
      controls.update();
      // 둘러보기 중심점도 캠퍼스 밖으로 못 나가게
      controls.target.x = Math.max(bMinX, Math.min(bMaxX, controls.target.x));
      controls.target.z = Math.max(bMinZ, Math.min(bMaxZ, controls.target.z));
    }
    npc.update(dt, now);
    lamps.update(mode === "walk" ? camera.position : controls.target, now);
    renderer.render(scene, camera);
    placeLabels();
  }
  // 이름표 배치: 선택된 것 → 가까운 것 순으로, 겹치면 숨김
  function placeLabels() {
    const w = W(), h = H(), placed = [];
    const far = mode === "orbit" ? 1000 : me.flying ? 500 : 90;
    const items = labels.map((l) => {
      v.copy(l.pos).project(camera);
      return { l, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, d: camera.position.distanceTo(l.pos) };
    }).sort((a, b) => (b.l.id === selected) - (a.l.id === selected) || a.d - b.d);
    for (const it of items) {
      const { l, x, y } = it;
      let show = it.z < 1 && x > -40 && x < w + 40 && y > 0 && y < h + 20 && it.d < far;
      if (show) {
        const bw = l.el.offsetWidth || 80, bh = 22;
        const r = [x - bw / 2 - 2, y - bh - 2, x + bw / 2 + 2, y];
        if (l.id !== selected && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) show = false;
        else placed.push(r);
      }
      l.el.style.display = show ? "" : "none";
      if (show) l.el.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
    }
  }
  requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => {
    if (!W() || !H()) return;
    renderer.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    // 디버그·테스트용: 애니메이션 없이 한 번 그리기 (탭이 백그라운드일 때 확인용)
    renderOnce(dt = 0) { if (anim) anim(performance.now() + 5000); if (mode === "orbit") controls.update(); else stepWalk(dt); npc.update(dt || 0.016, performance.now()); renderer.render(scene, camera); placeLabels(); },
    // 건물 선택: 둘러보기면 그쪽으로 이동, 걷기 중이면 리스폰 위치만 바꿈
    focus(id) { highlight(id); if (mode === "walk") flash(`리스폰 위치: ${bInfo.get(id)?.name || ""} (R)`); else flyTo(id); },
    setTarget(id) { highlight(id); },
    // AI 요정에게 질문: 걷기 모드로 들어가 채팅을 연다
    async askAI(text) { if (mode !== "walk") startWalk(); await npc.ready; return npc.openAI(text); },
    setTheme: applyTheme,
    pause() { running = false; if (mode === "walk") stopWalk(); },
    resume() { if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); } },
    _debug: { npc, look, changed: built.changed, me, keys, startWalk, stopWalk, respawn, setLevel, setFly, inBounds, get mode() { return mode; }, trees: treeSpots.length },
  };
}
