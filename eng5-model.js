// 제5공학관 전용 3D 모델 — building_3d_viewer.html 의 디자인을 캠퍼스 3D 지도에 옮긴 것.
// 중앙 5층 본관(유리 커튼월 로비) + 양측 4층 날개(주황 처마) + 옥상 태양광·펜트하우스·레이더 + 목재 캐노피 현관.
// 모델은 원본 뷰어의 좌표(가로 66m × 깊이 18m, +z = 정면)로 만든 뒤, OSM 윤곽의 가장 긴 변에 맞춰 늘리고 돌린다.
// 윤곽에서 본체 깊이 밖으로 튀어나온 부분(별관)은 2층짜리 매스로 따로 세운다.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MODEL_L = 66, MODEL_D = 18;
const BASE = 0.8, FLOOR = 3.6;
const MAIN_TOP = BASE + 5 * FLOOR; // 18.8
const WING_TOP = BASE + 4 * FLOOR; // 15.2
const ANNEX_H = BASE + 2 * FLOOR;  // 8.0

// 단색 텍스처: three-view 의 테마 전환이 glassMats 의 color 를 흰색/푸른 회색으로 바꾸므로 색은 map 에 둔다
function solidTex(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 4;
  const g = c.getContext("2d"); g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildEng5({ ring, id, name, depth = 26, withAnnex = false, scene, wallFor, glassMats }) {
  /* ---------- 윤곽에 맞추기: 가장 긴 변 = 본체 뒷면/앞면 ---------- */
  let ei = 0, best = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
    const l = Math.hypot(x2 - x1, z2 - z1); if (l > best) { best = l; ei = i; }
  }
  const A = ring[ei], Bp = ring[(ei + 1) % ring.length], L = best;
  const ux = (Bp[0] - A[0]) / L, uz = (Bp[1] - A[1]) / L;
  const gx = ring.reduce((s, p) => s + p[0], 0) / ring.length, gz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let nx = -uz, nz = ux; // 윤곽 안쪽을 향하는 법선
  if ((gx - A[0]) * nx + (gz - A[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const D = Math.min(depth, Math.max(...ring.map(([x, z]) => (x - A[0]) * nx + (z - A[1]) * nz)));
  const cx = (A[0] + Bp[0]) / 2 + nx * D / 2, cz = (A[1] + Bp[1]) / 2 + nz * D / 2;
  const fx = nx, fz = nz; // 정면 = 별관 쪽 (180° 회전: 로비·현관 모두 남동쪽)

  /* ---------- 재질 (원본 뷰어와 같은 색) ---------- */
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const glass = (hex, o) => { const m = new THREE.MeshStandardMaterial({ map: solidTex(hex), ...o }); glassMats.push(m); return m; };
  const M = {
    cream: mat(0xe7dcc4), plinth: mat(0xb7b0a2), trim: mat(0xc2662d, { roughness: 0.6 }),
    frameBr: mat(0x6e4a2e, { roughness: 0.5 }), frameWh: mat(0xf1eee6, { roughness: 0.5 }),
    glass: glass(0x3f5566, { roughness: 0.12, metalness: 0.45 }), glassDk: glass(0x1e2a33, { roughness: 0.08, metalness: 0.55 }),
    mullion: mat(0xd9d4c8, { roughness: 0.5 }), wood: mat(0x8a5a3a, { roughness: 0.7 }),
    paint: mat(0xf4f4f0, { roughness: 0.7 }), sign: mat(0x3f7fc4),
    solar: mat(0x1d3a6b, { roughness: 0.3, metalness: 0.2 }), solarFr: mat(0xcfd6dc, { roughness: 0.4, metalness: 0.6 }),
    radar: mat(0xf6f6f6, { roughness: 0.4 }), metal: mat(0x9aa1a8, { roughness: 0.4, metalness: 0.6 }),
  };
  const roof = new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.8 }); // 선택 시 파랗게 빛나는 지붕

  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.rotation.y = Math.atan2(fx, fz); // 로컬 +z → 정면
  group.scale.set(L / MODEL_L, 1, D / MODEL_D);
  const meshes = [];
  const solid = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; o.userData = { id }; group.add(o); meshes.push(o); return o; };

  /* ---------- 큰 매스: 각각 메시 (지붕면 = roof 재질) ---------- */
  const block = (w, h, d, x, y, z, wall = M.cream) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
    return solid(g, [wall, wall, roof, wall, wall, wall]);
  };
  block(66, BASE, 18, 0, BASE / 2, 0, M.plinth);
  const main = block(28, MAIN_TOP - BASE, 16, 0, (BASE + MAIN_TOP) / 2, 0);
  block(10, MAIN_TOP - BASE, 1.5, 0, (BASE + MAIN_TOP) / 2, 8.75);           // 로비 돌출부
  for (const s of [-1, 1]) block(16, WING_TOP - BASE, 14, s * 22, (BASE + WING_TOP) / 2, 0); // 날개
  block(10, 2.6, 6, -1, MAIN_TOP + 1.3, 0);                                   // 옥상 펜트하우스

  /* ---------- 작은 부재: 재질별로 하나로 합침 ---------- */
  const buckets = new Map();
  const put = (m, g) => { if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g); };
  const box = (w, h, d, m, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); put(m, g); };

  // 날개 처마 (주황 띠)
  for (const s of [-1, 1]) box(16.6, 0.6, 14.6, M.trim, s * 22, WING_TOP + 0.3, 0);

  // 로비 유리 커튼월 + 멀리언
  box(7.6, MAIN_TOP - BASE - 0.4, 0.25, M.glassDk, 0, (BASE + MAIN_TOP) / 2, 9.6);
  for (const x of [-3.8, -1.27, 1.27, 3.8]) box(0.16, MAIN_TOP - BASE, 0.3, M.mullion, x, (BASE + MAIN_TOP) / 2, 9.75);
  for (let f = 1; f < 5; f++) box(7.6, 0.16, 0.3, M.mullion, 0, BASE + f * FLOOR, 9.75);

  // 창: 틀 + 유리 + 창턱
  const windowAt = (x, y, z, w, h, dir, frameMat) => {
    box(w + 0.3, h + 0.3, 0.2, frameMat, x, y, z + dir * 0.1);
    box(w, h, 0.12, M.glass, x, y, z + dir * 0.18);
    box(w + 0.5, 0.12, 0.35, M.frameWh, x, y - h / 2 - 0.1, z + dir * 0.2);
  };
  for (let f = 0; f < 5; f++) { // 본관 띠창 (앞·뒤)
    const y = BASE + f * FLOOR + 1.8;
    for (const dir of [1, -1]) for (const x of [-12.6, -9.8, 9.8, 12.6]) windowAt(x, y, dir * 8, 2.2, 1.7, dir, M.frameWh);
  }
  for (const x of [-6.8, 6.8]) // 로비 양옆 세로 청동 창 (2~5층)
    windowAt(x, (BASE + FLOOR + 0.4 + MAIN_TOP - 0.6) / 2, 8, 2.6, MAIN_TOP - BASE - FLOOR - 1.0, 1, M.frameBr);
  for (let f = 0; f < 4; f++) { // 날개 띠창
    const y = BASE + f * FLOOR + 1.8;
    for (const s of [-1, 1]) for (const x of [16, 19.2, 22.4, 25.6, 28.8]) {
      windowAt(s * x, y, 7, 2.2, 1.7, 1, M.frameWh);
      windowAt(s * x, y, -7, 2.2, 1.7, -1, M.frameWh);
    }
  }

  // 1층 현관 + 목재 캐노피 + 기둥 + 사인
  box(6, 3.2, 0.2, M.glassDk, 0, BASE + 1.6, 9.9);
  box(6.4, 0.25, 0.1, M.frameBr, 0, BASE + 3.3, 9.9);
  box(10.5, 0.5, 3.4, M.wood, 0, 4.6, 11.2);
  for (const x of [-4.4, 4.4]) { const g = new THREE.CylinderGeometry(0.35, 0.35, 4.2, 12); g.translate(x, BASE + 2.1, 12.4); put(M.wood, g); }
  box(7.2, 0.9, 0.08, M.paint, 0, 4.6, 12.93);
  box(6.8, 0.25, 0.1, M.sign, 0, 4.6, 12.95);

  // 옥상 설비: 기계실 · 레이더 돔 · 안테나
  box(4, 3.4, 3.5, M.metal, -1, MAIN_TOP + 2.6 + 1.7, 0);
  { const g = new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.6, 1); g.translate(-1, MAIN_TOP + 6.3, 0); put(M.radar, g); }
  { const g = new THREE.CylinderGeometry(0.08, 0.12, 4, 8); g.translate(-1, MAIN_TOP + 8.3, 0); put(M.metal, g); }

  // 옥상 태양광 패널 (원본과 같은 배치)
  const panel = (x, y, z) => {
    const face = new THREE.BoxGeometry(2.5, 0.08, 1.4); face.rotateX(0.25); face.translate(x, y, z); put(M.solar, face);
    const fr = new THREE.BoxGeometry(2.6, 0.04, 1.5); fr.translate(0, -0.05, 0); fr.rotateX(0.25); fr.translate(x, y, z); put(M.solarFr, fr);
  };
  for (let x = -12.5; x <= 12.5; x += 2.7) for (let z = -6; z <= 6; z += 2.4) {
    if (x > -6.5 && x < 4.5 && Math.abs(z) < 3.6) continue;
    panel(x, MAIN_TOP + 0.9, z);
  }
  for (const s of [-1, 1]) for (let x = 15.5; x <= 28.5; x += 2.7) for (let z = -5; z <= 5; z += 2.5) panel(s * x, WING_TOP + 0.95, z);

  for (const [m, geos] of buckets) {
    const o = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g)), m);
    o.castShadow = o.receiveShadow = true; o.userData = { id }; group.add(o); meshes.push(o);
  }
  main.userData = { id, name, height: MAIN_TOP, roof };
  scene.add(group);

  /* ---------- 별관: 윤곽 중 본체 깊이 밖으로 나간 부분 ---------- */
  const solids = [];
  const corner = (u, v) => [A[0] + ux * u + nx * v, A[1] + uz * u + nz * v];
  const barRing = [corner(0, 0), corner(L, 0), corner(L, D), corner(0, D)];
  solids.push({ ring: barRing, h: MAIN_TOP });
  const dist = ([x, z]) => (x - A[0]) * nx + (z - A[1]) * nz, cut = D + 0.5;
  const wingBack = D / 2 + 7 * (D / MODEL_D), back = cut - wingBack + 0.3; // 잘린 면은 날개 뒷벽까지 붙인다
  const annex = [];
  for (let i = 0; i < ring.length; i++) { // 반평면 dist ≥ cut 으로 자르기 (Sutherland–Hodgman)
    const p = ring[i], q = ring[(i + 1) % ring.length], dp = dist(p) - cut, dq = dist(q) - cut;
    if (dp >= 0) annex.push(p);
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); annex.push([p[0] + (q[0] - p[0]) * t - nx * back, p[1] + (q[1] - p[1]) * t - nz * back]); }
  }
  let area = 0;
  for (let i = 0; i < annex.length; i++) { const [x1, z1] = annex[i], [x2, z2] = annex[(i + 1) % annex.length]; area += x1 * z2 - x2 * z1; }
  // 별관은 기본으로 빼서 본관 좌우가 대칭이 되게 한다 (withAnnex: true 면 다시 세움)
  if (withAnnex && annex.length >= 3 && Math.abs(area) / 2 > 30) {
    const shape = new THREE.Shape(annex.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: ANNEX_H, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    const o = new THREE.Mesh(g, [roof, wallFor("cream_ribbon", 3.2, FLOOR)]);
    o.castShadow = o.receiveShadow = true; o.userData = { id }; scene.add(o); meshes.push(o);
    const tg = new THREE.ExtrudeGeometry(new THREE.Shape(annex.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 0.5, bevelEnabled: false }); tg.rotateX(-Math.PI / 2);
    const trim = new THREE.Mesh(tg, M.trim); trim.position.y = ANNEX_H; trim.castShadow = true; scene.add(trim);
    solids.push({ ring: annex, h: ANNEX_H });
  }
  for (const s of solids) { const xs = s.ring.map((p) => p[0]), zs = s.ring.map((p) => p[1]); s.box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; }

  return {
    mesh: main, meshes, solids,
    center: new THREE.Vector3(cx, MAIN_TOP + 2, cz),
    radius: Math.hypot(L, D) / 2 + 6,
  };
}
