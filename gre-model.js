// 그린에너지공학관(126동) 전용 3D 모델 — greenenergy-building.html 뷰어의 건물을 캠퍼스 3D 지도에 옮긴 것.
// 구성: 서측 어두운 측면 동(세로 유리띠·캐노피 현관) · 중앙 흰/베이지 타워(띠창·상층부 간판) · 저층 기단(블루 유리 띠·붉은 트림) · 옥상 태양광 패널.
// 모델 좌표: x = 건물 길이(서 -34 → 동 +22), z = 정면(+z = 남쪽), 단위 m. 치수는 사진에서 어림한 값이다.
// OSM 윤곽의 최소 사각형(OBB)에 맞춰 늘리고 돌린다. 장변은 동쪽을 향하고, 정면(+z)은 남쪽을 향한다.
import * as THREE from "three";

const MX0 = -34, MX1 = 22, MZ0 = -12, MZ1 = 12;   // 본관 범위 (모델 좌표)
const MODEL_L = MX1 - MX0, MODEL_D = MZ1 - MZ0;   // 56 × 24 m
const CX_MODEL = (MX0 + MX1) / 2;                  // -6
const TOP = 38.5;                                  // 옥상 부속실 상단 (추정)
const SIGN_NAME = "그린에너지연구관";

/* ---------- 텍스처 도우미 ---------- */
function facadeTexture(W, H, o) {
  const cw = 1024;
  const ch = Math.min(2048, Math.max(256, Math.round(cw * H / W)));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const g = c.getContext("2d");
  g.fillStyle = o.bg;
  g.fillRect(0, 0, cw, ch);
  const cellW = cw / o.cols, cellH = ch / o.rows;
  for (let r = 0; r < o.rows; r++) {
    for (let k = 0; k < o.cols; k++) {
      const x = k * cellW, y = r * cellH;
      const gx = x + o.inX * cellW, gy = y + o.inY * cellH;
      const gw = cellW * (1 - 2 * o.inX), gh = cellH * (1 - 2 * o.inY);
      const grd = g.createLinearGradient(gx, gy, gx + gw, gy + gh);
      grd.addColorStop(0, o.glass);
      grd.addColorStop(0.35, o.sheen || o.glass);
      grd.addColorStop(0.6, o.glass);
      grd.addColorStop(1, o.glass);
      g.fillStyle = grd;
      g.fillRect(gx, gy, gw, gh);
      if (o.mull) {
        g.fillStyle = o.frame;
        for (let i = 1; i < o.mull; i++) g.fillRect(gx + gw * i / o.mull - 2, gy, 4, gh);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textTexture(text, cw, ch, font, color) {
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const g = c.getContext("2d");
  g.font = font;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cw / 2, ch / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function verticalSignTexture(chars) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 800;
  const g = c.getContext("2d");
  g.fillStyle = "#f4f4f0";
  g.font = 'bold 96px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  chars.forEach((ch, i) => { if (ch) g.fillText(ch, 128, 64 + i * 98); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#1c2d4d";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(200,215,235,.55)";
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke(); }
  for (let j = 0; j <= 5; j++) { g.beginPath(); g.moveTo(0, j * 51.2); g.lineTo(256, j * 51.2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- 본 함수 ---------- */
export function buildGre({ ring, id, name, scene, glassMats }) {
  const FOOT = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring;
  const n = FOOT.length;

  /* ---------- 최소 면적 사각형(OBB) ---------- */
  let best = null;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = FOOT[i], [x2, z2] = FOOT[(i + 1) % n];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-6) continue;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L;
    let mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity;
    for (const [x, z] of FOOT) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      mnU = Math.min(mnU, u); mxU = Math.max(mxU, u);
      mnV = Math.min(mnV, v); mxV = Math.max(mxV, v);
    }
    const area = (mxU - mnU) * (mxV - mnV);
    if (!best || area < best.area) best = { area, ux, uz, mnU, mxU, mnV, mxV };
  }
  let e = [best.ux, best.uz], Lp = best.mxU - best.mnU;
  let w = [-best.uz, best.ux], Wp = best.mxV - best.mnV;
  if (Wp > Lp) { [e, w] = [w, e]; [Lp, Wp] = [Wp, Lp]; }
  if (e[0] < 0) e = [-e[0], -e[1]];                 // 장변은 동쪽을 향하게
  const f = [-e[1], e[0]];                          // 정면(+z)은 남쪽
  const cx = FOOT.reduce((s, p) => s + p[0], 0) / n;
  const cz = FOOT.reduce((s, p) => s + p[1], 0) / n;

  /* ---------- 재질 ---------- */
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  const M = {
    concrete: std(0xe7e3d9),
    beige: std(0xd9d2c2),
    dark: std(0x3a4048, { roughness: 0.6 }),
    stone: std(0x5d636b),
    glass: std(0x2b5a80, { roughness: 0.15, metalness: 0.4 }),
    glassDk: std(0x2a3d4e, { roughness: 0.2, metalness: 0.3 }),
    frame: std(0xd8d2c4),
    red: std(0xb0272c),
    grey: std(0xbdbcb6),
    roof: std(0x8c9096),
    concreteTop: std(0xd9d2c2),
  };
  glassMats.push(M.glass, M.glassDk);
  M.panel = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.25, metalness: 0.5 });

  /* ---------- 모델 좌표에 짓기 ---------- */
  const G = new THREE.Group();
  G.name = "gre-building";
  const addMesh = (geo, material, x, y, z, part) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (part) m.userData.part = part;
    G.add(m);
    return m;
  };
  const bx = (x0, x1, y0, y1, z0, z1, material, part) =>
    addMesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, part);
  const facade = (x0, x1, y0, y1, z, dir, o) => {
    const W = x1 - x0, H = y1 - y0;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: facadeTexture(W, H, o), roughness: 0.35, metalness: 0.1 })
    );
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z + dir * 0.02);
    if (dir < 0) m.rotation.y = Math.PI;
    m.receiveShadow = true;
    G.add(m);
    return m;
  };
  const plate = (text, x, y, z, w, h, dir, font, color) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: textTexture(text, 1024, Math.round(1024 * h / w), font, color), transparent: true, roughness: 0.5
      })
    );
    m.position.set(x, y, z + dir * 0.03);
    if (dir < 0) m.rotation.y = Math.PI;
    G.add(m);
    return m;
  };

  // 서측 어두운 측면 동
  const DARK = "좌측 측면 동";
  bx(-34, -20, 0, 36, -9, 9, M.dark, DARK);
  facade(-34, -20, 0, 36, 9, 1,
    { bg: "#363c44", glass: "#1f4a70", sheen: "#5b8bb0", rows: 10, cols: 3, inX: 0.16, inY: 0.26, mull: 0, frame: "#000" });
  bx(-33.4, -31.6, 2, 34, 9, 9.1, M.glass, DARK);
  {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 8.1),
      new THREE.MeshStandardMaterial({
        map: verticalSignTexture(["국", "립", "", "강", "원", "대", "학", "교"]), transparent: true, roughness: 0.5
      })
    );
    m.position.set(-26.5, 27, 9.06);
    G.add(m);
  }

  // 주출입구 캐노피
  const ENTRY = "주출입구 캐노피";
  bx(-32, -22.5, 3.5, 3.9, 9, 12.6, M.red, ENTRY);
  bx(-28.6, -24.6, 0, 3.5, 9.0, 9.06, M.glassDk, ENTRY);
  for (const x of [-31.4, -23.4]) {
    addMesh(new THREE.CylinderGeometry(0.16, 0.16, 3.5, 10), M.grey, x, 1.75, 12.1, ENTRY);
  }

  // 중앙 타워
  const TOWER = "중앙 타워";
  bx(-20, 2, 0, 33, -8, 8, M.beige, TOWER);
  const towerOpts = { bg: "#e3ddd0", glass: "#34505f", sheen: "#8fb2c6", rows: 10, cols: 1, inX: 0.03, inY: 0.24, mull: 12, frame: "#dcd6c8" };
  facade(-20, 2, 0, 33, 8, 1, towerOpts);
  facade(-20, 2, 0, 33, -8, -1, towerOpts);
  bx(-17, -1, 33, 36.5, -6, 6, M.concrete, "타워 상층부");
  plate(SIGN_NAME, -9, 34.8, 6, 11, 2.2, 1,
    'bold 118px "Malgun Gothic","Apple SD Gothic Neo",sans-serif', "#2a333d");
  bx(-12, -6, 36.5, 38.5, -3, 3, M.dark, "옥상 부속실");

  // 저층 기단부
  const PODIUM = "저층 기단부";
  const podiumRoof = bx(-20, 22, 0, 12, -12, 12, M.concrete, PODIUM);
  bx(-20.05, 22.05, 0, 1.6, 12, 12.12, M.stone, PODIUM);
  bx(-18, 20, 2, 6, 12, 12.12, M.glass, "저층 블루 유리 띠");
  for (let x = -18; x <= 20.01; x += 3.2) bx(x - 0.08, x + 0.08, 2, 6, 12.12, 12.17, M.frame, "저층 블루 유리 띠");
  bx(-20.05, 22.05, 11.8, 12.25, 11.95, 12.2, M.red, PODIUM);

  // 옥상 태양광 패널
  const PANEL = "태양광 패널";
  for (let r = 0; r < 6; r++) {
    const zc = -9 + r * 2.8;
    bx(3.5, 20.5, 12, 12.18, zc - 0.15, zc + 0.15, M.frame, PANEL);
    for (let c = 0; c < 8; c++) {
      const p = addMesh(new THREE.BoxGeometry(1.85, 0.06, 1.25), M.panel, 4.5 + c * 2.1, 12.45, zc, PANEL);
      p.rotation.x = -0.3;
    }
  }

  G.traverse(o => { if (o.isMesh) o.updateMatrix(); });

  /* ---------- 윤곽에 맞춰 배치 (모델 x → e, 모델 z → f) ---------- */
  const sx = Lp / MODEL_L, sz = Wp / MODEL_D;
  // 180도 회전 (greenenergy-building-180.html 과 같은 방향: 어두운 측면 동이 동쪽, 정면이 북쪽)
  const X = [-e[0] * sx, 0, -e[1] * sx];
  const Z = [-f[0] * sz, 0, -f[1] * sz];
  const mat4 = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(X[0], 0, X[2]),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(Z[0], 0, Z[2])
  );
  const tx = cx - X[0] * CX_MODEL, tz = cz - X[2] * CX_MODEL;
  mat4.setPosition(tx, 0, tz);
  G.applyMatrix4(mat4);
  scene.add(G);

  const meshes = [];
  G.traverse(o => { if (o.isMesh) meshes.push(o); });

  // 선택 시 지붕 강조용 대표 메시 (저층 기단 지붕)
  podiumRoof.userData = { id, name, height: TOP, roof: M.roof };

  /* ---------- 걷기 충돌 · 선택 정보 ---------- */
  const xs = FOOT.map(p => p[0]), zs = FOOT.map(p => p[1]);
  const solids = [{ ring: FOOT, h: TOP, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }];
  let radius = 0;
  for (const [x, z] of FOOT) radius = Math.max(radius, Math.hypot(x - cx, z - cz));
  return { mesh: podiumRoof, meshes, solids, center: new THREE.Vector3(cx, TOP + 4, cz), radius: radius + 8 };
}
