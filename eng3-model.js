// 제3공학관 전용 3D 모델 — "유리 승강탑 건물 3D" HTML 의 건물 부분을 캠퍼스 3D 지도에 옮긴 것.
// 구성: ㄱ자 3층 본관(A동 + 안뜰 쪽으로 뻗은 C동) · 유리 승강탑 · 뒤로 물러난 B동 · 황토 끝 블록과 붉은 차양 · 벽돌 발코니 끝벽.
// 원본은 길이 약 120m로 어림한 모델이라, 칸 수(bay)를 OSM 윤곽 길이에 맞게 줄여 비율은 유지한다.
// 모델 좌표: x = 건물 길이 방향(C동 끝 → B동), z = 바깥(안뜰) 방향, A동 정면이 z = 0.
import * as THREE from "three";

const FH = 3.5, TOP = 11.4;

function solidTex(hex) {
  const c = document.createElement("canvas"); c.width = c.height = 4;
  const g = c.getContext("2d"); g.fillStyle = hex; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildEng3({ ring, id, name, scene, wallMats, glassMats }) {
  /* ---------- 윤곽에 맞추기 ---------- */
  // 가장 긴 변 = 끝 날개(C동)의 옆면 → 그 반대 방향이 C동이 뻗는 방향(wv), 직각 방향(d)이 본관 길이 방향
  let ei = 0, best = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length], l = Math.hypot(x2 - x1, z2 - z1);
    if (l > best) { best = l; ei = i; }
  }
  const [ax, az] = ring[ei], [bx, bz] = ring[(ei + 1) % ring.length];
  let wv = [(bx - ax) / best, (bz - az) / best];
  const gx = ring.reduce((s, p) => s + p[0], 0) / ring.length, gz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let d = [-wv[1], wv[0]];
  // d 는 날개가 있는 끝을 향하게, wv 는 날개가 뻗는 쪽을 향하게
  const proj = (p, v) => p[0] * v[0] + p[1] * v[1];
  const mid = [(ax + bx) / 2, (az + bz) / 2];
  if (proj(mid, d) < proj([gx, gz], d)) d = [-d[0], -d[1]];
  const us = ring.map((p) => proj(p, d)), uMax = Math.max(...us);
  const farW = ring.filter((p, i) => us[i] > uMax - 12).map((p) => proj(p, wv));
  const nearW = ring.filter((p, i) => us[i] < uMax - 25).map((p) => proj(p, wv));
  if (Math.max(...farW) < Math.max(...nearW)) wv = [-wv[0], -wv[1]];
  const uS = ring.map((p) => proj(p, d)), wS = ring.map((p) => proj(p, wv));
  const uEnd = Math.max(...uS), uStart = Math.min(...uS);
  const w0 = Math.max(...ring.filter((p, i) => uS[i] < uEnd - 25).map((p) => proj(p, wv))); // A동 정면선
  const wingW = Math.max(...wS) - w0; // C동 길이

  /* ---------- 칸 수 정하기 ---------- */
  const total = uEnd - uStart;              // 윤곽 전체 길이
  const Cw = 16, cOver = 1.6;               // C동 폭 (모델 x -16..0)
  const An = Math.max(6, Math.round((total * 0.42 - cOver) / 3.2)), Ab = 3.2, Ax1 = An * Ab;
  const Bx0 = Ax1 + 5.7, endW = 6;
  const Bb = 3.2, Bn = Math.max(4, Math.round((total - Cw - cOver - Bx0 - endW) / Bb)), Bx1 = Bx0 + Bn * Bb;
  const Cb = 3.4, Cn = Math.max(5, Math.round((wingW - 0.5) / Cb)), Cz1 = Cn * Cb;
  const Bf = -5;

  /* ---------- 재질 ---------- */
  let seed = 20261106;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd(), pick = (a) => a[Math.floor(rnd() * a.length)];
  const std = (color, roughness, metalness, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: roughness == null ? 0.85 : roughness, metalness: metalness || 0 }, extra));
  const glassOf = (hex, r, m) => { const g = std("#ffffff", r, m, { map: solidTex(hex) }); glassMats.push(g); return g; };
  const lit = std("#ffffff", 0.1, 0.65, { map: solidTex("#27343a"), emissiveMap: solidTex("#ffd499"), emissive: 0x000000 });
  wallMats.push(lit); // 다크 모드에서 불 켜진 창
  const M = {
    white: std("#f0efea", 0.8), roof: std("#e4e4df", 0.92), trim: std("#fbfaf6", 0.6),
    glass: glassOf("#27343a", 0.1, 0.65), glassPale: glassOf("#6f8d90", 0.12, 0.55), glassLit: lit,
    frame: std("#f4f4ef", 0.5), shaft: glassOf("#3f5f58", 0.14, 0.55), shaftBar: std("#c6cfca", 0.4, 0.4), dark: std("#2b2d2f", 0.5, 0.4),
    tan: std("#c9ad78", 0.88), red: std("#b02a2a", 0.6), redPanel: std("#8f2018", 0.7), door: glassOf("#1c2428", 0.1, 0.7), unit: std("#f5f5f2", 0.55),
    concrete: std("#a9a79e", 0.95), fence: std("#c9ccca", 0.5, 0.4),
  };
  function brickTex(mortar, tones) {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.fillStyle = mortar; g.fillRect(0, 0, 256, 256);
    const rows = 8, bw = 64, bh = 32;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 5; k++) { g.fillStyle = pick(tones); g.fillRect(k * bw + (r % 2 ? bw / 2 : 0) + 1.5, r * bh + 1.5, bw - 3, bh - 3); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const T = {
    ochre: brickTex("#a68f6b", ["#c79a57", "#bd8e4b", "#d0a765", "#b48644"]),
    orange: brickTex("#8a6a54", ["#b8733f", "#ad6836", "#c17e49", "#a35f30"]),
    brown: brickTex("#4f3a30", ["#6d4630", "#623e2a", "#774e36", "#5a3825"]),
  };

  /* ---------- 일괄 빌더 (원본과 같은 방식: 재질별 InstancedMesh) ---------- */
  const group = new THREE.Group(), meshes = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), batches = new Map();
  const B = (mat, x0, x1, y0, y1, z0, z1) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), new THREE.Quaternion(), new THREE.Vector3(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));
  };
  const brick = (t, x0, x1, y0, y1, z0, z1) => {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), dd = Math.abs(z1 - z0), tx = t.clone(); tx.needsUpdate = true;
    tx.repeat.set(Math.max(w, dd) / 1.05, h / 0.62);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), std("#ffffff", 0.92, 0, { map: tx }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; m.userData = { id };
    group.add(m); meshes.push(m);
  };
  const FX = (f, dd) => ({ a: "x", f, d: dd }), FZ = (f, dd) => ({ a: "z", f, d: dd });
  const P = (mat, fr, u0, u1, y0, y1, a0, a1) => { const a = fr.f + fr.d * a0, b = fr.f + fr.d * a1; if (fr.a === "x") B(mat, u0, u1, y0, y1, a, b); else B(mat, a, b, y0, y1, u0, u1); };
  const PB = (t, fr, u0, u1, y0, y1, a0, a1) => { const a = fr.f + fr.d * a0, b = fr.f + fr.d * a1; if (fr.a === "x") brick(t, u0, u1, y0, y1, a, b); else brick(t, a, b, y0, y1, u0, u1); };

  /* ---------- 입면 ---------- */
  function facade(fr, u0, n, bay) {
    const u1 = u0 + n * bay, W = -0.8;
    for (let i = 0; i < 3; i++) {
      const y = i * FH;
      PB(T.ochre, fr, u0, u1, y + 0.3, y + 1.25, W, -0.14);
      P(M.white, fr, u0, u1, y + 3.08, y + FH, W, -0.1);
      if (i > 0) P(M.trim, fr, u0, u1, y - 0.08, y + 0.3, W, 0.46);
      else P(M.concrete, fr, u0, u1, 0, 0.3, W, 0.1);
      for (let k = 0; k < n; k++) {
        const a = u0 + k * bay, b = a + bay, g = rnd();
        P(g < 0.3 ? M.glassLit : g < 0.62 ? M.glassPale : M.glass, fr, a, b, y + 1.25, y + 3.08, W, W + 0.06);
        P(M.frame, fr, a, b, y + 1.25, y + 1.33, W, -0.5); P(M.frame, fr, a, b, y + 3, y + 3.08, W, -0.5);
        for (const t of [0.33, 0.66]) { const m = a + (b - a) * t; P(M.frame, fr, m - 0.035, m + 0.035, y + 1.25, y + 3.08, W, -0.52); }
        if (i > 0 && rnd() < 0.3) { const c = a + bay * rr(0.3, 0.7); P(M.unit, fr, c - 0.4, c + 0.4, y + 0.3, y + 0.92, -0.12, 0.36); }
      }
    }
    for (let k = 0; k <= n; k++) { const u = u0 + k * bay; P(M.trim, fr, u - 0.17, u + 0.17, 0, 10.5, W, 0.28); }
    P(M.white, fr, u0, u1, 10.42, TOP, W, 0.56);
    P(M.trim, fr, u0, u1, TOP - 0.08, TOP + 0.06, W, 0.6);
  }
  function roofWing(x0, x1, z0, z1) {
    B(M.roof, x0, x1, TOP, TOP + 0.1, z0, z1);
    B(M.white, x0 - 0.1, x1 + 0.1, TOP, TOP + 0.36, z0 - 0.1, z0 + 0.22); B(M.white, x0 - 0.1, x1 + 0.1, TOP, TOP + 0.36, z1 - 0.22, z1 + 0.1);
    B(M.white, x0 - 0.1, x0 + 0.22, TOP, TOP + 0.36, z0, z1); B(M.white, x1 - 0.22, x1 + 0.1, TOP, TOP + 0.36, z0, z1);
  }
  const roofUnit = (x, z, w, dd, h) => { B(M.unit, x - w / 2, x + w / 2, TOP + 0.1, TOP + 0.1 + h, z - dd / 2, z + dd / 2); B(M.dark, x - w * 0.35, x + w * 0.35, TOP + 0.1 + h, TOP + 0.16 + h, z - dd * 0.35, z + dd * 0.35); };
  const railZ = (x, z0, z1) => { for (let z = z0; z <= z1; z += 1.5) B(M.trim, x - 0.03, x + 0.03, TOP, TOP + 0.95, z - 0.03, z + 0.03); [0.5, 0.95].forEach((h) => B(M.trim, x - 0.03, x + 0.03, TOP + h - 0.03, TOP + h + 0.03, z0, z1)); };
  const railX = (z, x0, x1) => { for (let x = x0; x <= x1; x += 1.5) B(M.trim, x - 0.03, x + 0.03, TOP, TOP + 0.95, z - 0.03, z + 0.03); [0.5, 0.95].forEach((h) => B(M.trim, x0, x1, TOP + h - 0.03, TOP + h + 0.03, z - 0.03, z + 0.03)); };

  // A동 (본관 왼쪽, C동과 ㄱ자)
  B(M.white, -16, Ax1, 0, TOP, -15.2, -0.8);
  facade(FX(0, 1), 0, An, Ab);
  facade(FX(-16, -1), -16 + 3.2, 16, (Ax1 + 12.8) / 16);
  roofWing(-16, Ax1, -16, 0.3);
  brick(T.ochre, -16.1, -15.9, 0, TOP, -16, 0); // 끝 황토벽
  B(M.tan, -16.3, -16, 0, TOP + 0.3, -16.5, -0.2);
  // C동 (안뜰 쪽으로 뻗는 동)
  B(M.white, -15.2, -0.8, 0, TOP, 0, Cz1);
  facade(FZ(0, 1), 0, Cn, Cb);
  facade(FZ(-16, -1), 0, Cn, Cb);
  roofWing(-16, 0.3, 0, Cz1 + 0.4);
  railZ(-16, 0, Cz1); railX(-16.1, -16, Ax1);
  // C동 끝벽: 주황 벽돌 발코니 + 짙은 갈색 벽돌
  {
    const z = Cz1;
    brick(T.brown, -8.6, -0.8, 0, TOP - 0.6, z - 0.4, z + 0.25);
    brick(T.orange, -16.3, -8.6, 0, TOP - 0.6, z - 0.4, z + 0.1);
    for (let i = 0; i < 3; i++) {
      const y = i * FH;
      B(M.door, -15, -10, y + 0.9, y + 3, z + 0.1, z + 0.14);
      brick(T.orange, -15.6, -9.4, y + 0.05, y + 1.05, z + 1.2, z + 1.5);
      brick(T.orange, -15.9, -15.6, y + 0.05, y + 1.05, z + 0.1, z + 1.5);
      brick(T.orange, -9.4, -9.1, y + 0.05, y + 1.05, z + 0.1, z + 1.5);
      B(M.trim, -15.9, -9.1, y - 0.08, y + 0.08, z + 0.1, z + 1.5);
      B(M.frame, -15.7, -9.3, y + 1.05, y + 1.14, z + 1.25, z + 1.5);
    }
    B(M.trim, -0.9, 0.3, 0, TOP, z - 0.3, z + 0.32);
    B(M.white, -16.3, 0.3, TOP - 0.85, TOP, z - 0.3, z + 0.4);
    [[0.13, 2], [0.26, 2]].forEach((s, i) => B(M.concrete, -8.4, -1, 0, s[0], z + 0.25, z + 1 + i * 0.7 + 0.5));
  }
  // B동 (승강탑에서 뒤로 물러남)
  B(M.white, Bx0, Bx1, 0, TOP, Bf - 15.2, Bf - 0.8);
  facade(FX(Bf, 1), Bx0, Bn, Bb);
  facade(FX(Bf - 16, -1), Bx0, Bn, Bb);
  roofWing(Bx0, Bx1, Bf - 16, Bf + 0.3);
  B(M.white, Ax1, Bx0, 0, TOP - 0.3, -15.2, -5.8);
  B(M.roof, Ax1, Bx0, TOP - 0.3, TOP - 0.2, -15.2, -5.8);
  B(M.redPanel, Bx0 + 0.15, Bx0 + 3, 7.2, 10.4, Bf - 0.3, Bf + 0.35);
  // 유리 승강탑
  {
    const x0 = Ax1 + 0.6, x1 = Bx0 - 0.4, z0 = -7, z1 = 3, h = 13.6;
    B(M.shaft, x0, x1, 0, h, z0, z1);
    for (let y = 0; y <= h; y += 1.75) { B(M.shaftBar, x0 - 0.04, x1 + 0.04, y - 0.05, y + 0.05, z1, z1 + 0.07); B(M.shaftBar, x0 - 0.07, x0, y - 0.05, y + 0.05, z0, z1); B(M.shaftBar, x1, x1 + 0.07, y - 0.05, y + 0.05, z0, z1); }
    for (let k = 0; k <= 3; k++) { const x = x0 + (x1 - x0) * k / 3; B(M.shaftBar, x - 0.05, x + 0.05, 0, h, z1, z1 + 0.07); }
    for (let k = 0; k <= 5; k++) { const z = z0 + (z1 - z0) * k / 5; B(M.shaftBar, x0 - 0.07, x0, 0, h, z - 0.05, z + 0.05); B(M.shaftBar, x1, x1 + 0.07, 0, h, z - 0.05, z + 0.05); }
    B(M.trim, x0 - 0.2, x1 + 0.2, h, h + 0.3, z0 - 0.2, z1 + 0.2);
  }
  // 중앙 현관
  {
    const o = Bx0 - 50.5;
    B(M.tan, 51 + o, 60.5 + o, 3.5, 4.2, -5, 2.6);
    B(M.roof, 51.2 + o, 60.3 + o, 4.2, 4.32, -4.8, 2.4);
    [51.4, 60].forEach((x) => B(M.tan, x + o - 0.3, x + o + 0.3, 0, 3.5, 1.7, 2.3));
    B(M.door, 52.5 + o, 59 + o, 0.2, 3.2, Bf - 0.14, Bf - 0.1);
    [[0.14, 3.4], [0.28, 2.6], [0.42, 1.8]].forEach((s) => B(M.concrete, 51 + o, 60.5 + o, 0, s[0], Bf, s[1]));
  }
  // 오른쪽 끝 황토 블록과 붉은 차양
  {
    const x0 = Bx1, x1 = x0 + endW, z0 = Bf - 16, z1 = Bf + 0.2;
    B(M.tan, x0, x1, 0, TOP - 0.1, z0, z1);
    B(M.trim, x0 - 0.1, x1 + 0.1, TOP - 0.2, TOP + 0.1, z0 - 0.1, z1 + 0.1);
    B(M.roof, x0, x1, TOP + 0.1, TOP + 0.16, z0, z1);
    [[7.8, 9.8], [4.3, 6.3]].forEach((v) => { B(M.glassLit, x0 + 2, x0 + 4, v[0], v[1], z1, z1 + 0.04); B(M.frame, x0 + 1.9, x0 + 4.1, v[0] - 0.08, v[0], z1, z1 + 0.1); B(M.frame, x0 + 1.9, x0 + 4.1, v[1], v[1] + 0.08, z1, z1 + 0.1); B(M.frame, x0 + 2.97, x0 + 3.03, v[0], v[1], z1, z1 + 0.1); });
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) { const y = 1.4 + i * FH, z = z0 + 3 + k * 4.2; B(M.glass, x1, x1 + 0.04, y, y + 1.7, z, z + 1.8); }
    B(M.red, x0 - 2, x1 + 3, 3.05, 3.5, z1, z1 + 4.4);
    B(M.roof, x0 - 2, x1 + 3, 3.5, 3.6, z1, z1 + 4.4);
    for (let x = x0 - 2; x <= x1 + 3; x += 1.5) B(M.fence, x - 0.03, x + 0.03, 3.6, 4.5, z1 + 4.3, z1 + 4.36);
    B(M.fence, x0 - 2, x1 + 3, 4.45, 4.52, z1 + 4.3, z1 + 4.36);
    [x0 - 1.6, x1 + 2.6].forEach((x) => B(M.dark, x - 0.15, x + 0.15, 0, 3.05, z1 + 3.9, z1 + 4.2));
    B(M.door, x0, x1, 0.2, 2.9, z1, z1 + 0.05);
    [[0.15, 3.8], [0.3, 2.7], [0.45, 1.5]].forEach((s) => B(M.concrete, x0 - 1, x1 + 2, 0, s[0], z1, z1 + s[1]));
  }
  // 옥상 설비 (원본 배치를 동 길이에 맞춰 걸러냄)
  const oB = Bx0 - 50.5;
  [[6, -9, 3.2, 2, 1], [12, -7, 2.4, 1.6, 0.6], [24, -11, 2.4, 1.6, 0.9], [32, -8, 3, 2, 0.7], [40, -11, 2.4, 1.6, 0.6]]
    .filter((u) => u[0] + u[2] / 2 < Ax1 - 1).forEach((u) => roofUnit(...u));
  [[-10, 14, 4.2, 2.2, 0.9], [-6, 16, 2.6, 1.6, 1.2], [-9, 26, 2.4, 1.8, 0.6]].filter((u) => u[1] < Cz1 - 2).forEach((u) => roofUnit(...u));
  [[58, -14, 2.8, 1.8, 0.9], [66, -11, 2.4, 1.6, 0.7], [76, -15, 3.4, 2, 0.8], [80, -13, 2.2, 1.6, 0.6], [90, -10, 3, 2, 0.8], [94, -15, 2.4, 1.8, 0.7]]
    .map((u) => [u[0] + oB, ...u.slice(1)]).filter((u) => u[0] + u[2] / 2 < Bx1 - 1).forEach((u) => roofUnit(...u));

  for (const [mat, list] of batches) {
    const m = new THREE.InstancedMesh(boxGeo, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.computeBoundingSphere(); m.computeBoundingBox?.();
    m.castShadow = true; m.receiveShadow = true; m.userData = { id }; group.add(m); meshes.push(m);
  }
  const main = meshes.find((m) => m.material === M.roof);
  main.userData = { id, name, height: TOP, roof: M.roof }; // 선택 시 지붕이 파랗게

  /* ---------- 지도 좌표로 배치 ---------- */
  // 모델 x = -8 (C동 가운데) ↔ 날개 가운데, 모델 z = 0 ↔ A동 정면선
  const uWing = uEnd - Cw / 2 - cOver;
  const toWorld = (x, z) => { const u = uWing - (x + 8), w = w0 + z; return [d[0] * u + wv[0] * w, d[1] * u + wv[1] * w]; };
  const [ox, oz] = toWorld(0, 0), [px, pz] = toWorld(1, 0), [qx, qz] = toWorld(0, 1);
  const lx = [px - ox, pz - oz], lz = [qx - ox, qz - oz];
  group.position.set(ox, 0, oz);
  group.rotation.y = Math.atan2(lz[0], lz[1]);
  // 로컬 x 가 회전으로 만들어지지 않는 방향(거울상)이면 x 를 뒤집는다
  const rx = [Math.cos(group.rotation.y), -Math.sin(group.rotation.y)];
  if (rx[0] * lx[0] + rx[1] * lx[1] < 0) group.scale.x = -1;
  if (group.scale.x < 0) for (const m of meshes) { m.material.side = THREE.DoubleSide; }
  scene.add(group);

  /* ---------- 걷기 충돌 · 선택 정보 ---------- */
  const rect = (x0, x1, z0, z1, h) => { const r = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x1, z1), toWorld(x0, z1)]; const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]); return { ring: r, h, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }; };
  const solids = [rect(-16, Ax1, -16, 0, TOP), rect(-16, 0, 0, Cz1, TOP), rect(Ax1, Bx0, -16, 3, 13.6), rect(Bx0, Bx1 + endW, Bf - 16, Bf, TOP)];
  const [cx, cz] = toWorld((Bx1 + endW - 16) / 2, -4);
  return { mesh: main, meshes, solids, center: new THREE.Vector3(cx, TOP + 4, cz), radius: (Bx1 + endW + 16) / 2 + 8 };
}
