// 제1공학관(n121) · 제2공학관(n122) 전용 3D 모델 — "두 건물 3D 뷰어" HTML 의 건물 부분을 캠퍼스 3D 지도에 옮긴 것.
//  - 제2공학관 = 사진 왼쪽 동: 4층 흰 외벽, 주황·파랑 컬러 패널, 옥상 철골 구조물, 끝 동의 파란 현관
//  - 제1공학관 = 사진 오른쪽 동: 3층 흰 벽기둥 + 연속 가로창 + 적벽돌 띠, 녹색 지붕, 적벽돌 옥탑, 가운데 현관, 끝 유리 로비
// 크기는 OSM 윤곽(약 80 m × 22 m)에 맞춰 늘이거나 줄인다. 로컬 좌표: x = 길이 방향, z = 정면(두 건물 사이 주차장) 방향.
import * as THREE from "three";

/* ---------- 질감 ---------- */
const PPM = 80;
function solidTex(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 4;
  const g = c.getContext("2d"); g.fillStyle = hex; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function tile(tw, th, draw) {
  const c = document.createElement("canvas"); c.width = Math.round(tw * PPM); c.height = Math.round(th * PPM);
  const g = c.getContext("2d");
  const R = (x0, y0, x1, y1) => [x0 * PPM, (th - y1) * PPM, (x1 - x0) * PPM, (y1 - y0) * PPM];
  draw(g, R);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { map: t, tw, th };
}
function glass(g, R, x0, y0, x1, y1, mull) {
  const [x, y, w, h] = R(x0, y0, x1, y1);
  const gr = g.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, "#506676"); gr.addColorStop(1, "#25313b");
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(255,255,255,.10)"; g.fillRect(x, y, w * 0.35, h);
  g.fillStyle = "#f4f4f0";
  for (const m of mull) g.fillRect(x + m * w - 2, y, 4, h);
  g.strokeStyle = "#f7f7f3"; g.lineWidth = 5; g.strokeRect(x, y, w, h);
}
function bricks(g, R, x0, y0, x1, y1, tones, mortar) {
  const [x, y, w, h] = R(x0, y0, x1, y1);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = mortar; g.fillRect(x, y, w, h);
  const bw = 0.21 * PPM, bh = 0.065 * PPM;
  let r = 0;
  for (let yy = y; yy < y + h; yy += bh, r++)
    for (let xx = x - (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
      g.fillStyle = tones[(r * 5 + Math.floor(xx / bw) * 3) % tones.length];
      g.fillRect(xx + 0.5, yy + 0.5, bw - 1, bh - 1);
    }
  g.restore();
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const RED = ["#a8452f", "#b44f37", "#9c3f2b", "#ad4a33"];
  TEX = {
    L: tile(3.6, 3.4, (g, R) => {
      g.fillStyle = "#f2f2ee"; g.fillRect(...R(0, 0, 3.6, 3.4));
      glass(g, R, 0.35, 1.0, 3.25, 2.75, [1 / 3, 2 / 3]);
      g.fillStyle = "#d8d8d2"; g.fillRect(...R(0.25, 0.86, 3.35, 1.0));
      g.fillStyle = "#e1e1dc"; g.fillRect(...R(0, 0, 3.6, 0.12));
    }),
    L2: tile(3.6, 3.4, (g, R) => {
      g.fillStyle = "#efefea"; g.fillRect(...R(0, 0, 3.6, 3.4));
      glass(g, R, 0.9, 1.1, 2.7, 2.6, [0.5]);
      g.fillStyle = "#e1e1dc"; g.fillRect(...R(0, 0, 3.6, 0.12));
    }),
    R: tile(5, 3.6, (g, R) => {
      g.fillStyle = "#f1f1ec"; g.fillRect(...R(0, 0, 5, 3.6));
      bricks(g, R, 0.4, 0.35, 4.6, 1.25, RED, "#d6cfc2");
      glass(g, R, 0.4, 1.4, 4.6, 3.15, [0.25, 0.5, 0.75]);
      g.fillStyle = "#e4e4de"; g.fillRect(...R(0, 0, 0.4, 3.6)); g.fillRect(...R(4.6, 0, 5, 3.6));
    }),
    R2: tile(5, 3.6, (g, R) => {
      g.fillStyle = "#efefea"; g.fillRect(...R(0, 0, 5, 3.6));
      glass(g, R, 1.4, 1.3, 3.6, 3.0, [0.5]);
    }),
  };
  return TEX;
}

/* ---------- 공통 틀 ---------- */
// 사각 윤곽 → 중심 · 길이 축 · 깊이 축. hint.front / hint.x 와 가장 가까운 방향을 로컬 +z / +x 로 고른다.
function frame(ring, hint) {
  const pts = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  let bi = 0, bl = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; bi = i; } });
  const p = pts[bi], q = pts[(bi + 1) % pts.length];
  let u = [(q[0] - p[0]) / bl, (q[1] - p[1]) / bl];
  let v = [-u[1], u[0]];
  const cx = pts.reduce((s, a) => s + a[0], 0) / pts.length, cz = pts.reduce((s, a) => s + a[1], 0) / pts.length;
  let L = 0, D = 0;
  for (const a of pts) { L = Math.max(L, Math.abs((a[0] - cx) * u[0] + (a[1] - cz) * u[1])); D = Math.max(D, Math.abs((a[0] - cx) * v[0] + (a[1] - cz) * v[1])); }
  if (v[0] * hint.front[0] + v[1] * hint.front[1] < 0) v = [-v[0], -v[1]];
  if (u[0] * hint.x[0] + u[1] * hint.x[1] < 0) u = [-u[0], -u[1]];
  return { pts, cx, cz, u, v, L: L * 2, D: D * 2 };
}
function place(group, F) {
  group.position.set(F.cx, 0, F.cz);
  group.rotation.y = Math.atan2(F.v[0], F.v[1]);               // 로컬 +z → v
  const rx = [Math.cos(group.rotation.y), -Math.sin(group.rotation.y)];
  if (rx[0] * F.u[0] + rx[1] * F.u[1] < 0) group.scale.x = -1;   // 로컬 +x 가 u 와 반대면 거울상
}
function kit(id, glassMats) {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const glassOf = (hex) => { const m = new THREE.MeshStandardMaterial({ map: solidTex(hex), roughness: 0.15, metalness: 0.4 }); glassMats.push(m); return m; };
  const M = {
    white2: std("#e8e8e3"), cornice: std("#f6f6f2", { roughness: 0.6 }),
    roofL: std("#d9d9d4", { roughness: 0.95 }), roofR: std("#9dbb87", { roughness: 0.95 }),
    concrete: std("#a9a8a2", { roughness: 0.95 }), orange: std("#f07a35", { roughness: 0.7 }), blue: std("#1f56b8", { roughness: 0.6 }),
    brick: std("#a4452f", { roughness: 0.9 }), steel: std("#cfd3d6", { roughness: 0.45, metalness: 0.5 }),
    glass: glassOf("#2c3a46"), rail: std("#e6e9ec", { roughness: 0.4, metalness: 0.3 }), unit: std("#c9cbc8", { roughness: 0.7 }),
    panel: std("#e3e6e8", { roughness: 0.5, metalness: 0.3, transparent: true, opacity: 0.55 }),
  };
  const meshes = [];
  const reg = (m) => { m.castShadow = m.receiveShadow = true; m.userData = { id }; meshes.push(m); return m; };
  const wallMat = (T, w, h) => { const map = T.map.clone(); map.needsUpdate = true; map.repeat.set(w / T.tw, h / T.th); return new THREE.MeshStandardMaterial({ map, roughness: 0.82 }); };
  const box = (parent, w, h, d, mat, x, y, z) => { const m = reg(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const body = (parent, w, h, d, y0, front, back, side, top) =>
    box(parent, w, h, d, [wallMat(side, d, h), wallMat(side, d, h), top, top, wallMat(front, w, h), wallMat(back, w, h)], 0, y0 + h / 2, 0);
  const instanced = (parent, mat, list) => {
    const im = reg(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length));
    const o = new THREE.Object3D();
    list.forEach((a, i) => { o.position.set(a[0], a[1], a[2]); o.scale.set(a[3], a[4], a[5]); o.rotation.set(0, 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.computeBoundingSphere(); parent.add(im); return im;
  };
  const parapet = (parent, w, d, y, h, t, mat, ox = 0, oz = 0) => {
    box(parent, w + t, h, t, mat, ox, y + h / 2, oz + d / 2); box(parent, w + t, h, t, mat, ox, y + h / 2, oz - d / 2);
    box(parent, t, h, d, mat, ox + w / 2, y + h / 2, oz); box(parent, t, h, d, mat, ox - w / 2, y + h / 2, oz);
  };
  return { M, meshes, wallMat, box, body, instanced, parapet };
}
function result(F, id, name, main, roofMat, meshes, H) {
  main.userData = { id, name, height: H, roof: roofMat };
  const xs = F.pts.map((p) => p[0]), zs = F.pts.map((p) => p[1]);
  const solids = [{ ring: F.pts, h: H, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }];
  return { mesh: main, meshes, solids, center: new THREE.Vector3(F.cx, H + 4, F.cz), radius: Math.hypot(F.L, F.D) / 2 + 8 };
}

/* =====================================================================
   제2공학관 — 사진 왼쪽 동 (4층 · 컬러 패널 · 옥상 철골 · 파란 현관)
   +x 는 제1공학관과 가까운 끝, −x 끝에 파란 현관이 있는 끝 동
   ===================================================================== */
export function buildEng2({ ring, id, name, scene, glassMats }) {
  const F = frame(ring, { front: [-0.7, 0.7], x: [0.6, 0.8] });
  const T = textures();
  const { M, meshes, box, body, instanced, parapet, wallMat } = kit(id, glassMats);
  const group = new THREE.Group(), G = new THREE.Group();
  group.add(G);

  const EW = 10, LL = Math.max(30, F.L - EW), LD = Math.max(12, F.D - 2), FL = 3.4, NF = 4, BASE = 0.5, H = BASE + NF * FL;
  const k = LL / 72;                 // 원본(72 m) 대비 비율 — 패널 · 철골 위치를 같이 늘인다
  G.position.x = EW / 2;              // 끝 동까지 포함한 전체가 윤곽 가운데에 오도록
  box(G, LL, BASE, LD, M.concrete, 0, BASE / 2, 0);
  const main = body(G, LL, NF * FL, LD, BASE, T.L, T.L2, T.L2, M.roofL);
  parapet(G, LL, LD, H, 0.9, 0.35, M.cornice);

  for (const [ax0, mat, floors] of [[-25, M.orange, 4], [-9, M.blue, 4], [8, M.blue, 3], [24, M.orange, 4]]) {
    const ax = ax0 * k, w = 5.4, hh = floors * FL;
    box(G, w, hh, 0.08, mat, ax, BASE + hh / 2, LD / 2 + 0.05);
    for (let f = 0; f < floors; f++) {
      const y = BASE + f * FL;
      box(G, w, 1.0, 0.35, mat, ax, y + 0.45, LD / 2 + 0.17);
      box(G, w, 0.35, 0.35, mat, ax, y + FL - 0.2, LD / 2 + 0.17);
      box(G, 4.0, 1.8, 0.1, M.cornice, ax, y + 1.85, LD / 2 + 0.12);
      box(G, 3.7, 1.55, 0.1, M.glass, ax, y + 1.85, LD / 2 + 0.16);
      box(G, 0.08, 1.55, 0.12, M.cornice, ax, y + 1.85, LD / 2 + 0.2);
    }
    box(G, 0.4, hh, 0.6, mat, ax - w / 2, BASE + hh / 2, LD / 2 + 0.3);
    box(G, 0.4, hh, 0.6, mat, ax + w / 2, BASE + hh / 2, LD / 2 + 0.3);
  }
  for (let f = 1; f < NF; f++) box(G, LL, 0.14, 0.55, M.cornice, 0, BASE + f * FL, LD / 2 + 0.27);

  // 끝 동 + 발코니 + 파란 현관
  const EX = -LL / 2 - EW / 2, ED = LD + 2, EH = H + 0.9;
  box(G, EW, EH - BASE, ED, [wallMat(T.L2, ED, EH - BASE), wallMat(T.L2, ED, EH - BASE), M.roofL, M.roofL, wallMat(T.L2, EW, EH - BASE), wallMat(T.L2, EW, EH - BASE)], EX, BASE + (EH - BASE) / 2, 1);
  box(G, EW, BASE, ED, M.concrete, EX, BASE / 2, 1);
  parapet(G, EW, ED, EH, 0.8, 0.35, M.cornice, EX, 1);
  for (let f = 1; f < NF; f++) for (const z of [-3.6, 3.6]) {
    const y = BASE + f * FL;
    box(G, 1.4, 0.18, 3.2, M.cornice, EX - EW / 2 - 0.7, y, 1 + z);
    box(G, 0.08, 1.0, 3.2, M.rail, EX - EW / 2 - 1.36, y + 0.55, 1 + z);
  }
  box(G, 4.0, 0.55, 8.5, M.blue, EX - EW / 2 - 2.0, 3.6, 1);
  box(G, 0.3, 3.3, 0.4, M.blue, EX - EW / 2 - 3.8, 1.65, 1 - 3.9);
  box(G, 0.3, 3.3, 0.4, M.blue, EX - EW / 2 - 3.8, 1.65, 1 + 3.9);
  box(G, 0.2, 2.8, 5.0, M.glass, EX - EW / 2 - 0.05, 1.9, 1);
  box(G, 3.0, 0.3, 8.0, M.concrete, EX - EW / 2 - 1.5, 0.15, 1);

  // 옥상 계단실 · 기계실 · 철골 구조물 · 실외기
  const px = LL / 2 - 6;
  box(G, 10, 3.6, 11, [wallMat(T.L2, 11, 3.6), wallMat(T.L2, 11, 3.6), M.roofL, M.roofL, wallMat(T.L2, 10, 3.6), wallMat(T.L2, 10, 3.6)], px, H + 1.8, -0.5);
  parapet(G, 10, 11, H + 3.6, 0.5, 0.3, M.cornice, px, -0.5);
  box(G, 6, 2.8, 7, M.white2, -15 * k, H + 1.4, -2);
  const sx0 = -10 * k, sx1 = 24 * k, sz0 = -LD / 2 + 1.5, sz1 = LD / 2 - 1.3, colH = 3.4, top = H + colH;
  const members = [], nb = Math.max(2, Math.round((sx1 - sx0) / 4.25)), step = (sx1 - sx0) / nb;
  for (let i = 0; i <= nb; i++) for (const z of [sz0, (sz0 + sz1) / 2, sz1]) members.push([sx0 + i * step, H + colH / 2, z, 0.25, colH, 0.25]);
  for (const z of [sz0, (sz0 + sz1) / 2, sz1]) members.push([(sx0 + sx1) / 2, top, z, sx1 - sx0 + 0.5, 0.3, 0.3]);
  for (let x = sx0; x <= sx1 + 0.01; x += step / 4) members.push([x, top + 0.25, (sz0 + sz1) / 2, 0.12, 0.12, sz1 - sz0 + 0.6]);
  instanced(G, M.steel, members);
  const panels = [];
  for (let x = sx0 + 1; x < sx1 - 1; x += step / 2) panels.push([x, top + 0.42, (sz0 + sz1) / 2 - 2.5, 1.8, 0.05, 2.2], [x, top + 0.42, (sz0 + sz1) / 2 + 2.5, 1.8, 0.05, 2.2]);
  instanced(G, M.panel, panels);
  const units = [];
  for (let i = 0; i < 9; i++) units.push([-30 * k + (i % 5) * 3.2, H + 0.45, -3 + Math.floor(i / 5) * 5, 1.4, 0.9, 1.0]);
  instanced(G, M.unit, units);

  place(group, F);
  if (group.scale.x < 0) for (const m of meshes) for (const mm of [].concat(m.material)) mm.side = THREE.DoubleSide;
  scene.add(group);
  return result(F, id, name, main, M.roofL, meshes, H);
}

/* =====================================================================
   제1공학관 — 사진 오른쪽 동 (3층 · 가로창 + 적벽돌 띠 · 녹색 지붕 · 적벽돌 옥탑)
   −x 는 제2공학관과 가까운 끝, +x 끝 1층에 유리 로비
   ===================================================================== */
export function buildEng1({ ring, id, name, scene, glassMats }) {
  const F = frame(ring, { front: [-0.6, -0.8], x: [-0.8, 0.6] });
  const T = textures();
  const { M, meshes, box, body, instanced, parapet } = kit(id, glassMats);
  const group = new THREE.Group();

  const RL = F.L, RD = F.D, FL = 3.6, NF = 3, BASE = 0.6, H = BASE + NF * FL;
  box(group, RL, BASE, RD, M.concrete, 0, BASE / 2, 0);
  const main = body(group, RL, NF * FL, RD, BASE, T.R, T.R, T.R2, M.roofR);
  parapet(group, RL, RD, H, 1.1, 0.5, M.cornice);
  for (let f = 1; f <= NF; f++) box(group, RL, 0.16, 0.7, M.cornice, 0, BASE + f * FL - 0.05, RD / 2 + 0.35);

  const k = RL / 86;
  box(group, 15, 3.0, 10, M.brick, -16 * k, H + 1.5, -1);
  box(group, 15.4, 0.5, 10.4, M.cornice, -16 * k, H + 3.2, -1);
  box(group, 4, 1.2, 3, M.white2, -6 * k, H + 0.6, -5);
  box(group, 2.5, 1.0, 2.5, M.blue, 10 * k, H + 0.5, 4);

  box(group, 13, 3.5, 0.3, M.glass, RL / 2 - 7, BASE + 1.75, RD / 2 + 0.1);
  box(group, 0.3, 3.5, 8, M.glass, RL / 2 + 0.1, BASE + 1.75, RD / 2 - 4.5);

  const ex = 6 * k;
  box(group, 9, 0.4, 3.4, M.cornice, ex, 3.9, RD / 2 + 1.7);
  box(group, 0.35, 3.3, 0.35, M.cornice, ex - 4.2, 2.25, RD / 2 + 3.2);
  box(group, 0.35, 3.3, 0.35, M.cornice, ex + 4.2, 2.25, RD / 2 + 3.2);
  box(group, 4.5, 2.7, 0.2, M.glass, ex, BASE + 1.35, RD / 2 + 0.12);
  for (let i = 0; i < 3; i++) box(group, 7, 0.2 * (3 - i), 1.0 + i * 0.6, M.concrete, ex, 0.1 * (3 - i), RD / 2 + 0.5 + (1.0 + i * 0.6) / 2);

  const units = [];
  for (let i = 0; i < 6; i++) units.push([22 * k + (i % 3) * 3, H + 0.45, -5 + Math.floor(i / 3) * 3, 1.3, 0.9, 1.0]);
  instanced(group, M.unit, units);

  place(group, F);
  if (group.scale.x < 0) for (const m of meshes) for (const mm of [].concat(m.material)) mm.side = THREE.DoubleSide;
  scene.add(group);
  return result(F, id, name, main, M.roofR, meshes, H);
}
