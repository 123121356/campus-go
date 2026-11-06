// 3D 걷기 모드 NPC — 캠퍼스를 자유롭게 돌아다니는 학생 30명 + 사용자를 따라다니는 AI 요정 1명.
// 학생들은 서로 가까워지면 멈춰서 '요즘 화제'(밈·유행·경제·뉴스·자격증 등 data/trends.json)를 주고받고, 혼자 있을 땐 혼잣말을 한다.
// 가까이 가서 E키(모바일은 '듣기' 버튼)를 누르면 그 학생이 들은 소식을 사용자에게 알려 준다.
// AI 요정(n120)은 T키로 채팅창을 열어 앱 에이전트(api/agent)와 같은 도구로 실제 데이터를 확인해 답한다. 서버가 안 되면 건물 데이터로 답한다.
import * as THREE from "three";
import { aiTools } from "./ai.js?v=41";

const TALK_R = 6;       // 이 거리 안에서 E키로 들을 수 있음
const BUBBLE_MS = 7000; // 말풍선 표시 시간
const AI_ID = "n120";
const NPC_COUNT = 30;

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
  get_trends: "📰 요즘 화제 확인", messenger_link: "🔗 메신저 연결 확인", send_message: "📨 메신저로 보내는 중", subscribe: "⏰ 알림 등록", my_subscriptions: "📋 알림 목록",
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
const PALETTE = [0x2563eb, 0x7c3aed, 0x16a34a, 0xf97316, 0x0891b2, 0xdb2777, 0xca8a04, 0x4f46e5, 0x059669, 0xdc2626, 0x0ea5e9, 0x9333ea];
const ROLES = ["재학생", "복학생", "새내기", "선배", "후배", "조교", "동아리원", "교환학생", "휴학 복학생", "졸업반", "신입생", "대학원생", "08학번 선배", "기숙사생"];
const DEBATE_ROLES = ["AI 스터디원", "대학원생(AI)", "논문 읽는 선배", "AI 동아리원", "캡스톤 팀원"];
const DEBATER_RATE = 0.2;   // NPC의 최대 20%만 AI 토론을 함
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
function marker(color) { // 머리 위 떠 있는 표시
  const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
  return mk;
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

  // 시설(ATM·프린터·편의점·택배 등) 카테고리 검색. app.js 의 FACILITY 와 같게 유지.
  // ATM·프린터 등은 여러 건물에 흩어져 있으므로, 한 건물로 단정하지 말고 있는 곳을 모두 돌려준다.
  const FACILITY = [
    { re: /atm|현금|돈\s*뽑|출금|은행/i, label: "ATM", match: /ATM|농협|국민|신한/ },
    { re: /프린트|프린터|인쇄|출력|복사/i, label: "프린터·복사", match: /프린터|복사실|인쇄/ },
    { re: /편의점|매점|cu|간식/i, label: "편의점", match: /편의점|CU|자판기/ },
    { re: /밥|식당|학식|먹|점심|저녁|푸드/i, label: "식당", match: /식당|푸드코트/ },
    { re: /카페|커피/i, label: "카페", match: /카페/ },
    { re: /헬스|운동|체력/i, label: "운동", match: /헬스장|실내 트랙|실내 코트|체력/ },
    { re: /세탁|빨래/i, label: "세탁실", match: /세탁실/ },
    { re: /열람실|공부|스터디/i, label: "공부할 곳", match: /열람실|스터디/ },
    { re: /택배|우체국|우편|소포/i, label: "우편·택배", match: /우편|우체국|택배/ },
    { re: /기숙사|생활관|긱사/i, label: "기숙사", match: /기숙사/ },
    { re: /행정|증명서|학적|장학/i, label: "행정", match: /행정/ },
  ];
  function facilityHits(q) {
    const f = FACILITY.find((x) => x.re.test(String(q || "")));
    if (!f) return null;
    const hits = [];
    for (const b of bInfo.values()) {
      if (!byId.has(b.id)) continue;
      const rows = (b.inside || []).filter((r) => (r.items || []).some((it) => f.match.test(it)));
      const items = rows.flatMap((r) => r.items.filter((it) => f.match.test(it)));
      if (rows.length) hits.push({ b, d: distTo(b.id), items });
    }
    hits.sort((a, b) => a.d - b.d);
    return { label: f.label, hits };
  }

  // 지도 대신 3D 화살표로 안내하는 도구 (find_place · navigate 를 대신 실행)
  const LOCAL = {
    find_place({ query }) {
      if (/화장실|toilet|restroom/i.test(query || "")) return { places: [], note: "화장실 위치 데이터는 아직 없어요. 가까운 큰 건물 1층을 이용하세요." };
      const fq = facilityHits(query);
      if (fq) {
        if (!fq.hits.length) return { facility: fq.label, places: [], note: `${fq.label} 위치는 확인된 데이터가 없어요. 가까운 큰 건물에서 확인하거나 학생지원과에 문의해 보세요.` };
        setGuide(fq.hits[0].b.id);
        return {
          facility: fq.label,
          places: fq.hits.map(({ b, d, items }) => ({ building: b.name, items: items.join(", "), straightDistanceM: Math.round(d / 10) * 10 })),
          guide: `${fq.label}은(는) ${fq.hits.map((h) => h.b.name).join(", ")}에 있다(여러 곳이면 모두 알려 줄 것). 가장 가까운 '${fq.hits[0].b.name}' 쪽으로 화살표를 띄웠다(G키로 끄고 켬). 지도는 열지 않았다.`,
        };
      }
      const hits = resolveAll(query).slice(0, 3);
      if (!hits.length) return { places: [], note: "일치하는 장소가 없어요" };
      setGuide(hits[0].b.id);
      return {
        places: hits.map(({ b, d }) => ({ building: b.name, floors: b.floorsText || "", inside: (b.inside || []).map((r) => `${r.label}: ${r.items.join(", ")}`), straightDistanceM: Math.round(d / 10) * 10 })),
        guide: `3D 화면에서 사용자 캐릭터 앞에 '${hits[0].b.name}' 쪽을 가리키는 화살표를 띄웠다(G키로 끄고 켬). 지도는 열지 않았다.`,
      };
    },
    navigate({ destination, room }) {
      const fq = facilityHits(destination || "");
      if (fq && fq.hits.length) {   // 시설을 목적지로 물으면 가까운 곳으로 안내하되 전부 알려 줌
        setGuide(fq.hits[0].b.id);
        const h = fq.hits[0];
        return {
          to: `${fq.label} (${fq.hits.map((x) => x.b.name).join(", ")} 중 가까운 ${h.b.name})`,
          straightDistanceM: Math.round(h.d / 10) * 10, walkMinutesApprox: Math.max(1, Math.round((h.d * 1.3) / 75)),
          guide: `${fq.label}은(는) ${fq.hits.map((x) => x.b.name).join(", ")}에 있다. 가장 가까운 ${h.b.name} 쪽으로 화살표를 띄웠다. 지도는 열지 않았다.`,
        };
      }
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
  const conversations = [];
  let fairy = null;               // 사용자를 따라다니는 AI 요정 로봇
  let bbox = null;
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

  /* ---------- 들려줄 내용: 요즘 화제(data/trends.json) + 기본 상식 ---------- */
  const SRC = { dc: "커뮤니티", google: "구글 트렌드", youtube: "유튜브", naver: "네이버" };
  const CAT = { job: "💼 취업", trend: "📈 요즘", youtube: "🎬 유튜브", meme: "😆 밈", search: "🔎 검색", campus: "🏫 캠퍼스", economy: "💰 경제", news: "📰 뉴스", cert: "📜 자격증", ai: "🧠 AI 토론" };
  // trends.json 이 비어 있어도(아직 학습 전) NPC가 말할 수 있게 기본 화제를 둔다. 모두 무난한 상식성 정보.
  const FALLBACK = [
    { title: "자격증", category: "cert", summary: "토익·컴활 같은 자격증 준비 팁", sources: [], lines: ["토익 성적은 2년 지나면 만료돼서, 취업 시즌에 맞춰 보는 게 좋대.", "컴활은 필기 붙어야 실기 신청할 수 있어. 순서 헷갈리지 마.", "한국사능력검정은 공기업·공무원에서 자주 요구하더라."] },
    { title: "하반기 취업", category: "job", summary: "공채·인적성 준비", sources: [], lines: ["요즘 하반기 공채 자기소개서 마감이 몰려 있대.", "인적성이나 코딩테스트는 기출부터 푸는 게 제일 빠르대.", "현장실습이나 청년 일경험으로 경력 만드는 사람 많더라."] },
    { title: "경제", category: "economy", summary: "금리·지원금 등 생활 경제", sources: [], lines: ["금리 얘기 요즘 많던데, 학생도 통장 쪼개기부터 해보자.", "청년 대상 적금이나 지원금은 챙기면 은근 쏠쏠하대.", "환율 오를 땐 해외직구 좀 미루는 게 낫겠더라."] },
    { title: "요즘 유행", category: "meme", summary: "숏폼 밈·유행어", sources: [], lines: ["요즘 그 영상 다들 따라 하던데 봤어? ㅋㅋ", "숏폼 유행어가 너무 빨리 바뀌어서 따라가기 벅차.", "밈도 이제 하루이틀이면 식더라고."] },
    { title: "IT·뉴스", category: "news", summary: "AI·기술 뉴스 흐름", sources: [], lines: ["AI 관련 뉴스가 하루에도 몇 개씩 쏟아지네.", "새 기능 나오면 일단 한 번 써봐야 감이 오더라.", "기술 뉴스는 제목만 훑어도 흐름은 잡히더라고."] },
    { title: "캠퍼스 꿀팁", category: "campus", summary: "학사·생활 팁", sources: [], lines: ["계절학기 신청 기간 놓치면 한 학기 밀려, 알림 맞춰 둬.", "도서관 열람실은 시험기간엔 아침 일찍 가야 자리 있어.", "학식은 12시 조금 전에 가면 덜 붐벼."] },
    { title: "장학금", category: "campus", summary: "장학금 신청 팁", sources: [], lines: ["국가장학금 신청 기간은 학기마다 정해져 있으니 미리 확인해.", "교내 장학금은 성적·소득 조건이 공지에 적혀 있어.", "마감 하루 전엔 서류 다 준비해 두는 게 안전해."] },
  ];
  // AI 토론 전용 대본 (다자 관점, 중립적). trends.json 의 AI 관련 주제와 함께 토론 NPC가 사용.
  const FALLBACK_AI = [
    { title: "AI와 일자리", category: "ai", summary: "생성형 AI가 직무에 주는 영향", sources: [], lines: ["요즘 AI가 코드까지 짜던데, 개발자 일자리 줄어들까?", "난 생각이 좀 달라. 도구가 바뀐 거지 설계·검수는 사람이 해야 해.", "그래도 주니어 자리가 먼저 영향받는다는 기사도 봤어.", "대신 AI 잘 다루는 사람 수요는 는다잖아. 결국 역량 문제 아닐까?", "맞아, 우리도 툴 써보면서 적응하는 게 답인 듯."] },
    { title: "오픈소스 vs 상용 모델", category: "ai", summary: "오픈소스 모델과 상용 모델 비교", sources: [], lines: ["오픈소스 모델이 상용 모델 거의 따라잡았다던데.", "벤치마크는 그런데 실제 서비스 안정성은 아직 상용이 낫다는 얘기도 있어.", "연구·학습용으론 오픈소스가 접근성이 훨씬 좋지.", "논문이랑 가중치가 공개되니 재현해보기도 편하고."] },
    { title: "AI 논문 읽는 법", category: "ai", summary: "쏟아지는 AI 논문 따라잡기", sources: [], lines: ["AI 논문이 매일 쏟아지는데 다 읽는 건 불가능하더라.", "난 초록·그림·결론만 먼저 보고 거를 건 걸러.", "리뷰 글이나 요약 스레드로 흐름 잡는 것도 괜찮대.", "맞아, 깊게 볼 건 그다음에 원문 보면 되고."] },
    { title: "AI 신뢰성", category: "ai", summary: "생성형 AI의 사실성·검증", sources: [], lines: ["생성형 AI가 틀린 걸 그럴듯하게 말할 때가 있잖아.", "그래서 출처 확인이 중요하대. 그대로 믿으면 위험하지.", "과제에 쓸 때도 사실 검증은 직접 해야 한다더라.", "결국 보조로 쓰고 판단은 사람이 하는 게 맞는 듯."] },
    { title: "AI 공부 활용", category: "ai", summary: "학습에 AI를 쓰는 방법", sources: [], lines: ["AI를 공부에 어떻게 쓰면 좋을까?", "난 개념 설명이랑 예제 만들 때 써. 답을 베끼진 않고.", "그거 좋다. 틀린 설명도 있으니 교차 확인은 필수야.", "자료 요약이나 아이디어 브레인스토밍에도 쓸 만해."] },
  ];
  const AI_RE = /AI|인공지능|에이아이|LLM|GPT|챗봇|딥러닝|머신러닝|생성형|논문|오픈소스|chatgpt|gemini|모델/i;
  let CONTENT = [], AI_TOPICS = [], contentI = Math.floor(Math.random() * 7);
  function rebuildContent(trendTopics) {
    const ok = (trendTopics || []).filter((t) => t && Array.isArray(t.lines) && t.lines.length);
    CONTENT = [...ok, ...FALLBACK];
    const aiTrend = ok.filter((t) => t.lines.length >= 2 && AI_RE.test(`${t.title} ${t.summary || ""}`));
    AI_TOPICS = [...aiTrend, ...FALLBACK_AI];
  }
  rebuildContent([]);
  fetch("data/trends.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (j?.topics?.length && j.updatedAt && Date.now() - Date.parse(j.updatedAt) < 14 * 86400e3) rebuildContent(j.topics.filter((t) => !t.cooling));
  }).catch(() => {});
  const randomTopic = () => (CONTENT.length ? CONTENT[Math.floor(Math.random() * CONTENT.length)] : null);
  const nextTopic = () => (CONTENT.length ? CONTENT[contentI++ % CONTENT.length] : null);
  const catTag = (t) => CAT[t.category] || (t.sources && t.sources.length ? "🗞 " + SRC[t.sources[0]] : "📣");
  const srcLabel = (t) => (t.sources && t.sources.length ? t.sources.map((s) => SRC[s]).filter(Boolean).join("·") : (CAT[t.category] || "요즘 화제").replace(/^\S+\s/, ""));

  const ready = fetch("data/npc.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((j) => (DATA = j.npcs || {})).catch(() => {}).then(build);

  /* ---------- 배치·이동 도우미 ---------- */
  const roadDist = (x, z) => { let rd = Infinity; for (const [x1, z1, x2, z2] of roadSegs) rd = Math.min(rd, segDist(x, z, x1, z1, x2, z2)); return rd; };
  function validPos(x, z) {
    if (bbox && (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ)) return false;
    return inBounds(x, z, 0) && !inSolid(x, z, 0.8);
  }
  function sampleSpot() { // 캠퍼스 안, 길에 가까운 유효 지점
    for (let i = 0; i < 60; i++) {
      const x = bbox.minX + Math.random() * (bbox.maxX - bbox.minX);
      const z = bbox.minZ + Math.random() * (bbox.maxZ - bbox.minZ);
      if (validPos(x, z) && (i > 35 || roadDist(x, z) < 14)) return { x, z };
    }
    return null;
  }
  function pickTarget(pos) { // 현재 위치 둘레에서 걸어갈 다음 지점
    let any = null;
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2, dist = 8 + Math.random() * 34;
      const x = pos.x + Math.cos(ang) * dist, z = pos.z + Math.sin(ang) * dist;
      if (!validPos(x, z)) continue;
      any = { x, z };
      if (roadDist(x, z) < 12) return { x, z };   // 길 근처면 바로 채택
    }
    return any;
  }
  function faceToward(n, x, z, dt, rate) {
    const want = Math.atan2(x - n.g.position.x, z - n.g.position.z);
    let diff = want - n.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    n.g.rotation.y += diff * Math.min(1, dt * rate);
  }

  function build() {
    // 캠퍼스 범위(건물 중심으로 추정)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [, o] of byId) { const c = o.center; if (!c) continue; minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z); }
    if (!isFinite(minX)) { minX = minZ = -80; maxX = maxZ = 80; }
    bbox = { minX: minX - 12, maxX: maxX + 12, minZ: minZ - 12, maxZ: maxZ + 12 };

    // AI 요정 (사용자를 따라다님)
    const fc = byId.get(AI_ID)?.center || { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    const fb = robot();
    fb.g.position.set(fc.x, 1.6, fc.z); fb.g.scale.setScalar(0.42);
    group.add(fb.g);
    const fbub = document.createElement("div"); fbub.className = "npc-bubble ai"; fbub.hidden = true; layer.appendChild(fbub);
    fairy = { id: AI_ID, name: DATA[AI_ID]?.name || "AI 요정 안내원", ai: true, ...fb, bubble: fbub, phase: 0, wave: 0, until: 0, last: -1, dist: Infinity, lines: DATA[AI_ID]?.lines?.length ? DATA[AI_ID].lines : ["안녕하세요! 캠퍼스에서 궁금한 게 있으면 T키로 저를 불러 주세요."], home: { x: fc.x, z: fc.z } };
    npcs.push(fairy);

    // 자유롭게 돌아다니는 학생 NPC 30명
    const debaterCount = Math.max(1, Math.floor(NPC_COUNT * DEBATER_RATE)); // 최대 20%만 AI 토론
    for (let i = 0; i < NPC_COUNT; i++) {
      const spot = sampleSpot(); if (!spot) continue;
      const debater = i < debaterCount;
      const body = person(PALETTE[i % PALETTE.length]);
      body.g.position.set(spot.x, 0, spot.z);
      body.g.rotation.y = Math.random() * Math.PI * 2;
      group.add(body.g);
      const mk = marker(debater ? 0x22d3ee : 0xfacc15); mk.position.y = body.head + 0.3; mk.visible = false; body.g.add(mk);
      const bubble = document.createElement("div"); bubble.className = "npc-bubble"; bubble.hidden = true; layer.appendChild(bubble);
      npcs.push({
        id: `s${i}`, name: debater ? DEBATE_ROLES[i % DEBATE_ROLES.length] : ROLES[Math.floor(Math.random() * ROLES.length)],
        ai: false, debater, ...body, mk, bubble,
        phase: Math.random() * 6, speed: 1.0 + Math.random() * 0.7, target: null, inConvo: null,
        cooldownUntil: 0, soliloquyAt: performance.now() + 4000 + Math.random() * 16000, listenUntil: 0, targetRetryAt: 0,
        wave: 0, until: 0, last: -1, dist: Infinity,
      });
    }
  }

  /* ---------- 말풍선 ---------- */
  let near = null;
  function say(n, text, ms = BUBBLE_MS) {
    n.bubble.innerHTML = `<b class="who">${esc(n.name)}</b>${esc(text)}`;
    n.bubble.hidden = false;
    n.until = performance.now() + ms;
    n.wave = 1.0;
  }

  /* ---------- NPC끼리 대화 ---------- */
  function startConvo(a, b, canDebate) {
    let tp, debate = false;
    if (canDebate && AI_TOPICS.length && Math.random() < 0.75) { tp = AI_TOPICS[Math.floor(Math.random() * AI_TOPICS.length)]; debate = true; }
    else tp = randomTopic();
    if (!tp || !(tp.lines && tp.lines.length >= 2)) return;
    const queue = tp.lines.slice(0, debate ? 6 : 4).map((line, idx) => ({ who: idx % 2 ? b : a, text: (debate && idx === 0 ? "🧠 " : "") + line }));
    const c = { a, b, topic: tp, debate, queue, idx: 0, nextAt: performance.now() + 250 };
    a.inConvo = c; b.inConvo = c; a.target = null; b.target = null;
    conversations.push(c);
  }
  function endConvo(c) {
    const now = performance.now();
    c.a.inConvo = null; c.b.inConvo = null;
    c.a.cooldownUntil = now + 8000 + Math.random() * 9000;
    c.b.cooldownUntil = now + 8000 + Math.random() * 9000;
    c.a.soliloquyAt = c.b.soliloquyAt = now + 9000 + Math.random() * 12000;
    const i = conversations.indexOf(c); if (i >= 0) conversations.splice(i, 1);
  }

  function interact() {
    if (getMode() !== "walk") return false;
    if (!chat.hidden) { closeChat(); return true; }
    if (!near) return false;
    if (near.ai) { openChat(near); return true; }
    const tp = near.inConvo ? near.inConvo.topic : nextTopic();
    near.listenUntil = performance.now() + 5000;   // 잠깐 멈춰 사용자를 바라봄
    near.target = null;
    if (tp) {
      const body = near.inConvo ? (tp.summary || tp.lines[0]) : tp.lines[Math.floor(Math.random() * tp.lines.length)];
      say(near, `${catTag(tp)} ${body} (${srcLabel(tp)})`, 6500);
    } else say(near, "오늘은 딱히 들은 소식이 없네요.", 3000);
    return true;
  }

  /* ---------- AI 에이전트 채팅 (AI 요정) ---------- */
  let chatNpc = null, busy = false, convo = [];
  function addMsg(cls, html) { const d = document.createElement("div"); d.className = "npc-msg " + cls; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function openChat(n) {
    chatNpc = n;
    chat.hidden = false;
    onOpenChat?.();
    if (!log.children.length) { addMsg("bot", md(n.lines[0])); say(n, n.lines[0]); }
    else say(n, n.lines[0]);
    setTimeout(() => input.focus(), 30);
  }
  function closeChat() { chat.hidden = true; input.blur(); }
  chat.querySelector("[data-x]").addEventListener("click", closeChat);
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeChat(); } });
  chat.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  const nearestName = () => (nearbyBuildings(1)[0]?.name || "캠퍼스");
  // 지금 사용자(걷기 위치)에서 가까운 건물들 (실제 좌표 기준)
  function nearbyBuildings(k = 3) {
    const arr = [];
    for (const [id, o] of byId) { const b = bInfo.get(id); if (!b || !o.center) continue; arr.push({ name: b.name, d: Math.hypot(o.center.x - me.x, o.center.z - me.z) }); }
    return arr.sort((a, b) => a.d - b.d).slice(0, k);
  }
  function locationText() {
    const near = nearbyBuildings(3);
    if (!near.length) return "3D 캠퍼스 걷기 모드 (현재 위치 미상)";
    const extra = near.slice(1).map((x) => `${x.name} 약 ${Math.round(x.d)}m`).join(", ");
    return `3D 캠퍼스 걷기 모드. 사용자는 지금 '${near[0].name}' 근처(약 ${Math.round(near[0].d)}m)에 있다${extra ? `. 그다음 가까운 곳: ${extra}` : ""}. (옆을 따라다니는 AI 요정과 대화 중)`;
  }
  // "여기 어디야" 같은 현재 위치 질문 (특정 장소·시설을 묻는 게 아닐 때)
  const FAC_RE = /화장실|atm|프린터|복사|편의점|카페|식당|학식|열람실|도서관|기숙사|정문|후문|버스|정류장|체육|헬스|은행/i;
  const isCurrentLoc = (q) => /(여기|여긴|지금|현재|내)\s*(가|는|이|에|에서)?\s*(어디|위치)|내\s*위치|where\s*am\s*i/i.test(q) && !FAC_RE.test(q) && !resolve(q);
  function whereText() {
    const near = nearbyBuildings(3);
    if (!near.length) return "지금 캠퍼스 안에 있어요. 어디로 갈지 말해 주면 안내할게요!";
    const around = near.slice(1).map((x) => `${x.name}(약 ${Math.round(x.d)}m)`).join(", ");
    return `지금 **${near[0].name}** 근처예요 (약 ${Math.round(near[0].d)}m).${around ? `\n주변엔 ${around}가 있어요.` : ""}\n어디로 갈지 말해 주면 화살표로 안내할게요!`;
  }
  const now = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  async function callAgent() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch("api/agent", {
        signal: ctl.signal, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: convo, profile: { now: now(), role: localStorage.getItem("cg_role")?.replace(/"/g, "") || "재학생", location: locationText() } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      return j;
    } finally { clearTimeout(t); }
  }
  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    if (isCurrentLoc(text)) { input.value = ""; addMsg("me", esc(text)); const a = whereText(); addMsg("bot", md(a)); say(chatNpc || fairy, plain(a).slice(0, 90), 8000); return; }
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
  // AI 서버가 안 될 때: 건물 데이터·요즘 화제에서 찾아 답한다
  function localAnswer(q) {
    const t = q.replace(/\s+/g, "");
    let hit = null, score = 0;
    for (const b of bInfo.values()) {
      const words = [b.name, b.name.replace(/^제/, ""), b.no, ...(b.aliases || []), ...(b.keywords || []), ...(b.facilities || [])].filter(Boolean).map((w) => String(w).replace(/\s+/g, ""));
      const s = words.reduce((a, w) => a + (w.length >= 2 && t.includes(w) ? w.length : 0), 0);
      if (s > score) { score = s; hit = b; }
    }
    if (hit) {
      if (isWhere(q) && setGuide(hit.id)) return `(지금은 AI 서버에 연결되지 않아 기본 안내로 답해요)\n**${hit.name}** 쪽으로 화살표를 띄웠어요. 따라가세요! (G키로 끄고 켜기)\n직선거리 약 ${Math.round(distTo(hit.id) / 10) * 10}m${hit.floorsText ? ` · ${hit.floorsText}` : ""}`;
      const inside = (hit.inside || []).map((x) => `· ${x.label}: ${x.items.join(", ")}`).join("\n");
      return `(지금은 AI 서버에 연결되지 않아 기본 안내로 답해요)\n**${hit.name}**${hit.floorsText ? ` · ${hit.floorsText}` : ""}\n${inside || ""}`;
    }
    if (/요즘|화제|유행|밈|뉴스|경제|자격증|트렌드/.test(q)) {
      const tp = randomTopic();
      if (tp) return `(AI 서버 연결 전 기본 안내예요)\n${catTag(tp)} ${tp.summary || tp.lines[0]}\n· ${tp.lines.slice(0, 2).join("\n· ")}`;
    }
    return "지금은 AI 서버에 연결되지 않아요. 건물 이름이나 '학식', '프린터', '편의점'처럼 찾는 곳을 물어보면 건물 정보로 알려 드릴게요.";
  }

  /* ---------- 매 프레임 ---------- */
  const v = new THREE.Vector3();
  let pairScanAt = 0;
  function update(dt, t) {
    const walk = getMode() === "walk";

    // (1) 진행 중인 NPC끼리 대화: 차례대로 한 줄씩 말함
    for (const c of conversations.slice()) {
      if (t >= c.nextAt) {
        if (c.idx < c.queue.length) { const turn = c.queue[c.idx++]; say(turn.who, turn.text, 4200); c.nextAt = t + 4400; }
        else endConvo(c);
      }
    }

    let best = null, bd = TALK_R;
    for (const n of npcs) {
      const dx = me.x - n.g.position.x, dz = me.z - n.g.position.z, d = Math.hypot(dx, dz);
      n.dist = d;

      if (!n.ai) {
        if (walk && d < bd && Math.abs(me.feet) < 3) { bd = d; best = n; }
        let moved = false;
        if (n.inConvo) {
          const o = n.inConvo.a === n ? n.inConvo.b : n.inConvo.a;   // 대화 상대를 바라봄
          faceToward(n, o.g.position.x, o.g.position.z, dt, 6);
        } else if (walk && n.listenUntil > t) {
          faceToward(n, me.x, me.z, dt, 6);                          // 사용자에게 설명 중
        } else if (walk) {
          if (!n.target && t > (n.targetRetryAt || 0)) { n.target = pickTarget(n.g.position); if (!n.target) n.targetRetryAt = t + 900; }  // 배회
          if (n.target) {
            const tx = n.target.x - n.g.position.x, tz = n.target.z - n.g.position.z, td = Math.hypot(tx, tz);
            if (td < 1.3) n.target = null;
            else {
              const step = Math.min(td, n.speed * dt);
              const nx = n.g.position.x + tx / td * step, nz = n.g.position.z + tz / td * step;
              if (validPos(nx, nz)) { n.g.position.x = nx; n.g.position.z = nz; faceToward(n, n.target.x, n.target.z, dt, 7); moved = true; }
              else n.target = null;
            }
          }
        }
        // 팔 동작: 인사(wave) > 걷기 스윙 > 가만히
        if (n.wave > 0) { n.wave -= dt; n.armR.rotation.z = 2.3 + Math.sin(t / 90) * 0.35; n.armR.rotation.x = 0; n.armL.rotation.x = 0; }
        else { n.armR.rotation.z = 0; const sw = moved ? Math.sin(t / 150 + n.phase) * 0.5 : Math.sin(t / 800 + n.phase) * 0.05; n.armR.rotation.x = sw; n.armL.rotation.x = -sw; }
        // 머리 위 표시
        n.mk.position.y = n.head + 0.3 + Math.sin(t / 400 + n.phase) * 0.08; n.mk.rotation.y += dt * 1.5;
        n.mk.visible = n.bubble.hidden && d < 28;
        // 혼잣말: 가까이 있고 한가할 때 가끔
        if (walk && !n.inConvo && n.listenUntil <= t && n.bubble.hidden && t > n.soliloquyAt && d < 22 && CONTENT.length) {
          const tp = (n.debater && AI_TOPICS.length && Math.random() < 0.5) ? AI_TOPICS[Math.floor(Math.random() * AI_TOPICS.length)] : randomTopic();
          if (tp) say(n, `${catTag(tp)} ${tp.lines[Math.floor(Math.random() * tp.lines.length)]}`, 4500);
          n.soliloquyAt = t + 15000 + Math.random() * 22000;
        }
      }

      // 말풍선 위치 (공통)
      if (!n.bubble.hidden) {
        if (t > n.until || !walk || d > 16) { n.bubble.hidden = true; }
        else {
          v.set(n.g.position.x, n.g.position.y + n.head * n.g.scale.y + 0.15, n.g.position.z).project(camera);
          if (v.z > 1) { n.bubble.style.display = "none"; }
          else { n.bubble.style.display = ""; const w = container.clientWidth, h = container.clientHeight; n.bubble.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px)`; }
        }
      }
    }

    // (2) 가까운 두 학생이 만나면 대화 시작 (화면 근처에서만, 동시에 최대 5쌍)
    if (walk && t > pairScanAt) {
      pairScanAt = t + 2500;
      if (conversations.length < 5) {
        const idle = npcs.filter((n) => !n.ai && !n.inConvo && t > n.cooldownUntil && n.bubble.hidden && n.listenUntil <= t);
        outer: for (let i = 0; i < idle.length; i++) for (let j = i + 1; j < idle.length; j++) {
          const A = idle[i], B = idle[j]; if (A.inConvo || B.inConvo) continue;
          const dd = Math.hypot(A.g.position.x - B.g.position.x, A.g.position.z - B.g.position.z);
          if (dd < 5.5 && Math.min(A.dist, B.dist) < 36) { startConvo(A, B, A.debater && B.debater); if (conversations.length >= 5) break outer; }
        }
      }
    }

    if (best !== near) {
      near = best;
      if (near) prompt.innerHTML = `<kbd>E</kbd>${near.inConvo ? "엿듣기 (대화 중)" : esc(near.name) + "에게 듣기"}`;
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
      const rx = -fw.z, rz = fw.x;                          // 오른쪽 방향 — 채팅창(오른쪽 아래)에 안 가리게 왼쪽에 떠 있음
      goal.set(camera.position.x + fw.x * 2.4 - rx * 0.95, camera.position.y - 0.5 + bob, camera.position.z + fw.z * 2.4 - rz * 0.95);
    } else {
      goal.set(fairy.home.x, 1.6 + bob, fairy.home.z);       // 둘러보기 중엔 제자리 대기
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

  // 지도·검색에서 "AI에게 물어보기" → 3D로 와서 AI 요정 채팅을 열고 바로 질문
  function openAI(text) {
    if (!fairy) return false;
    if (chat.hidden) openChat(fairy);
    if (text) send(text);
    return true;
  }

  return { update, interact, talkAI, openAI, ready, get chatOpen() { return !chat.hidden; }, closeChat, list: npcs, send, toggleArrow, clearGuide, setGuide, get guide() { return guide; } };
}
