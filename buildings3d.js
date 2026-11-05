// 삼척캠퍼스 건물 3D 모델링 — 강원대 공식 건물 사진을 참고해 건물마다 외벽 재질·창 패턴·지붕·특징 구조물을 다르게 만든다.
// 윤곽(footprint)은 OpenStreetMap, 높이는 층수(사진으로 보정), 나머지는 사진의 특징을 단순화한 절차적 모델.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildEng5 } from "./eng5-model.js?v=31";
import { buildEng3 } from "./eng3-model.js?v=31";
import { buildGang } from "./gang-model.js?v=32";
import { buildGre } from "./gre-model.js?v=33";
import { buildEng1, buildEng2 } from "./eng12-model.js?v=34";

/* ---------- 외벽 텍스처 (한 칸 = 창 1개 폭 × 1개 층) ---------- */
const PAL = {
  cream: "#efe8d9", white: "#f6f6f2", brick: "#9a4a32", brick2: "#b5603f", tan: "#c9a27a", grey: "#9aa1a8",
  glass: "#3f5f80", glassL: "#88a9c8", green: "#4f9c8e", greenL: "#9fd3c6", blue: "#2f5fa8", blueL: "#7aa6e0", teal: "#3f8a8c",
};
function brickFill(g, x, y, w, h, base) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1;
  for (let yy = y, r = 0; yy < y + h; yy += 8, r++) {
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    for (let xx = x + (r % 2) * 10; xx < x + w; xx += 20) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 8); g.stroke(); }
  }
}
function glassFill(g, x, y, w, h, dark, light) {
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, light); gr.addColorStop(1, dark);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}
const DRAW = {
  // 개별 창 (전산정보원·인문사회과학관·공동실험실습관)
  cream_grid: (g) => { g.fillStyle = PAL.cream; g.fillRect(0, 0, 128, 128); g.fillStyle = "#ddd3bf"; g.fillRect(0, 118, 128, 10); glassFill(g, 26, 30, 76, 60, PAL.glass, PAL.glassL); g.fillStyle = PAL.cream; g.fillRect(62, 30, 4, 60); return [[26, 30, 76, 60]]; },
  // 가로로 길게 이어진 띠창 (대학본부·그린에너지 연구관)
  cream_ribbon: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); glassFill(g, 0, 40, 128, 46, "#2c3e52", "#6f8aa6"); g.fillStyle = "#d9dde0"; g.fillRect(0, 40, 3, 46); g.fillRect(64, 40, 3, 46); return [[0, 40, 128, 46]]; },
  // 세로 유리띠 (도서관·제5공학관)
  cream_vstrip: (g) => { g.fillStyle = PAL.cream; g.fillRect(0, 0, 128, 128); glassFill(g, 0, 0, 44, 128, PAL.teal, PAL.greenL); g.fillStyle = "#e8e2d4"; g.fillRect(0, 60, 44, 4); glassFill(g, 70, 36, 40, 50, PAL.glass, PAL.glassL); return [[0, 0, 44, 128], [70, 36, 40, 50]]; },
  // 흰 기둥 + 붉은 벽돌 스팬드럴 (제1·2·4공학관)
  white_brick: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); brickFill(g, 14, 82, 100, 46, PAL.brick2); glassFill(g, 14, 18, 100, 60, PAL.glass, PAL.glassL); g.fillStyle = PAL.white; g.fillRect(62, 18, 4, 60); g.fillRect(0, 0, 14, 128); g.fillRect(114, 0, 14, 128); return [[14, 18, 100, 60]]; },
  // 흰 벽 + 황토색 띠 (제3공학관)
  white_tan: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); g.fillStyle = "#d8b58c"; g.fillRect(0, 90, 128, 22); glassFill(g, 18, 26, 92, 56, PAL.glass, PAL.glassL); g.fillStyle = PAL.white; g.fillRect(62, 26, 4, 56); return [[18, 26, 92, 56]]; },
  // 전면 벽돌 + 흰 창틀 (학생회관·제2학생회관)
  brick_grid: (g) => { brickFill(g, 0, 0, 128, 128, PAL.brick); g.fillStyle = "#f2efe8"; g.fillRect(28, 30, 72, 58); glassFill(g, 32, 34, 64, 50, PAL.glass, PAL.glassL); g.fillStyle = "#f2efe8"; g.fillRect(62, 34, 4, 50); return [[32, 34, 64, 50]]; },
  // 벽돌 + 파란 띠창 (체육관)
  brick_ribbon: (g) => { brickFill(g, 0, 0, 128, 128, PAL.brick); glassFill(g, 0, 22, 128, 30, PAL.blue, PAL.blueL); g.fillStyle = "#cfd6dd"; g.fillRect(0, 22, 128, 3); g.fillRect(63, 22, 2, 30); return [[0, 22, 128, 30]]; },
  // 밝은 벽돌 (언장관)
  tan_brick: (g) => { brickFill(g, 0, 0, 128, 128, PAL.tan); g.fillStyle = "#f4f1ea"; g.fillRect(36, 30, 56, 56); glassFill(g, 40, 34, 48, 48, PAL.glass, PAL.glassL); return [[40, 34, 48, 48]]; },
  // 흰 루버(가로 차양) — 강의동
  louver: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); glassFill(g, 6, 28, 116, 62, "#24384c", "#5f7d9a"); g.fillStyle = "#fafafa"; for (let y = 34; y < 90; y += 14) g.fillRect(6, y, 116, 4); g.fillRect(0, 0, 6, 128); g.fillRect(122, 0, 6, 128); return [[6, 28, 116, 62]]; },
  // 흰 벽 + 붉은 창틀 (조형관)
  white_red: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); g.fillStyle = "#c8553f"; g.fillRect(16, 26, 96, 62); glassFill(g, 22, 32, 84, 50, PAL.glass, PAL.glassL); return [[22, 32, 84, 50]]; },
  // 흰 격자 (해솔관)
  white_grid: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); g.fillStyle = "#e3e6ea"; g.fillRect(0, 0, 8, 128); glassFill(g, 20, 26, 88, 66, PAL.glass, PAL.glassL); g.fillStyle = PAL.white; g.fillRect(62, 26, 4, 66); return [[20, 26, 88, 66]]; },
  // 아파트형 기숙사 (두타관): 청록 창 + 붉은 띠
  apt: (g) => { g.fillStyle = PAL.white; g.fillRect(0, 0, 128, 128); g.fillStyle = "#c97a5a"; g.fillRect(0, 100, 128, 6); glassFill(g, 18, 22, 92, 62, PAL.teal, "#8ccfcf"); g.fillStyle = "#e9ecef"; g.fillRect(14, 80, 100, 8); return [[18, 22, 92, 62]]; },
  // 베이지 패널 (복합 스포츠센터)
  cream_panel: (g) => { g.fillStyle = "#ece6da"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "#d7cfbf"; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126); glassFill(g, 30, 40, 68, 40, PAL.blue, PAL.blueL); return [[30, 40, 68, 40]]; },
  // 유리 커튼월
  glass_blue: (g) => { glassFill(g, 0, 0, 128, 128, "#1f4f93", "#8fb8ef"); g.fillStyle = "#dfe8f2"; g.fillRect(0, 0, 128, 4); g.fillRect(0, 0, 4, 128); return [[0, 0, 128, 128]]; },
  glass_green: (g) => { glassFill(g, 0, 0, 128, 128, "#2f7f73", "#a8e0d2"); g.fillStyle = "#dff2ec"; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128); return [[0, 0, 128, 128]]; },
};
const TEX = {};
function facade(style) {
  if (TEX[style]) return TEX[style];
  const mk = (draw) => { const c = document.createElement("canvas"); c.width = c.height = 128; draw(c.getContext("2d")); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  let wins = [];
  const map = mk((g) => { wins = DRAW[style](g); });
  const glow = mk((g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#ffcf72"; wins.forEach(([x, y, w, h]) => g.fillRect(x + 2, y + 2, w - 4, h - 4)); });
  return (TEX[style] = { map, glow });
}

/* ---------- 건물별 사양 (공식 사진 참고) ---------- */
// wall: 외벽 스타일, roof: 지붕색, levels: 사진 기준 층수 보정, bay: 창 한 칸 폭(m), fx: 특징 구조물
export const SPEC = {
  n101: { wall: "cream_ribbon", roof: 0x7d8b99, bay: 4, fx: ["parapet", "roundCorner", "penthouse", "canopy"], note: "흰 외벽·가로 띠창·둥근 모서리" },
  n102: { wall: "cream_grid", roof: 0x8c8a80, fx: ["parapet", "glassBay", "entryStairs", "canopy"], note: "베이지 석재·2층 유리 돌출창·정면 계단" },
  n103: { wall: "louver", roof: 0x6f7b86, bay: 3.6, fx: ["parapet", "brickEnd", "canopy"], note: "붉은 벽돌 끝벽 + 흰 루버 띠" },
  n104: { wall: "cream_vstrip", roof: 0x8c8a80, fx: ["parapet", "penthouse", "canopyWide"], note: "베이지 패널·세로 유리띠·넓은 현관" },
  n105: { wall: "white_red", roof: 0x9aa3ad, fx: ["parapet", "stepped", "canopy"], note: "흰 외벽·붉은 창틀·계단식 매스" },
  n109: { wall: "brick_grid", roof: 0x6d6a66, fx: ["parapet", "greyBase", "canopy"], note: "갈색 벽돌·회색 1층" },
  n110: { wall: "brick_ribbon", roof: 0x7e8790, levels: 3, fx: ["gable", "canopyPillars"], note: "붉은 벽돌·파란 띠창·기둥 현관" },
  n111: { wall: "white_grid", roof: 0x2e4f80, levels: 2, fx: ["barrel"], note: "짙은 파란 곡면 지붕" },
  n112: { wall: "brick_grid", roof: 0x6d6a66, fx: ["parapet", "penthouse", "canopy"], note: "붉은 벽돌 외벽" },
  // n115 제3공학관은 전용 모델(eng3-model.js, 유리 승강탑 건물 디자인)을 쓴다
  n116: { wall: "tan_brick", roof: 0x5f6670, fx: ["cornice", "penthouse", "glassStair", "canopy"], note: "밝은 벽돌·회색 처마·유리 계단실" },
  n117: { wall: "white_brick", roof: 0x9fb0a8, fx: ["parapetThick", "pyramid", "canopy"], note: "흰 띠 + 벽돌·유리 피라미드 지붕" },
  n118: { wall: "white_brick", roof: 0x7a8794, fx: ["parapet", "canopy"], note: "흰 기둥 + 붉은 벽돌" },
  n119: { wall: "cream_grid", roof: 0x8c8a80, fx: ["parapet", "glassTower", "canopy"], note: "베이지 외벽·초록 유리 원통 타워" },
  // n120 제5공학관은 전용 모델(eng5-model.js, building_3d_viewer.html 디자인)을 쓴다 → 아래 CUSTOM 참고
  n121: { wall: "white_brick", roof: 0x7a8794, fx: ["parapet", "canopy"], note: "흰 프레임 + 주황 벽돌" },
  n122: { wall: "white_brick", roof: 0x7a8794, fx: ["parapet", "canopy"], note: "흰 격자 + 벽돌 스팬드럴" },
  n123: { wall: "cream_grid", roof: 0x6f7b86, fx: ["parapet", "solar", "canopy"], note: "베이지 격자·지붕 태양광 패널" },
  n124: { wall: "white_grid", roof: 0x8d9aa5, levels: 8, fx: ["parapet", "redBase", "knuSign", "canopy"], note: "흰 격자·붉은 기단·KNU 사인" },
  n125: { wall: "apt", roof: 0x9a6b55, levels: 13, fx: ["parapet", "stairTowers"], note: "13층 아파트형·둥근 계단탑 3개" },
  n126: { wall: "cream_ribbon", roof: 0x8d9aa5, fx: ["glassEnds", "roofFrame", "canopyWide"], note: "흰 띠창·양 끝 파란 유리·옥상 프레임" },
  n127: { wall: "cream_panel", roof: 0x9aa3ad, fx: ["parapet", "curtain", "canopyOrange"], note: "베이지 패널·파란 유리 커튼월·주황 현관" },
};
// 전용 모델이 있는 건물 (윤곽에 맞춰 늘려 세움)
const CUSTOM = { n120: buildEng5, n115: buildEng3, n103: buildGang, n126: buildGre, n121: buildEng1, n122: buildEng2 };
// 윤곽이 없는 지점은 사진을 참고한 소형 모델
export const POINT_MODELS = { n114: "gateArch", n107: "gatePosts", n113: "booth", n106: "booth", n108: "amphi" };

/* ---------- 기하 도우미 ---------- */
function obb(ring) { // 최소 면적 회전 사각형
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
    const a = Math.atan2(z2 - z1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
    let mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity;
    for (const [x, z] of ring) { const u = x * c + z * s, v = -x * s + z * c; mnU = Math.min(mnU, u); mxU = Math.max(mxU, u); mnV = Math.min(mnV, v); mxV = Math.max(mxV, v); }
    const area = (mxU - mnU) * (mxV - mnV);
    if (!best || area < best.area) {
      const cu = (mnU + mxU) / 2, cv = (mnV + mxV) / 2;
      best = { area, a, c, s, L: mxU - mnU, W: mxV - mnV, cx: cu * c - cv * s, cz: cu * s + cv * c };
    }
  }
  if (best.W > best.L) { // 긴 쪽을 u축으로
    const a = best.a + Math.PI / 2;
    best = { ...best, a, c: Math.cos(a), s: Math.sin(a), L: best.W, W: best.L };
  }
  best.at = (u, v) => [best.cx + u * best.c - v * best.s, best.cz + u * best.s + v * best.c];
  best.rotY = -best.a; // 로컬 x축 → u 방향
  return best;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
// 길에서 가장 가까운 외벽 = 정면(현관)
function frontEdge(ring, roads) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 5) continue;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    let d = Infinity; for (const [a, b, c, e] of roads) d = Math.min(d, segDist(mx, mz, a, b, c, e));
    const score = d - len * 0.15;
    if (!best || score < best.score) {
      let nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      best = { score, mx, mz, nx, nz, len, dx: (x2 - x1) / len, dz: (z2 - z1) / len };
    }
  }
  return best;
}
const yawFromDir = (dx, dz) => Math.atan2(dx, dz); // 로컬 z축을 (dx,dz)로

/* ---------- 메인 ---------- */
export function buildCampus({ scene: realScene, data, bInfo, roads, toXZ, buildings, pip }) {
  const scene = { add: (o) => { o.userData = o.userData || {}; o.userData.fromDetail = true; realScene.add(o); } };
  const meshes = [], byId = new Map(), solids = [], wallMats = [], glassMats = [], plainMats = [];
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x3a4250, transparent: true, opacity: 0.22 });
  const plainRoof = new THREE.MeshStandardMaterial({ color: 0x9aa79a, roughness: 0.85 });
  const M = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }); plainMats.push(m); return m; };
  const mat = {
    white: M(0xf4f3ee), cream: M(0xece4d3), brick: M(0x9a4a32), grey: M(0x8e959c), dark: M(0x4a525c), red: M(0xc8553f), orange: M(0xe07b2e), roofGrey: M(0x7a838c),
    solar: M(0x1f3557, { metalness: 0.4, roughness: 0.35 }),
  };
  const glassMat = (style, rx = 1 / 3, ry = 1 / 3.6) => {
    const t = facade(style); const map = t.map.clone(); map.needsUpdate = true; map.repeat.set(rx, ry);
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.25, metalness: 0.35, emissive: 0x000000 }); glassMats.push(m); return m;
  };
  const wallFor = (style, bay, floorH) => {
    const t = facade(style); const map = t.map.clone(), glow = t.glow.clone(); map.needsUpdate = glow.needsUpdate = true;
    map.repeat.set(1 / bay, 1 / floorH); glow.repeat.copy(map.repeat);
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0x000000, roughness: 0.8 }); wallMats.push(m); return m;
  };
  const setRep = (m, rx, ry) => { m.map.repeat.set(rx, ry); m.emissiveMap?.repeat.set(rx, ry); return m; };
  const add = (geo, m, x, y, z, rotY = 0, id = null) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = rotY; o.castShadow = o.receiveShadow = true;
    if (id) { o.userData = { id }; meshes.push(o); }
    scene.add(o); return o;
  };
  const changed = [];

  for (const f of data.features) {
    if (f.properties.kind !== "building") continue;
    const p = f.properties, ring = f.geometry.coordinates[0].map(toXZ);
    if (CUSTOM[p.id]) { // 건물 전용 모델
      const r = CUSTOM[p.id]({ ring, id: p.id, name: p.name, scene, wallFor, wallMats, glassMats });
      meshes.push(...r.meshes); solids.push(...r.solids);
      byId.set(p.id, { mesh: r.mesh, center: r.center, radius: r.radius, ring });
      changed.push(`${p.id} ${p.name} (전용 모델)`);
      continue;
    }
    const spec = p.id ? SPEC[p.id] : null;
    const levels = spec?.levels || p.levels || 2;
    const floorH = spec ? (p.levels && !spec.levels ? p.height / p.levels : 3.6) : 3.6;
    const H = spec?.levels ? levels * 3.6 + 0.6 : p.height;
    const xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
    solids.push({ ring, h: H, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    const info = p.id ? bInfo.get(p.id) : null;
    const roof = info ? new THREE.MeshStandardMaterial({ color: spec?.roof ?? 0x9aa79a, roughness: 0.75 }) : plainRoof;
    const wall = spec ? wallFor(spec.wall, spec.bay || 3.2, floorH) : wallFor("cream_grid", 3.2, 3.6);
    const fx = new Set(spec?.fx || []);
    // 계단식 매스(조형관): 아래 2/3만 전체 윤곽
    const bodyH = fx.has("stepped") ? Math.round(levels * 0.6) * floorH : H;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: bodyH, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, [roof, wall]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { id: p.id, name: p.name, height: H, roof };
    scene.add(mesh);
    scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
    const B = obb(ring);
    let topY = bodyH;
    if (spec) {
      const id = p.id, fr = frontEdge(ring, roads);
      const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cz = ring.reduce((s, q) => s + q[1], 0) / ring.length;
      const innerPoint = () => { // 윤곽 안쪽의 한 점 (가장 긴 변 가운데에서 안으로)
        let bi = 0, bl = 0; ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; bi = i; } });
        const p = ring[bi], q = ring[(bi + 1) % ring.length], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, nx = -(q[1] - p[1]) / bl, nz = (q[0] - p[0]) / bl;
        const yaw = -Math.atan2(q[1] - p[1], q[0] - p[0]);
        for (const dd of [6, -6, 10, -10, 3, -3]) if (pip(mx + nx * dd, mz + nz * dd, ring)) return [mx + nx * dd, mz + nz * dd, yaw];
        return [cx, cz, yaw];
      };
      // 원통 계단탑 자리: 가까운 오목한 안쪽 모서리에 끼우고(두 동에 맞붙음), 없으면 가장 가까운 외벽에 반쯤 묻는다
      const towerSpot = ([tx, tz], r) => {
        const R = ring.filter((p, i) => i < ring.length - 1 || p[0] !== ring[0][0] || p[1] !== ring[0][1]), n = R.length;
        let bestV = null, bd = Infinity;
        for (let i = 0; i < n; i++) {
          const a = R[(i - 1 + n) % n], v = R[i], b = R[(i + 1) % n];
          const c = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
          if (c * area2 >= 0) continue; // 볼록 꼭짓점
          const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1]);
          if (l1 < r * 1.2 || l2 < r * 1.2) continue; // 짧은 변(자잘한 꺾임)은 건너뜀
          const dd = Math.hypot(v[0] - tx, v[1] - tz); if (dd < bd) { bd = dd; bestV = [a, v, b, l1, l2]; }
        }
        if (bestV) {
          const [a, v, b, l1, l2] = bestV;
          const ox = (a[0] - v[0]) / l1 + (b[0] - v[0]) / l2, oz = (a[1] - v[1]) / l1 + (b[1] - v[1]) / l2, ol = Math.hypot(ox, oz) || 1;
          return [v[0] + (ox / ol) * r * 0.55, v[1] + (oz / ol) * r * 0.55];
        }
        let best = null; bd = Infinity;
        for (let i = 0; i < n; i++) {
          const [x1, z1] = R[i], [x2, z2] = R[(i + 1) % n], dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0.15, Math.min(0.85, ((tx - x1) * dx + (tz - z1) * dz) / L2)), px = x1 + t * dx, pz = z1 + t * dz, dd = Math.hypot(px - tx, pz - tz);
          if (dd < bd) { bd = dd; best = [px, pz]; }
        }
        return best;
      };
      const inset = (k) => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * k, -(cz + (z - cz) * k))));
      // 오목한(ㄱ·V자) 윤곽은 중심 축소 방식의 안쪽 구멍이 바깥으로 삐져나와 지붕이 깨지므로, 변마다 띠를 세워 만든다
      const area2 = ring.reduce((s, [x1, z1], i) => { const [x2, z2] = ring[(i + 1) % ring.length]; return s + x1 * z2 - x2 * z1; }, 0);
      const convex = ring.every((p, i) => { const q = ring[(i + 1) % ring.length], r = ring[(i + 2) % ring.length]; const c = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]); return c * area2 >= -1e-6; });
      const edgeBand = (hgt, t) => {
        const geos = [];
        for (let i = 0; i < ring.length; i++) {
          const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length], len = Math.hypot(x2 - x1, z2 - z1);
          if (len < 0.05) continue;
          let nx = -(z2 - z1) / len, nz = (x2 - x1) / len; if (area2 < 0) { nx = -nx; nz = -nz; } // 안쪽 법선
          const g = new THREE.BoxGeometry(len + t, hgt, t);
          g.rotateY(-Math.atan2(z2 - z1, x2 - x1));
          g.translate((x1 + x2) / 2 + nx * t / 2, hgt / 2, (z1 + z2) / 2 + nz * t / 2);
          geos.push(g);
        }
        return mergeGeometries(geos);
      };
      const ringGeo = (hgt, k) => {
        if (!convex) return edgeBand(hgt, Math.max(0.6, Math.min(1.2, (1 - k) * Math.min(B.L, B.W) / 2)));
        const s = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))); s.holes.push(inset(k)); const g = new THREE.ExtrudeGeometry(s, { depth: hgt, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g;
      };
      const k = Math.max(0.8, 1 - 1.2 / Math.max(6, Math.min(B.L, B.W) / 2));
      const parapetMat = /brick/.test(spec.wall) && spec.wall !== "white_brick" ? mat.brick : spec.wall === "tan_brick" ? mat.grey : mat.white;

      if (fx.has("stepped")) { // 윗부분은 작은 매스로
        const g2 = new THREE.BoxGeometry(B.L * 0.62, H - bodyH, B.W * 0.55);
        const [x, z] = B.at(-B.L * 0.15, 0);
        const wu = setRep(wallFor(spec.wall, 3.2, floorH), Math.round((B.L * 0.62) / 3.2), (H - bodyH) / floorH);
        add(g2, [wu, wu, roof, roof, wu, wu], x, bodyH + (H - bodyH) / 2, z, B.rotY, id);
        topY = H;
      }
      if (fx.has("parapet")) add(ringGeo(1.0, k), parapetMat, 0, bodyH, 0);
      if (fx.has("parapetThick")) add(ringGeo(1.8, k), mat.white, 0, bodyH - 0.4, 0);
      if (fx.has("cornice")) { const g = ringGeo(1.2, k); add(g, mat.dark, 0, bodyH, 0); }
      if (fx.has("penthouse")) {
        let [x, z] = B.at(0, 0), w = Math.min(14, B.L * 0.3), dpt = Math.min(9, B.W * 0.35), yaw = B.rotY;
        if (!convex) { [x, z, yaw] = innerPoint(); w = 10; dpt = 5; } // 오목한 건물은 가장 긴 동 위에 작게
        add(new THREE.BoxGeometry(w, 3.2, dpt), mat.cream, x, bodyH + 1.6, z, yaw, id);
      }
      if (fx.has("centerTower")) { const [x, z] = B.at(0, 0); add(new THREE.BoxGeometry(Math.min(12, B.L * 0.16), 7, Math.min(10, B.W * 0.3)), wallFor("cream_grid", 3.2, 3.5), x, bodyH + 3.5, z, B.rotY, id); }
      if (fx.has("roundCorner")) { // 대학본부의 둥근 모서리
        const r = Math.min(7, B.W * 0.3), [x, z] = B.at(B.L / 2 - r * 0.6, B.W / 2 - r * 0.6);
        add(new THREE.CylinderGeometry(r, r, bodyH + 1.2, 28), setRep(wallFor("cream_ribbon", 4, floorH), Math.round((2 * Math.PI * r) / 4), (bodyH + 1.2) / floorH), x, (bodyH + 1.2) / 2, z, 0, id);
      }
      if (fx.has("glassTower")) { // 인문사회과학관의 초록 유리 원통 (안에 계단 → 건물과 맞붙어야 함)
        const r = Math.min(7, B.W * 0.18);
        const [x, z] = towerSpot(B.at(B.L * 0.18, B.W / 2), r);
        const gm = glassMat("glass_green", Math.round((2 * Math.PI * r) / 2.2), levels + 2);
        add(new THREE.CylinderGeometry(r, r, H + 7, 32), gm, x, (H + 7) / 2, z, 0, id);
        add(new THREE.CylinderGeometry(r + 0.4, r + 0.4, 0.8, 32), mat.white, x, H + 7.2, z);
        topY = H + 7.6;
      }
      if (fx.has("brickEnd")) { // 강의동 끝의 붉은 벽돌 벽
        const [x, z] = B.at(-B.L / 2 + 4, 0);
        add(new THREE.BoxGeometry(8, H + 1.2, Math.min(B.W, 22) + 0.6), mat.brick, x, (H + 1.2) / 2, z, B.rotY, id);
      }
      if (fx.has("glassBay") && fr) { // 전산정보원 2층 유리 돌출창
        add(new THREE.BoxGeometry(Math.min(14, fr.len * 0.4), floorH * 0.9, 2.2), glassMat("glass_blue", 4, 1), fr.mx + fr.nx * 1.1, floorH * 1.5, fr.mz + fr.nz * 1.1, yawFromDir(fr.nx, fr.nz), id);
      }
      if (fx.has("entryStairs") && fr) {
        for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(9, 0.35, 1.2), mat.grey, fr.mx + fr.nx * (2.2 + i * 1.2), 0.18 + (3 - i) * 0.35, fr.mz + fr.nz * (2.2 + i * 1.2), yawFromDir(fr.nx, fr.nz));
      }
      if (fx.has("brickBase")) { const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 1.012, -(cz + (z - cz) * 1.012)))), { depth: floorH, bevelEnabled: false }); g.rotateX(-Math.PI / 2); add(g, wallFor("brick_grid", 3.2, floorH), 0, 0, 0); }
      if (fx.has("greyBase")) { const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 1.01, -(cz + (z - cz) * 1.01)))), { depth: floorH, bevelEnabled: false }); g.rotateX(-Math.PI / 2); add(g, wallFor("white_grid", 3.2, floorH), 0, 0, 0); }
      if (fx.has("redBase")) { const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 1.01, -(cz + (z - cz) * 1.01)))), { depth: 3.4, bevelEnabled: false }); g.rotateX(-Math.PI / 2); add(g, wallFor("brick_grid", 3.2, 3.4), 0, 0, 0); }
      if (fx.has("gable")) { // 체육관: 낮은 박공 지붕
        const s = new THREE.Shape([new THREE.Vector2(-B.W / 2, 0), new THREE.Vector2(B.W / 2, 0), new THREE.Vector2(0, 3.2)]);
        const g = new THREE.ExtrudeGeometry(s, { depth: B.L * 0.96, bevelEnabled: false }); g.translate(0, 0, -B.L * 0.48);
        const [x, z] = B.at(0, 0); add(g, roof, x, bodyH, z, Math.PI / 2 - B.a, id); topY = bodyH + 3.2;
      }
      if (fx.has("barrel")) { // 생활체육관: 곡면 지붕
        const r = B.W * 0.48, g = new THREE.CylinderGeometry(r, r, B.L * 0.98, 32, 1, false, -Math.PI / 2, Math.PI);
        g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2);
        const [x, z] = B.at(0, 0); const o = add(g, roof, x, bodyH, z, B.rotY, id); o.scale.y = 0.42; topY = bodyH + r * 0.42;
        add(ringGeo(0.9, k), mat.white, 0, bodyH - 0.9, 0);
      }
      if (fx.has("pyramid")) { // 창업보육센터: 8각 유리 피라미드
        const [x, z] = B.at(0, 0), r = Math.min(B.L, B.W) * 0.32;
        add(new THREE.ConeGeometry(r, 4.5, 8), glassMat("glass_green", 3, 2), x, bodyH + 1.4 + 2.25, z, Math.PI / 8, id);
        add(new THREE.CylinderGeometry(r, r, 1.4, 8), mat.white, x, bodyH + 0.7, z, Math.PI / 8);
        topY = bodyH + 5.9;
      }
      if (fx.has("solar")) { // 공동실험실습관 지붕 태양광
        const nu = Math.max(2, Math.floor((B.L * 0.8) / 4.5)), nv = Math.max(1, Math.floor((B.W * 0.7) / 3.2));
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
          const u = -B.L * 0.4 + (i + 0.5) * ((B.L * 0.8) / nu), v = -B.W * 0.35 + (j + 0.5) * ((B.W * 0.7) / nv);
          const [x, z] = B.at(u, v); if (!pip(x, z, ring)) continue;
          const o = add(new THREE.BoxGeometry((B.L * 0.8) / nu - 0.6, 0.12, 2.4), mat.solar, x, bodyH + 1.0, z, B.rotY); o.rotation.x = -0.4; o.rotation.order = "YXZ";
        }
      }
      if (fx.has("stairTowers")) { // 두타관: 둥근 계단탑 3개 + 벽돌 캡
        for (const t of [-0.42, 0, 0.42]) {
          const [x, z] = B.at(B.L * t, B.W / 2 + 0.6);
          add(new THREE.CylinderGeometry(2.2, 2.2, H + 3, 20), mat.white, x, (H + 3) / 2, z, 0, id);
          add(new THREE.BoxGeometry(5.2, 2, 5.2), mat.brick, x, H + 4, z, B.rotY, id);
          add(new THREE.BoxGeometry(0.9, H - 4, 0.3), glassMat("glass_green", 1, levels), x + Math.cos(B.a + Math.PI / 2) * 2.25, H / 2, z + Math.sin(B.a + Math.PI / 2) * 2.25, B.rotY);
        }
        topY = H + 5;
      }
      if (fx.has("glassStair") && fr) { // 유리 계단실: 정면 외벽에 붙인다
        const x = fr.mx + fr.dx * fr.len * 0.3 + fr.nx * 1.2, z = fr.mz + fr.dz * fr.len * 0.3 + fr.nz * 1.2;
        add(new THREE.BoxGeometry(5, H + 2, 2.4), glassMat("glass_blue", 2, levels), x, (H + 2) / 2, z, yawFromDir(fr.nx, fr.nz), id);
      }
      if (fx.has("glassEnds")) { // 그린에너지 연구관: 양 끝 파란 유리 + 회색 패널
        for (const sgn of [-1, 1]) {
          const [x, z] = B.at(sgn * (B.L / 2 - 1.5), 0);
          add(new THREE.BoxGeometry(3.6, H + 0.8, B.W * 0.92), sgn < 0 ? glassMat("glass_blue", 3, levels) : mat.grey, x, (H + 0.8) / 2, z, B.rotY, id);
        }
      }
      if (fx.has("roofFrame")) { // 옥상 캐노피 프레임
        const [x, z] = B.at(0, 0);
        add(new THREE.BoxGeometry(B.L * 0.85, 0.5, B.W * 0.7), mat.dark, x, H + 3.2, z, B.rotY, id);
        for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = B.at(u * B.L * 0.4, v * B.W * 0.32); add(new THREE.BoxGeometry(0.5, 3.2, 0.5), mat.dark, px, H + 1.6, pz, B.rotY); }
        topY = H + 3.5;
      }
      if (fx.has("knuSign") && fr) { // 해솔관 세로 KNU 사인
        const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 256); g.fillStyle = "#1e4fa8"; g.font = "bold 56px sans-serif"; g.textAlign = "center";
        ["K", "N", "U"].forEach((ch, i) => g.fillText(ch, 32, 70 + i * 70)); g.fillStyle = "#f59e0b"; g.fillRect(20, 6, 24, 10);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        const [x, z] = [fr.mx + fr.dx * fr.len * 0.3 + fr.nx * 0.4, fr.mz + fr.dz * fr.len * 0.3 + fr.nz * 0.4];
        add(new THREE.BoxGeometry(3, H * 0.7, 0.5), [mat.white, mat.white, mat.white, mat.white, new THREE.MeshStandardMaterial({ map: t }), mat.white], x, H * 0.55, z, yawFromDir(fr.nx, fr.nz), id);
      }
      if (fx.has("curtain") && fr) { // 복합 스포츠센터 유리 커튼월
        add(new THREE.BoxGeometry(fr.len * 0.82, H - 1, 1.2), glassMat("glass_blue", fr.len * 0.82 / 2.4 / 4, 2), fr.mx + fr.nx * 0.5, (H - 1) / 2 + 0.5, fr.mz + fr.nz * 0.5, yawFromDir(fr.nx, fr.nz), id)
          .material.map.repeat.set(Math.round(fr.len * 0.82 / 2.4), levels * 2);
      }
      // 현관 캐노피 (길 쪽 외벽)
      if (fr && (fx.has("canopy") || fx.has("canopyWide") || fx.has("canopyOrange") || fx.has("canopyPillars") || fx.has("archCanopy"))) {
        const w = fx.has("canopyWide") ? 12 : fx.has("canopyPillars") ? 10 : 6, depth = fx.has("canopyPillars") ? 5 : 3;
        const yaw = yawFromDir(fr.nx, fr.nz), cxp = fr.mx + fr.nx * (depth / 2), czp = fr.mz + fr.nz * (depth / 2);
        const cm = fx.has("canopyOrange") ? mat.orange : fx.has("archCanopy") ? mat.brick : mat.cream;
        if (fx.has("archCanopy")) {
          const g = new THREE.CylinderGeometry(2.6, 2.6, depth + 1.2, 20, 1, false, -Math.PI / 2, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2);
          add(g, mat.cream, cxp, 4.2, czp, yaw + Math.PI / 2).scale.y = 0.6;
        }
        add(new THREE.BoxGeometry(w, 0.45, depth), cm, cxp, 4.0, czp, yaw);
        const posts = fx.has("canopyPillars") ? [-0.4, -0.13, 0.13, 0.4] : [-0.42, 0.42];
        for (const t of posts) add(new THREE.BoxGeometry(fx.has("canopyPillars") ? 0.9 : 0.35, 4, fx.has("canopyPillars") ? 0.9 : 0.35), fx.has("canopyPillars") ? mat.cream : mat.grey, cxp + fr.dx * w * t + fr.nx * depth * 0.4, 2, czp + fr.dz * w * t + fr.nz * depth * 0.4, yaw);
      }
      changed.push(`${p.id} ${p.name}`);
    }
    if (p.id) {
      meshes.push(mesh);
      const [x, z] = [B.cx, B.cz];
      byId.set(p.id, { mesh, center: new THREE.Vector3(x, topY, z), radius: Math.hypot(B.L, B.W) / 2, ring });
    }
  }

  // ---------- 윤곽 없는 지점 (사진 참고 소형 모델) ----------
  const nearestRoadDir = (x, z) => { let best = null, bd = Infinity; for (const [a, b, c, e] of roads) { const d = segDist(x, z, a, b, c, e); if (d < bd) { bd = d; best = [c - a, e - b]; } } if (!best) return [0, 1]; const l = Math.hypot(...best) || 1; return [best[0] / l, best[1] / l]; };
  for (const b of buildings) {
    if (byId.has(b.id)) continue;
    const [x, z] = toXZ([b.lng, b.lat]), kind = POINT_MODELS[b.id];
    const [dx, dz] = nearestRoadDir(x, z), yaw = yawFromDir(dx, dz);
    let top = 6, main;
    if (kind === "gateArch") { // 정문: 붉은 아치
      const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 0.55, 14, 48, Math.PI), mat.red);
      arch.position.set(x, 0.8, z); arch.rotation.y = yaw; arch.castShadow = true; arch.userData = { id: b.id }; scene.add(arch); meshes.push(arch); main = arch;
      for (const sgn of [-1, 1]) add(new THREE.BoxGeometry(2.4, 1.6, 2.4), mat.white, x + Math.cos(yaw) * 9 * sgn, 0.8, z - Math.sin(yaw) * 9 * sgn, yaw, b.id);
      top = 10.5;
    } else if (kind === "gatePosts") {
      for (const sgn of [-1, 1]) main = add(new THREE.BoxGeometry(1.6, 5, 1.6), mat.grey, x + Math.cos(yaw) * 6 * sgn, 2.5, z - Math.sin(yaw) * 6 * sgn, yaw, b.id);
      add(new THREE.BoxGeometry(13.6, 0.8, 1.6), mat.dark, x, 5.2, z, yaw, b.id); top = 6;
    } else if (kind === "booth") {
      main = add(new THREE.BoxGeometry(4, 3, 4), wallFor("cream_grid", 2, 3), x, 1.5, z, yaw, b.id);
      add(new THREE.BoxGeometry(5.4, 0.4, 5.4), mat.dark, x, 3.2, z, yaw, b.id); top = 4;
    } else if (kind === "amphi") { // 야외음악당: 무대 + 반구 셸 + 계단식 객석
      main = add(new THREE.BoxGeometry(14, 1, 9), mat.grey, x, 0.5, z, yaw, b.id);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(7.5, 28, 14, 0, Math.PI, 0, Math.PI / 2), mat.white);
      shell.position.set(x - dx * 2, 1, z - dz * 2); shell.rotation.y = yaw + Math.PI / 2; shell.castShadow = true; shell.userData = { id: b.id }; scene.add(shell); meshes.push(shell);
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(18 + i * 3, 0.5 + i * 0.5, 2), mat.cream, x + dx * (7 + i * 2), (0.5 + i * 0.5) / 2, z + dz * (7 + i * 2), yaw);
      top = 8.5;
    } else {
      main = add(new THREE.CylinderGeometry(1.2, 1.2, 6, 12), M(0x2563eb), x, 3, z, 0, b.id);
    }
    if (kind) changed.push(`${b.id} ${b.name}`);
    byId.set(b.id, { mesh: main, center: new THREE.Vector3(x, top, z), radius: 10, point: true });
  }
  return { meshes, byId, solids, wallMats, glassMats, plainMats, edgeMat, changed };
}
