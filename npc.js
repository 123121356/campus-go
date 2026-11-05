// 3D 걷기 모드 NPC — 건물마다 안내원 한 명. 가까이 가서 E키(모바일은 '대화' 버튼)를 누르면 말풍선으로 건물을 설명한다.
// 대사는 data/npc.json (건물마다 4개, 누를 때마다 다른 말). 제5공학관(n120) 앞 NPC는 AI 에이전트: 채팅창을 열어
// 앱의 AI 에이전트(api/agent)와 같은 도구(aiTools)로 실제 데이터를 확인해 답한다. 서버가 안 되면 건물 데이터로 간단히 답한다.
import * as THREE from "three";
import { aiTools } from "./ai.js";

const TALK_R = 6;       // 이 거리 안에서 대화 가능
const BUBBLE_MS = 7000; // 말풍선 표시 시간
const AI_ID = "n120";

const CSS = `
.npc-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6}
.npc-bubble{position:absolute;left:0;top:0;max-width:260px;padding:9px 12px;border-radius:14px;background:#fff;color:#1d2433;font-size:13px;line-height:1.45;box-shadow:0 4px 14px rgba(0,0,0,.22);transform:translate(-50%,-100%);white-space:normal;word-break:keep-all}
.npc-bubble::after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#fff}
.npc-bubble b.who{display:block;font-size:11px;color:#2563eb;margin-bottom:2px}
.npc-bubble.ai b.who{color:#0891b2}
.npc-prompt[hidden],.npc-bubble[hidden]{display:none}
.npc-prompt{position:absolute;left:50%;top:calc(50% + 36px);transform:translateX(-50%);background:rgba(17,24,39,.82);color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;pointer-events:auto;cursor:pointer;border:0;font:inherit;white-space:nowrap;z-index:7}
.npc-prompt kbd{display:inline-block;min-width:18px;padding:1px 6px;margin-right:6px;border-radius:5px;background:#fff;color:#111;font:700 12px/18px system-ui,sans-serif;text-align:center}
.npc-chat{position:absolute;right:14px;bottom:14px;width:min(360px,calc(100% - 28px));height:min(440px,calc(100% - 120px));display:flex;flex-direction:column;background:rgba(255,255,255,.97);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.28);z-index:8;overflow:hidden;color:#1d2433}
.npc-chat[hidden]{display:none}
.npc-chat header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0e7490;color:#fff;font-weight:600;font-size:14px}
.npc-chat header span{flex:1}
.npc-chat header button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:4px 9px;cursor:pointer;font:inherit;font-size:12px}
.npc-log{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.5}
.npc-msg{max-width:88%;padding:7px 10px;border-radius:12px;word-break:keep-all;overflow-wrap:anywhere}
.npc-msg.me{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}
.npc-msg.bot{align-self:flex-start;background:#eef2f7;border-bottom-left-radius:4px}
.npc-msg.bot a{color:#0e7490}
.npc-msg .tool{display:block;font-size:11px;color:#64748b;margin-bottom:3px}
.npc-msg.wait{color:#64748b}
.npc-chat form{display:flex;gap:6px;padding:8px;border-top:1px solid #e5e7eb}
.npc-chat input{flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:9px;padding:8px 10px;font:inherit;font-size:13px}
.npc-chat form button{border:0;border-radius:9px;background:#0e7490;color:#fff;padding:0 14px;font:inherit;font-size:13px;cursor:pointer}
.npc-chat form button:disabled{opacity:.5}
.npc-guide{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:rgba(8,145,178,.92);color:#fff;padding:7px 8px 7px 14px;border-radius:22px;font-size:13px;z-index:7;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.2);white-space:nowrap}
.npc-guide[hidden],.npc-ai-btn[hidden]{display:none}
.npc-ai-btn{position:absolute;right:14px;top:14px;display:flex;align-items:center;gap:6px;border:0;border-radius:20px;background:rgba(14,116,144,.9);color:#fff;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;z-index:7;box-shadow:0 4px 14px rgba(0,0,0,.2)}
.npc-ai-btn kbd{display:inline-block;padding:0 5px;border-radius:4px;background:#fff;color:#111;font:700 11px/16px system-ui,sans-serif}
.npc-guide.off{background:rgba(51,65,85,.85)}
.npc-guide button{border:0;border-radius:14px;background:rgba(255,255,255,.2);color:#fff;padding:3px 9px;font:inherit;font-size:12px;cursor:pointer}
.npc-guide kbd{display:inline-block;padding:0 5px;margin-right:3px;border-radius:4px;background:#fff;color:#111;font:700 11px/16px system-ui,sans-serif}
.npc-chat .npc-tip{padding:0 12px 8px;font-size:11px;color:#64748b}
`;

