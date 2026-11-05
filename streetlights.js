// 가로등 — 도로를 따라 일정 간격으로 세우고, 밤(다크 테마)에만 켠다.
//  - 기둥·팔·등갓은 InstancedMesh 3개 (수백 개여도 가볍게)
//  - 밤: 등갓이 빛나고, 도로 위에 따뜻한 빛 웅덩이(가산 합성 원판)가 생김
//  - 카메라와 가까운 가로등 몇 개에만 실제 PointLight 를 붙여 주변 건물·나무·사람을 비춤
import * as THREE from "three";

const SPACING = 26;     // 가로등 간격(m)
const MIN_GAP = 15;     // 서로 이만큼은 떨어지게
const POLE_H = 6.2;
const REAL_LIGHTS = 6;  // 실제 조명 개수 (성능 때문에 가까운 것만)

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
function poolTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,214,150,0.85)"); gr.addColorStop(0.35, "rgba(255,196,120,0.45)"); gr.addColorStop(1, "rgba(255,180,100,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildStreetLights({ scene, roadSegs, inSolid, inBounds }) {
  // ---- 자리 정하기: 도로 가장자리에서 1 m 바깥, 도로를 바라보게 ----
  const spots = [];
  const grid = new Map(), key = (x, z) => `${Math.floor(x / MIN_GAP)},${Math.floor(z / MIN_GAP)}`;
  const tooClose = (x, z) => {
    const gx = Math.floor(x / MIN_GAP), gz = Math.floor(z / MIN_GAP);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grid.get(`${gx + i},${gz + j}`) || []) if (Math.hypot(p.x - x, p.z - z) < MIN_GAP) return true;
    return false;
  };
  const onAnyRoad = (x, z) => roadSegs.some(([a, b, c, d, w]) => segDist(x, z, a, b, c, d) < w + 0.4);
  let carry = SPACING / 2, side = 1;
  for (const [x1, z1, x2, z2, w] of roadSegs) {
    if (w < 1.6) continue; // 좁은 산책로는 빼고 차도·보도 위주
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 0.5) continue;
    const ux = (x2 - x1) / L, uz = (z2 - z1) / L, nx = -uz, nz = ux;
    let t = carry;
    for (; t < L; t += SPACING) {
      side = -side;
      for (const s of [side, -side]) {
        const off = w + 1.0;
        const x = x1 + ux * t + nx * off * s, z = z1 + uz * t + nz * off * s;
        if (!inBounds(x, z, 0) || inSolid(x, z, 1.5) || onAnyRoad(x, z) || tooClose(x, z)) continue;
        const p = { x, z, fx: -nx * s, fz: -nz * s }; // 도로 쪽을 향함
        spots.push(p);
        const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
        break;
      }
    }
    carry = t - L;
  }

  // ---- 모양 ----
  const group = new THREE.Group(); group.name = "streetlights"; scene.add(group);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, emissive: 0xffd08a, emissiveIntensity: 0, roughness: 0.4 });
  const n = spots.length;
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, POLE_H, 8).translate(0, POLE_H / 2, 0), poleMat, n);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.5).translate(0, POLE_H - 0.1, 0.72), poleMat, n);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 0.6).translate(0, POLE_H - 0.18, 1.45), headMat, n);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), n);
  pools.renderOrder = 2;
  const o = new THREE.Object3D();
  spots.forEach((p, i) => {
    o.position.set(p.x, 0, p.z); o.rotation.set(0, Math.atan2(p.fx, p.fz), 0); o.scale.set(1, 1, 1); o.updateMatrix();
    pole.setMatrixAt(i, o.matrix); arm.setMatrixAt(i, o.matrix); head.setMatrixAt(i, o.matrix);
    // 빛 웅덩이는 등 바로 아래(도로 쪽 1.45 m)
    p.lx = p.x + p.fx * 1.45; p.lz = p.z + p.fz * 1.45;
    o.position.set(p.lx, 0.1, p.lz); o.rotation.set(0, 0, 0); o.scale.set(13, 1, 13); o.updateMatrix();
    pools.setMatrixAt(i, o.matrix);
  });
  for (const m of [pole, arm, head]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  pools.computeBoundingSphere(); pools.visible = false; group.add(pools);

  // 가까운 가로등에 붙일 실제 조명 (밤에만 켬)
  const lights = [];
  for (let i = 0; i < Math.min(REAL_LIGHTS, n); i++) {
    const L = new THREE.PointLight(0xffc98a, 45, 26, 1.6);
    L.visible = false; scene.add(L); lights.push(L);
  }

  let night = false, lastPick = 0;
  function setNight(on) {
    night = !!on;
    headMat.emissiveIntensity = night ? 2.4 : 0;
    headMat.color.setHex(night ? 0xfff3d6 : 0xe5e7eb);
    pools.visible = night;
    lights.forEach((L) => (L.visible = night));
    lastPick = 0;
  }
  // 카메라(또는 걷는 사람) 가까운 가로등으로 실제 조명을 옮김
  function update(pos, now) {
    if (!night || !lights.length || now - lastPick < 250) return;
    lastPick = now;
    const near = spots.map((p) => ({ p, d: (p.lx - pos.x) ** 2 + (p.lz - pos.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, lights.length);
    near.forEach(({ p }, i) => lights[i].position.set(p.lx, POLE_H - 0.4, p.lz));
  }
  return { setNight, update, count: n, spots };
}
