// 강의동(n103) 전용 3D 모델 — "강의동 3D 뷰어" HTML 의 건물 부분을 캠퍼스 3D 지도에 옮긴 것.
// 구성: OSM 윤곽 그대로 3층 외벽(변마다 쿼드) · 기단 · 난간 · 평지붕
//       외벽 질감: 흰 벽기둥+적갈색 스팬드럴(A) / 적벽돌 동(B) / 정면 연속 가로창+적벽돌 띠·기둥(FA) / 정면 적벽돌 동(FB)
//       정면 가운데 현관: 적벽돌 몸체 · 평평한 캐노피 · 유리문 · 계단 2단
// 좌표: ring 은 지도 좌표(x = 동쪽, z = 남쪽, 미터) — 뷰어의 FOOT 와 같은 축이라 그대로 쓴다.
import * as THREE from "three";

const FL = 3.6, BASE = 0.6, NF = 3, TOP = BASE + NF * FL; // 11.4 m
const PPM = 102.4, TILE_H = 3.6;                            // 텍스처: 1 m = 102.4 px, 타일 = 5 m × 3.6 m

function solidTex(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 4;
  const g = c.getContext("2d"); g.fillStyle = hex; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function drawBricks(g, x0, y0, x1, y1, tones, mortar) {
  const px = (x) => x * PPM, py = (y) => (TILE_H - y) * PPM;
  const bw = 0.21 * PPM, bh = 0.065 * PPM;
  g.save();
  g.beginPath(); g.rect(px(x0), py(y1), (x1 - x0) * PPM, (y1 - y0) * PPM); g.clip();
  g.fillStyle = mortar; g.fillRect(px(x0), py(y1), (x1 - x0) * PPM, (y1 - y0) * PPM);
  let r = 0;
  for (let yy = py(y1); yy < py(y0) + bh; yy += bh, r++) {
    for (let xx = px(x0) - (r % 2 ? bw / 2 : 0); xx < px(x1); xx += bw) {
      g.fillStyle = tones[(r * 5 + Math.floor(xx / bw) * 3 + 7) % tones.length];
      g.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
    }
  }
  g.restore();
}
function drawWindow(g, x0, y0, x1, y1) {
  const px0 = x0 * PPM, py0 = (TILE_H - y1) * PPM, w = (x1 - x0) * PPM, h = (y1 - y0) * PPM;
  g.fillStyle = "#f4f3ee"; g.fillRect(px0 - 7, py0 - 7, w + 14, h + 14);
  const gr = g.createLinearGradient(px0, py0, px0 + w, py0 + h);
  gr.addColorStop(0, "#6a8294"); gr.addColorStop(1, "#25313a");
  g.fillStyle = gr; g.fillRect(px0 + 4, py0 + 4, w - 8, h - 8);
  g.fillStyle = "#f4f3ee"; g.fillRect(px0 + w / 2 - 2, py0, 4, h);
  g.fillStyle = "rgba(40,40,40,.35)"; g.fillRect(px0 - 7, py0 + h + 7, w + 14, 4);
}
function drawRibbon(g, x0, y0, x1, y1, bay) {
  const px0 = x0 * PPM, py0 = (TILE_H - y1) * PPM, w = (x1 - x0) * PPM, h = (y1 - y0) * PPM;
  g.fillStyle = "#e9e8e3"; g.fillRect(px0 - 6, py0 - 6, w + 12, h + 12);
  const gr = g.createLinearGradient(px0, py0, px0, py0 + h);
  gr.addColorStop(0, "#4d5f6c"); gr.addColorStop(1, "#2a3640");
  g.fillStyle = gr; g.fillRect(px0 + 3, py0 + 3, w - 6, h - 6);
  g.fillStyle = "#ecebe6";
  for (let x = px0; x <= px0 + w; x += bay * PPM) g.fillRect(x - 3, py0, 6, h);
  g.fillRect(px0, py0 + h / 2 - 2, w, 4);
}
function tileTexture(draw) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 368;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 5, 1 / TILE_H);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildGang({ ring, id, name, scene, glassMats }) {
  const FOOT = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const n = FOOT.length;

  /* ---------- 재질 ---------- */
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const M = {
    concrete: std("#a9a79e", { roughness: 0.95 }),
    cornice: std("#e9e6dc", { roughness: 0.7, side: THREE.DoubleSide }),
    roof: std("#8f9290", { roughness: 0.95 }),
  };
  const RED = ["#a8382e", "#b5413a", "#9c3229", "#ad3d33"], RMORT = "#d9d2c4";
  const texA = tileTexture((g) => {
    g.fillStyle = "#ebe8e0"; g.fillRect(0, 0, 512, 368);
    drawBricks(g, 0.9, 0.3, 5, 1.25, ["#8e2f2a", "#a23b33", "#7f2a26", "#963630"], "#cbc4b6");
    drawWindow(g, 1.3, 1.45, 4.5, 3.15);
    g.fillStyle = "#f3f2ee"; g.fillRect(0, 0, 0.9 * PPM, 368);
    g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0.9 * PPM, 0, 6, 368);
  });
  const texB = tileTexture((g) => {
    drawBricks(g, 0, 0, 5, 3.6, ["#a4553a", "#b0603f", "#9a4c33", "#ab5a3c"], "#c9bfb0");
    drawWindow(g, 0.8, 0.9, 2.2, 2.9); drawWindow(g, 2.8, 0.9, 4.2, 2.9);
  });
  const texFA = tileTexture((g) => {
    g.fillStyle = "#ecebe6"; g.fillRect(0, 0, 512, 368);
    drawBricks(g, 1.0, 0.35, 4.9, 1.2, RED, RMORT);
    drawRibbon(g, 1.0, 1.35, 4.9, 3.1, 0.82);
    drawBricks(g, 0, 0, 0.9, 3.6, RED, RMORT);
  });
  const texFB = tileTexture((g) => {
    drawBricks(g, 0, 0, 5, 3.6, ["#9c3328", "#a83c2f", "#923026", "#ad4132"], "#d8cfc2");
    drawWindow(g, 0.8, 0.9, 2.2, 2.9); drawWindow(g, 2.8, 0.9, 4.2, 2.9);
  });
  const wallMat = (map, r) => new THREE.MeshStandardMaterial({ map, roughness: r, side: THREE.DoubleSide });
  const matA = wallMat(texA, 0.85), matB = wallMat(texB, 0.9), matFA = wallMat(texFA, 0.85), matFB = wallMat(texFB, 0.9);

  /* ---------- 윤곽 기준 축 (뷰어와 같은 규칙) ---------- */
  let ia = 0, ib = 1, span = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(FOOT[i][0] - FOOT[j][0], FOOT[i][1] - FOOT[j][1]);
    if (d > span) { span = d; ia = i; ib = j; }
  }
  const PA = FOOT[ia], PB = FOOT[ib];
  const U = [(PB[0] - PA[0]) / span, (PB[1] - PA[1]) / span];
  const NRM = [-U[1], U[0]];
  const cx = FOOT.reduce((s, p) => s + p[0], 0) / n, cz = FOOT.reduce((s, p) => s + p[1], 0) / n;
  const cornerOut = (p, q) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    let nx = dz / len, nz = -dx / len;
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
    return { nx, nz, len };
  };
  const sOf = (p, q) => (((p[0] + q[0]) / 2 - PA[0]) * U[0] + ((p[1] + q[1]) / 2 - PA[1]) * U[1]) / span;

  /* ---------- 외벽 ---------- */
  function wallGeometry(list) {
    const pos = [], nor = [], uv = [], idx = [];
    for (const s of list) {
      const b = pos.length / 3, [px, pz] = s.p, [qx, qz] = s.q;
      pos.push(px, s.y0, pz, qx, s.y0, qz, qx, s.y1, qz, px, s.y1, pz);
      nor.push(s.nx, 0, s.nz, s.nx, 0, s.nz, s.nx, 0, s.nz, s.nx, 0, s.nz);
      uv.push(0, s.y0 - BASE, s.len, s.y0 - BASE, s.len, s.y1 - BASE, 0, s.y1 - BASE);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const L = { A: [], B: [], FA: [], FB: [], plinth: [], top: [] };
  for (let i = 0; i < n; i++) {
    const p = FOOT[i], q = FOOT[(i + 1) % n];
    const { nx, nz, len } = cornerOut(p, q);
    if (len < 0.3) continue;
    const base = { p, q, nx, nz, len };
    const front = nx * NRM[0] + nz * NRM[1] > 0.5, brick = sOf(p, q) > 0.72;
    L[front ? (brick ? "FB" : "FA") : (brick ? "B" : "A")].push({ ...base, y0: BASE, y1: TOP });
    L.plinth.push({ ...base, y0: 0, y1: BASE });
    L.top.push({ ...base, y0: TOP, y1: TOP + 0.6 });
  }

  const group = new THREE.Group();
  const meshes = [];
  const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; mesh.userData = { id }; group.add(mesh); meshes.push(mesh); return mesh; };
  for (const [key, m] of [["A", matA], ["B", matB], ["FA", matFA], ["FB", matFB], ["plinth", M.concrete], ["top", M.cornice]]) {
    if (L[key].length) add(new THREE.Mesh(wallGeometry(L[key]), m));
  }

  // 평지붕 (윤곽 그대로)
  const roofGeo = new THREE.ShapeGeometry(new THREE.Shape(FOOT.map(([x, z]) => new THREE.Vector2(x, -z))));
  roofGeo.rotateX(-Math.PI / 2);
  const roof = add(new THREE.Mesh(roofGeo, M.roof));
  roof.position.y = TOP + 0.02;

  /* ---------- 정면 가운데 현관 ---------- */
  // 남쪽(+z)을 향한 긴 면 중 가운데(s≈0.5)에 있는 변
  let fe = null;
  for (let i = 0; i < n; i++) {
    const p = FOOT[i], q = FOOT[(i + 1) % n];
    const { nx, nz, len } = cornerOut(p, q);
    if (len < 20 || nz < 0.5 || Math.abs(sOf(p, q) - 0.5) > 0.15) continue;
    if (!fe || len > fe.len) fe = { p, q, nx, nz, len };
  }
  if (fe) {
    const ox = fe.nx, oz = fe.nz, mx = (fe.p[0] + fe.q[0]) / 2, mz = (fe.p[1] + fe.q[1]) / 2;
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3(oz, 0, -ox), new THREE.Vector3(0, 1, 0), new THREE.Vector3(ox, 0, oz)));
    const at = (mesh, y, d) => { mesh.position.set(mx + ox * d, y, mz + oz * d); mesh.quaternion.copy(quat); return add(mesh); };
    const EW = 4.6, EH = 3.0, ED = 1.5;
    const glass = new THREE.MeshStandardMaterial({ map: solidTex("#2d3a44"), roughness: 0.2, metalness: 0.3 });
    glassMats.push(glass);
    at(new THREE.Mesh(new THREE.BoxGeometry(EW, EH, ED + 0.1), std("#a8382e", { roughness: 0.9 })), EH / 2, (ED - 0.1) / 2); // 적벽돌 몸체
    at(new THREE.Mesh(new THREE.BoxGeometry(EW + 1.0, 0.28, 2.6), M.cornice), EH + 0.14, 1.3);                             // 캐노피
    at(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.06), glass), 1.4, ED + 0.03);                                      // 유리문
    for (const [h, dLen] of [[0.3, 0.9], [0.6, 0.45]]) at(new THREE.Mesh(new THREE.BoxGeometry(EW - 1.2, h, dLen), M.concrete), h / 2, ED + dLen / 2); // 계단
  }
  scene.add(group);

  // 선택 시 지붕이 파랗게
  roof.userData = { id, name, height: TOP, roof: M.roof };

  /* ---------- 걷기 충돌 · 선택 정보 ---------- */
  const xs = FOOT.map((p) => p[0]), zs = FOOT.map((p) => p[1]);
  const solids = [{ ring: FOOT, h: TOP, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }];
  let radius = 0;
  for (const [x, z] of FOOT) radius = Math.max(radius, Math.hypot(x - cx, z - cz));
  return { mesh: roof, meshes, solids, center: new THREE.Vector3(cx, TOP + 4, cz), radius: radius + 8 };
}