const TOOL_LABEL = {
  find_place: "📍 장소 찾는 중", navigate: "🧭 길 찾는 중", get_schedule: "🗓 시간표 확인", add_classes: "🗓 시간표 등록", remove_class: "🗓 시간표 수정",
  get_bus: "🚌 버스 확인", get_weather: "🌤 날씨 확인", search_school_info: "📢 공지 검색", campus_status: "👥 혼잡도 확인",
  report_status: "📝 제보 저장", community: "💬 커뮤니티 확인", get_meals: "🍚 학식 확인",
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[^"])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">링크</a>')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "· ").replace(/\n{3,}/g, "\n\n").replace(/\n/g, "<br>");
}
const plain = (t) => String(t || "").replace(/\[\[[^\]]*\]\]/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/^\s*[-*·]\s+/gm, "").replace(/\s+/g, " ").trim();
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/* ---------- 캐릭터 모양 ---------- */
const SHIRT = { 강의: 0x2563eb, 행정: 0x334155, 편의: 0xf97316, 체육: 0x16a34a, 생활: 0x7c3aed, 출입: 0x0d9488 };
function person(color) {
  const g = new THREE.Group();
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const pants = m(0x1f2937), skin = m(0xf1c7a1), shirt = m(color), hair = m(0x2b2118);
  add(new THREE.BoxGeometry(0.17, 0.82, 0.2), pants, -0.11, 0.41, 0);
  add(new THREE.BoxGeometry(0.17, 0.82, 0.2), pants, 0.11, 0.41, 0);
  add(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirt, 0, 1.12, 0);
  const armGeo = () => new THREE.BoxGeometry(0.13, 0.6, 0.15).translate(0, -0.27, 0); // 어깨를 축으로 회전
  const armL = add(armGeo(), shirt, -0.33, 1.4, 0);
  const armR = add(armGeo(), shirt, 0.33, 1.4, 0);
  add(new THREE.SphereGeometry(0.17, 14, 10), skin, 0, 1.6, 0);
  const h = add(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.63, -0.01);
  h.scale.set(1, 0.8, 1);
  add(new THREE.BoxGeometry(0.22, 0.12, 0.02), m(0xffffff), 0.12, 1.25, 0.145); // 이름표
  return { g, armR, armL, head: 1.95 };
}
function robot() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.2 });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const flame = add(new THREE.ConeGeometry(0.16, 0.42, 16).rotateX(Math.PI), glow, 0, 0.18, 0); // 추진 불꽃(날 때)
  flame.castShadow = false;
  add(new THREE.CapsuleGeometry(0.3, 0.55, 6, 16), white, 0, 0.78, 0);                   // 몸
  add(new THREE.CircleGeometry(0.12, 20), glow, 0, 0.9, 0.305);                           // 가슴 불빛
  const armGeo = () => new THREE.CapsuleGeometry(0.07, 0.4, 4, 8).translate(0, -0.24, 0);
  const armL = add(armGeo(), white, -0.4, 1.08, 0);
  const armR = add(armGeo(), white, 0.4, 1.08, 0);
  const head = add(new THREE.BoxGeometry(0.5, 0.36, 0.4), white, 0, 1.45, 0);
  add(new THREE.BoxGeometry(0.4, 0.14, 0.02), glow, 0, 1.47, 0.205);                    // 눈(바이저)
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), dark, 0, 1.74, 0);
  add(new THREE.SphereGeometry(0.05, 10, 8), glow, 0, 1.86, 0);                           // 안테나
  // 요정 날개: 등 뒤 반투명 날개 두 쌍 (어깨를 축으로 파닥임)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.25, 0.35, 0.75, 0.45, 0.8, 0.2); wingShape.bezierCurveTo(0.7, -0.05, 0.3, -0.1, 0, 0);
  const lowShape = new THREE.Shape();
  lowShape.moveTo(0, 0); lowShape.bezierCurveTo(0.2, -0.05, 0.55, -0.15, 0.5, -0.38); lowShape.bezierCurveTo(0.3, -0.4, 0.1, -0.2, 0, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.12 * s, 1.12, -0.24);
    const up = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wingMat), lo = new THREE.Mesh(new THREE.ShapeGeometry(lowShape), wingMat);
    if (s < 0) { up.scale.x = -1; lo.scale.x = -1; }
    w.add(up, lo); g.add(w); w.userData.side = s; wings.push(w);
  }
  return { g, armR, armL, head: 2.1, wings, flame };
}
function marker(color) { // 머리 위 떠 있는 말풍선 표시
  const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
  return mk;
}

/* ---------- NPC 배치 ---------- */
// 건물 윤곽 바깥 3 m, 길에 가장 가까운 변 앞에 세운다. 점 건물(정문 등)은 둘레의 빈 곳.
function placeFor(o, { inSolid, inBounds, roadSegs, taken }) {
  const cands = [];
  if (o.ring && !o.point) {
    const ring = o.ring.length > 2 && o.ring[0][0] === o.ring[o.ring.length - 1][0] && o.ring[0][1] === o.ring[o.ring.length - 1][1] ? o.ring.slice(0, -1) : o.ring;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 4) continue;
      let nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      for (const t of L > 30 ? [0.5, 0.3, 0.7] : [0.5]) for (const off of [3, 4.5, 6.5])
        cands.push({ x: p[0] + (q[0] - p[0]) * t + nx * off, z: p[1] + (q[1] - p[1]) * t + nz * off, fx: nx, fz: nz, bias: t === 0.5 ? 0 : 4, off });
    }
  } else {
    const c = o.center;
    for (const r of [4, 6, 9, 13]) for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      cands.push({ x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r, fx: Math.cos(ang), fz: Math.sin(ang), bias: r, off: 3 });
    }
  }
  let best = null, bs = Infinity;
  for (const k of cands) {
    if (!inBounds(k.x, k.z, 0) || inSolid(k.x, k.z, 1.2)) continue;
    if (taken.some((t) => Math.hypot(t.x - k.x, t.z - k.z) < 3)) continue;
    let rd = Infinity;
    for (const [x1, z1, x2, z2] of roadSegs) rd = Math.min(rd, segDist(k.x, k.z, x1, z1, x2, z2));
    const s = rd + k.bias + (k.off - 3) * 1.5;
    if (s < bs) { bs = s; best = k; }
  }
  return best;
}

export function initNPCs({ scene, camera, container, byId, bInfo, roadSegs, inSolid, inBounds, me, getMode, onOpenChat, onTarget }) {
  if (!document.getElementById("npc-css")) { const st = document.createElement("style"); st.id = "npc-css"; st.textContent = CSS; document.head.appendChild(st); }
  const layer = document.createElement("div"); layer.className = "npc-layer"; container.appendChild(layer);
  const prompt = document.createElement("button"); prompt.className = "npc-prompt"; prompt.hidden = true; container.appendChild(prompt);
  const chat = document.createElement("div"); chat.className = "npc-chat"; chat.hidden = true;
  chat.innerHTML = `<header>🧚 <span>AI 요정 안내원</span><button type="button" data-x>닫기 (Esc)</button></header>
    <div class="npc-log"></div>
    <div class="npc-tip">예: 오늘 학식 어디서 먹어? · 도서관 가는 길 · 다음 버스 언제 와?</div>
    <form><input type="text" placeholder="AI 요정에게 물어보기 (Enter · 닫기 Esc)" autocomplete="off" maxlength="300"><button>보내기</button></form>`;
  container.appendChild(chat);
  const log = chat.querySelector(".npc-log"), input = chat.querySelector("input"), sendBtn = chat.querySelector("form button");
  for (const ev of ["keydown", "keyup", "keypress"]) chat.addEventListener(ev, (e) => e.stopPropagation()); // 입력 중 걷기 키가 먹지 않게

  /* ---------- 길안내 화살표 (AI 안내원이 위치를 알려 주면 캐릭터 앞에 뜸, G키로 끄고 켜기) ---------- */
  const guide = { id: null, name: "", on: true, arrived: 0 };
  const arrow = new THREE.Group();
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.9, roughness: 0.4, depthTest: false, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12).rotateX(Math.PI / 2).translate(0, 0, -0.05), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 16).rotateX(Math.PI / 2).translate(0, 0, 0.36), mat);
    for (const m of [shaft, head]) { m.renderOrder = 999; arrow.add(m); }
    arrow.visible = false;
    scene.add(arrow);
  }
  const chip = document.createElement("div"); chip.className = "npc-guide"; chip.hidden = true; container.appendChild(chip);
  chip.addEventListener("click", (e) => { e.stopPropagation(); const a = e.target.closest("[data-g]")?.dataset.g; if (a === "toggle") toggleArrow(); else if (a === "clear") clearGuide(); });
  function setGuide(id) {
    const b = bInfo.get(id), o = byId.get(id);
    if (!b || !o) return false;
    guide.id = id; guide.name = b.name; guide.on = true; guide.arrived = 0;
    onTarget?.(id);
    return true;
  }
  function clearGuide() { guide.id = null; arrow.visible = false; chip.hidden = true; }
  function toggleArrow() { if (!guide.id) return false; guide.on = !guide.on; return true; }
  const distTo = (id) => { const c = byId.get(id)?.center; return c ? Math.hypot(c.x - me.x, c.z - me.z) : Infinity; };

  // 질문/장소 이름 → 건물. 같은 점수면 플레이어와 가까운 곳 (예: "프린터" → 가까운 건물)
  function resolveAll(q) {
    const t = String(q || "").replace(/\s+/g, "");
    const out = [];
    for (const b of bInfo.values()) {
      if (!byId.has(b.id)) continue;
      const words = [b.name, b.name.replace(/^제/, ""), b.no, ...(b.aliases || []), ...(b.keywords || []), ...(b.facilities || []), ...(b.inside || []).flatMap((r) => r.items)]
        .filter(Boolean).map((w) => String(w).replace(/\s+|\(.*?\)/g, ""));
      const s = words.reduce((a, w) => a + (w.length >= 2 && t.includes(w) ? w.length : 0), 0) + (t.includes(b.name.replace(/\s+/g, "")) ? 5 : 0);
      if (s > 0) out.push({ b, s, d: distTo(b.id) });
    }
    return out.sort((a, b) => b.s - a.s || a.d - b.d);
  }
  const resolve = (q) => resolveAll(q)[0]?.b || null;
  const isWhere = (q) => /어디|위치|가는\s*길|어떻게\s*가|길\s*(알려|안내)|찾아|데려|가려면|where|how\s*to\s*get/i.test(q);

  // 지도 대신 3D 화살표로 안내하는 도구 (find_place · navigate 를 대신 실행)
  const LOCAL = {
    find_place({ query }) {
      if (/화장실|toilet|restroom/i.test(query || "")) return { places: [], note: "화장실 위치 데이터는 아직 없어요. 가까운 큰 건물 1층을 이용하세요." };
      const hits = resolveAll(query).slice(0, 3);
      if (!hits.length) return { places: [], note: "일치하는 장소가 없어요" };
      setGuide(hits[0].b.id);
      return {
        places: hits.map(({ b, d }) => ({ building: b.name, floors: b.floorsText || "", inside: (b.inside || []).map((r) => `${r.label}: ${r.items.join(", ")}`), straightDistanceM: Math.round(d / 10) * 10 })),
        guide: `3D 화면에서 사용자 캐릭터 앞에 '${hits[0].b.name}' 쪽을 가리키는 화살표를 띄웠다(G키로 끄고 켬). 지도는 열지 않았다.`,
      };
    },
    navigate({ destination, room }) {
      const b = resolve(`${destination || ""}`);
      if (!b) return { error: "어느 건물인지 모르겠어요. 건물 이름을 알려 주세요." };
      setGuide(b.id);
      const d = distTo(b.id);
      return {
        to: b.name + (room ? ` ${room}호` : ""), from: `3D 캠퍼스의 현재 위치(${nearestName()} 근처)`, straightDistanceM: Math.round(d / 10) * 10,
        walkMinutesApprox: Math.max(1, Math.round((d * 1.3) / 75)), floors: b.floorsText || "",
        guide: "3D 화면에서 사용자 캐릭터 앞에 목적지 방향 화살표를 띄웠다. 화살표를 따라 걸으면 되고 G키로 끄고 켤 수 있다. 지도는 열지 않았다.",
      };
    },
  };

  const npcs = [];
  let fairy = null;               // 사용자를 따라다니는 AI 요정 로봇 (원래 제5공학관 앞)
  const F = { arrived: false, greeted: false, wasWalk: false };
  // 반짝이 꼬리
  const SPARK_N = 40, sparkPos = new Float32Array(SPARK_N * 3).fill(-999), sparkAge = new Float32Array(SPARK_N).fill(9);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: dotTex(), color: 0x67e8f9, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; scene.add(sparks);
  let sparkI = 0, sparkT = 0;
  function dotTex() { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "#fff"); gr.addColorStop(0.4, "rgba(255,255,255,.7)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); }
  const group = new THREE.Group(); group.name = "npcs"; scene.add(group);
  let DATA = {};
  const ready = fetch("data/npc.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((j) => (DATA = j.npcs || {})).catch(() => {}).then(build);

  function build() {
    const taken = [];
    for (const [id, o] of byId) {
      const b = bInfo.get(id), d = DATA[id];
      if (!b || !d?.lines?.length) continue;
      const spot = placeFor(o, { inSolid, inBounds, roadSegs, taken });
      if (!spot) continue;
      taken.push(spot);
      const ai = !!d.ai || id === AI_ID;
      const body = ai ? robot() : person(SHIRT[b.category] ?? 0x2563eb);
      const mk = marker(ai ? 0x22d3ee : 0xfacc15);
      mk.position.y = body.head + 0.35;
      body.g.add(mk);
      body.g.position.set(spot.x, ai ? 1.6 : 0, spot.z);
      body.g.rotation.y = Math.atan2(spot.fx, spot.fz);   // 길 쪽을 바라봄
      if (ai) { body.g.scale.setScalar(0.42); mk.visible = false; }
      group.add(body.g);
      const bubble = document.createElement("div"); bubble.className = "npc-bubble" + (ai ? " ai" : ""); bubble.hidden = true; layer.appendChild(bubble);
      const n = { id, name: d.name || `${b.name} 안내원`, building: b.name, lines: d.lines, ai, ...body, mk, bubble, baseYaw: body.g.rotation.y, last: -1, until: 0, wave: 0, phase: Math.random() * 6, home: { x: spot.x, z: spot.z } };
      npcs.push(n);
      if (ai) fairy = n;
    }
  }

  /* ---------- 대화 ---------- */
  let near = null;
  function say(n, text, ms = BUBBLE_MS) {
    n.bubble.innerHTML = `<b class="who">${esc(n.name)}</b>${esc(text)}`;
    n.bubble.hidden = false;
    n.until = performance.now() + ms;
    n.wave = 1.2;
  }
  function nextLine(n) {
    let i = n.last < 0 ? 0 : Math.floor(Math.random() * n.lines.length);
    if (n.lines.length > 1 && i === n.last) i = (i + 1 + Math.floor(Math.random() * (n.lines.length - 1))) % n.lines.length;
    n.last = i;
    return n.lines[i];
  }
  function interact() {
    if (getMode() !== "walk") return false;
    if (!chat.hidden) { closeChat(); return true; }
    if (!near) return false;
    say(near, nextLine(near));
    return true;
  }

  /* ---------- AI 에이전트 채팅 (제5공학관) ---------- */
  let chatNpc = null, busy = false, convo = [];
  function addMsg(cls, html) { const d = document.createElement("div"); d.className = "npc-msg " + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function openChat(n) {
    chatNpc = n;
    chat.hidden = false;
    onOpenChat?.();
    if (!log.children.length) { addMsg("bot", md(n.lines[0])); say(n, n.lines[0]); }
    else say(n, nextLine(n));
    setTimeout(() => input.focus(), 30);
  }
  function closeChat() { chat.hidden = true; input.blur(); }
  chat.querySelector("[data-x]").addEventListener("click", closeChat);
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeChat(); } });
  chat.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  const nearestName = () => { let best = null, bd = Infinity; for (const [id, o] of byId) { const d = Math.hypot(o.center.x - me.x, o.center.z - me.z); if (d < bd && bInfo.get(id)) { bd = d; best = bInfo.get(id).name; } } return best || "캠퍼스"; };
  const now = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  async function callAgent() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch("api/agent", {
        signal: ctl.signal, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: convo, profile: { now: now(), role: localStorage.getItem("cg_role")?.replace(/"/g, "") || "재학생", location: `3D 캠퍼스 걷기 모드 · 지금 ${nearestName()} 근처 (사용자 옆을 따라다니는 AI 요정 로봇과 대화 중)` } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      return j;
    } finally { clearTimeout(t); }
  }
  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; input.value = "";
    addMsg("me", esc(text));
    const wait = addMsg("bot wait", "생각하는 중…");
    const tools = [];
    const mark = convo.length;
    const first = !convo.length;
    convo.push({ role: "user", parts: [{ text: (first ? "[상황: 너는 3D 캠퍼스에서 사용자 옆을 날아다니며 따라다니는 작은 요정 로봇 AI 안내원이다. 사용자가 T키로 너를 불렀다. 안내원답게 친근하게, 보통 1~4줄로 짧게 답해라. 위치·길 질문은 find_place나 navigate를 쓰면 3D 화면에 방향 화살표가 뜬다. 그때는 \"지도\" 대신 \"화살표를 따라가세요(G키로 끄고 켜기)\"라고 안내해라.]\n" : "") + text }] });
    // 오래된 대화는 사용자 질문 경계에서 자름
    const starts = convo.map((c, i) => (c.role === "user" && c.parts.some((p) => p.text) ? i : -1)).filter((i) => i >= 0);
    if (starts.length > 8) convo = convo.slice(starts[starts.length - 8]);
    let answer = "";
    try {
      for (let step = 0; step < 6; step++) {
        const j = await callAgent();
        const content = { role: "model", parts: j.content.parts };
        convo.push(content);
        const calls = content.parts.filter((p) => p.functionCall);
        const said = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
        if (!calls.length) { answer = said; break; }
        const responses = [];
        for (const p of calls) {
          const { name, args } = p.functionCall;
          tools.push(TOOL_LABEL[name] || "🔧 " + name);
          wait.innerHTML = `<span class="tool">${esc(tools.join(" · "))}</span>생각하는 중…`;
          let result;
          try { result = LOCAL[name] ? LOCAL[name](args || {}) : aiTools?.[name] ? await aiTools[name](args || {}) : { error: "없는 도구" }; } catch (e) { result = { error: String(e.message || e) }; }
          responses.push({ functionResponse: { name, response: { result } } });
        }
        convo.push({ role: "user", parts: responses });
      }
      if (!answer) answer = guide.id ? `${guide.name} 쪽으로 화살표를 띄웠어요. 따라가 보세요!` : "필요한 정보를 찾아봤어요.";
    } catch (e) {
      convo = convo.slice(0, mark);
      answer = localAnswer(text);
      convo.push({ role: "user", parts: [{ text }] }, { role: "model", parts: [{ text: answer }] });
    }
    answer = answer.replace(/\[\[[^\]]*\]\]/g, "").trim();
    if (isWhere(text) && !tools.some((x) => /장소|길/.test(x))) {
      const b = resolve(text) || resolve(answer);
      if (b && setGuide(b.id) && !answer.includes("화살표")) answer += `\n\n🧭 ${b.name} 쪽으로 화살표를 띄웠어요. 따라가세요! (G키로 끄고 켜기)`;
    }
    wait.className = "npc-msg bot";
    wait.innerHTML = (tools.length ? `<span class="tool">${esc(tools.join(" · "))}</span>` : "") + md(answer);
    log.scrollTop = log.scrollHeight;
    if (chatNpc) { const p = plain(answer); say(chatNpc, p.length > 90 ? p.slice(0, 88) + "…" : p, 9000); }
    busy = false; sendBtn.disabled = false;
    if (!chat.hidden) input.focus();
  }
  // AI 서버가 안 될 때: 건물 데이터·NPC 대사에서 찾아 답한다
  function localAnswer(q) {
    const t = q.replace(/\s+/g, "");
    let hit = null, score = 0;
    for (const b of bInfo.values()) {
      const words = [b.name, b.name.replace(/^제/, ""), b.no, ...(b.aliases || []), ...(b.keywords || []), ...(b.facilities || [])].filter(Boolean).map((w) => String(w).replace(/\s+/g, ""));
      const s = words.reduce((a, w) => a + (w.length >= 2 && t.includes(w) ? w.length : 0), 0);
      if (s > score) { score = s; hit = b; }
    }
    if (hit) {
      const lines = DATA[hit.id]?.lines || [];
      if (isWhere(q) && setGuide(hit.id)) return `(지금은 AI 서버에 연결되지 않아 기본 안내로 답해요)\n**${hit.name}** 쪽으로 화살표를 띄웠어요. 따라가세요! (G키로 끄고 켜기)\n직선거리 약 ${Math.round(distTo(hit.id) / 10) * 10}m${hit.floorsText ? ` · ${hit.floorsText}` : ""}`;
      const inside = (hit.inside || []).map((x) => `· ${x.label}: ${x.items.join(", ")}`).join("\n");
      return `(지금은 AI 서버에 연결되지 않아 기본 안내로 답해요)\n**${hit.name}**${hit.floorsText ? ` · ${hit.floorsText}` : ""}\n${inside || lines.slice(0, 2).join("\n")}`;
    }
    return "지금은 AI 서버에 연결되지 않아요. 건물 이름이나 '학식', '프린터', '편의점'처럼 찾는 곳을 물어보면 건물 정보로 알려 드릴게요.";
  }

  /* ---------- 매 프레임 ---------- */
  const v = new THREE.Vector3();
  function update(dt, t) {
    const walk = getMode() === "walk";
    let best = null, bd = TALK_R;
    for (const n of npcs) {
      const dx = me.x - n.g.position.x, dz = me.z - n.g.position.z, d = Math.hypot(dx, dz);
      n.dist = d;
      // 요정(AI)은 updateFairy 에서 따로 움직이고 T키로 대화
      if (!n.ai && walk && d < bd && Math.abs(me.feet) < 3) { bd = d; best = n; }
      if (!n.ai) {
        // 가까우면 플레이어를 바라봄
        const want = walk && d < 14 ? Math.atan2(dx, dz) : n.baseYaw;
        let diff = want - n.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.g.rotation.y += diff * Math.min(1, dt * 5);
        n.mk.position.y = n.head + 0.35 + Math.sin(t / 400 + n.phase) * 0.08;
        n.mk.rotation.y += dt * 2;
        n.mk.visible = !(n.bubble && !n.bubble.hidden);
        // 손 흔들기
        if (n.wave > 0) { n.wave -= dt; n.armR.rotation.z = 2.5 + Math.sin(t / 90) * 0.35; } else n.armR.rotation.z = Math.sin(t / 900 + n.phase) * 0.05;
      }
      // 말풍선 위치
      if (!n.bubble.hidden) {
        if (t > n.until || !walk || d > 14) { n.bubble.hidden = true; continue; }
        v.set(n.g.position.x, n.g.position.y + n.head * n.g.scale.y + 0.15, n.g.position.z).project(camera);
        if (v.z > 1) { n.bubble.style.display = "none"; continue; }
        n.bubble.style.display = "";
        const w = container.clientWidth, h = container.clientHeight;
        n.bubble.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`;
      }
    }
    if (best !== near) {
      near = best;
      if (near) prompt.innerHTML = `<kbd>E</kbd>${esc(near.name)}${near.ai ? "와 채팅하기" : "에게 말 걸기"}`;
    }
    prompt.hidden = !near || !walk || !chat.hidden;
    if (fairy) updateFairy(dt, t, walk);
    aiBtn.hidden = !walk || !fairy;
    // 길안내 화살표: 카메라 앞 아래쪽에 떠서 목적지를 가리킴
    if (guide.id) {
      const c = byId.get(guide.id).center, o = byId.get(guide.id);
      const dx = c.x - me.x, dz = c.z - me.z, d = Math.hypot(dx, dz);
      const reach = (o.point ? 6 : o.radius * 0.6) + 8;
      if (d < reach && !guide.arrived) { guide.arrived = t; }
      if (guide.arrived && t - guide.arrived > 4000) { clearGuide(); }
      else {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        arrow.position.copy(camera.position).addScaledVector(fwd, 3.0); arrow.position.y = camera.position.y - 0.6 + Math.sin(t / 250) * 0.04;
        arrow.rotation.set(0.3, Math.atan2(dx, dz), 0, "YXZ"); // 살짝 아래로 기울여 위에서 보이게
        arrow.visible = walk && guide.on && !guide.arrived;
        chip.hidden = !walk;
        chip.classList.toggle("off", !guide.on);
        const m = Math.round(d / 5) * 5;
        const html = guide.arrived ? `🎉 ${esc(guide.name)} 도착!`
          : `🧭 ${esc(guide.name)} · ${m}m <button data-g="toggle"><kbd>G</kbd>화살표 ${guide.on ? "끄기" : "켜기"}</button><button data-g="clear" aria-label="길안내 끝내기">✕</button>`;
        if (html !== chip._html) { chip.innerHTML = html; chip._html = html; } // 바뀔 때만 다시 그림(버튼 클릭이 끊기지 않게)
      }
    }
    if (!chat.hidden && !walk) closeChat();
  }
  prompt.addEventListener("click", (e) => { e.stopPropagation(); interact(); });

  /* ---------- AI 요정: 사용자 옆을 날아다니며 따라옴 ---------- */
  const aiBtn = document.createElement("button"); aiBtn.className = "npc-ai-btn"; aiBtn.hidden = true;
  aiBtn.innerHTML = "🤖 AI 요정 <kbd>T</kbd>"; container.appendChild(aiBtn);
  aiBtn.addEventListener("click", (e) => { e.stopPropagation(); talkAI(); });
  const fw = new THREE.Vector3(), goal = new THREE.Vector3(), tmp = new THREE.Vector3();
  function updateFairy(dt, t, walk) {
    const g = fairy.g, bob = Math.sin(t / 380) * 0.12;
    if (walk && !F.wasWalk) { F.arrived = false; }           // 걷기 시작 → 날아오기
    F.wasWalk = walk;
    if (walk) {
      camera.getWorldDirection(fw); fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
      const rx = -fw.z, rz = fw.x;                          // 오른쪽
      goal.set(camera.position.x + fw.x * 2.4 + rx * 0.95, camera.position.y - 0.5 + bob, camera.position.z + fw.z * 2.4 + rz * 0.95);
    } else {
      goal.set(fairy.home.x, 1.6 + bob, fairy.home.z);       // 둘러보기 중엔 5공 앞에서 대기
    }
    tmp.subVectors(goal, g.position);
    const d = tmp.length();
    const flying = d > 3;
    if (flying) {
      // 멀면 포물선을 그리며 빠르게 날아옴
      const sp = Math.min(70, Math.max(9, d * 1.6)) * dt;
      tmp.normalize().multiplyScalar(Math.min(sp, d));
      g.position.add(tmp);
      g.position.y = Math.max(g.position.y, goal.y + Math.min(6, d * 0.12));
      g.rotation.y += Math.atan2(Math.sin(Math.atan2(tmp.x, tmp.z) - g.rotation.y), Math.cos(Math.atan2(tmp.x, tmp.z) - g.rotation.y)) * Math.min(1, dt * 6);
      g.rotation.x = 0.35;                                   // 앞으로 기울여 날기
    } else {
      g.position.lerp(goal, 1 - Math.exp(-dt * 5));
      // 사용자(카메라)를 바라봄
      const want = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      g.rotation.y += Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)) * Math.min(1, dt * 5);
      g.rotation.x *= 1 - Math.min(1, dt * 4);
      if (walk && !F.arrived) {
        F.arrived = true;
        if (!F.greeted) { F.greeted = true; say(fairy, "같이 다닐게요! 궁금한 게 생기면 T키를 눌러 저를 불러 주세요.", 6000); }
      }
    }
    if (fairy.wave > 0) { fairy.wave -= dt; fairy.armR.rotation.z = 2.5 + Math.sin(t / 90) * 0.35; } else fairy.armR.rotation.z = 0.25 + Math.sin(t / 300) * 0.12;
    fairy.armL.rotation.z = -0.25 - Math.sin(t / 300) * 0.12;
    // 날개 파닥임 · 불꽃
    const flap = Math.sin(t / (flying ? 45 : 90)) * (flying ? 0.75 : 0.45);
    for (const w of fairy.wings) w.rotation.y = w.userData.side * (0.5 + flap);
    fairy.flame.scale.set(1, flying ? 1.4 + Math.random() * 0.4 : 0.6 + Math.random() * 0.2, 1);
    // 반짝이: 날거나 움직일 때 뒤에 흩뿌림
    sparkT -= dt;
    if (sparkT <= 0) {
      sparkT = flying ? 0.02 : 0.12;
      const i = sparkI++ % SPARK_N;
      sparkPos[i * 3] = g.position.x + (Math.random() - 0.5) * 0.3; sparkPos[i * 3 + 1] = g.position.y + 0.1; sparkPos[i * 3 + 2] = g.position.z + (Math.random() - 0.5) * 0.3;
      sparkAge[i] = 0;
    }
    for (let i = 0; i < SPARK_N; i++) {
      sparkAge[i] += dt;
      if (sparkAge[i] > 0.9) sparkPos[i * 3 + 1] = -999; else sparkPos[i * 3 + 1] -= dt * 0.4;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }
  function talkAI() {
    if (getMode() !== "walk" || !fairy) return false;
    if (!chat.hidden) { closeChat(); return true; }
    openChat(fairy);
    return true;
  }

  return { update, interact, talkAI, ready, get chatOpen() { return !chat.hidden; }, closeChat, list: npcs, send, toggleArrow, clearGuide, setGuide, get guide() { return guide; } };
}
