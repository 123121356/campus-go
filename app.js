/* 캠퍼스GO — 강원대 삼척캠퍼스 AI 비서 + 지도·건물·버스 안내 */
import { initAI, ask as aiAsk, renderDash, openAI, closeAI, aiOpen } from "./ai.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const norm = (s) => String(s || "").toLowerCase().replace(/강원대학교|강원대|삼척캠퍼스|삼척|\s|제(?=\d)/g, "");

const CAT = {
  강의: { color: "#2563eb", label: "강의" },
  행정: { color: "#7c3aed", label: "행정" },
  편의: { color: "#ea580c", label: "편의·식당" },
  생활: { color: "#0d9488", label: "생활관" },
  체육: { color: "#16a34a", label: "체육" },
  출입: { color: "#0f172a", label: "출입구" },
  기타: { color: "#64748b", label: "기타" },
};

// 기능 스위치. 버스는 정류장 시간표(data/bus.json) 기반이라 API 키가 필요 없습니다.
const FEATURES = { bus: true, weather: true };

const S = {
  campus: null,
  buildings: [],
  bus: null,
  busLive: null,      // 실시간 응답
  selected: null,
  cat: "전체",
  markers: {},
  map: null,
  edit: false,
  chat: [],
};

function toast(msg, ms = 2400) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ---------------- 데이터 ---------------- */
async function loadData() {
  const [b, bus] = await Promise.all([
    fetch("data/buildings.json").then((r) => r.json()),
    fetch("data/bus.json").then((r) => r.json()),
  ]);
  S.campus = b.campus;
  const edits = store.get("cg_positions", {});
  S.buildings = b.buildings.map((x) => (edits[x.id] ? { ...x, ...edits[x.id], source: "edit" } : { ...x, source: "file" }));
  S.bus = bus;
  // 층별 내부 사진 (tools/build-floors.js 가 photos/ 폴더를 읽어 생성). 없으면 빈 객체.
  S.floors = await fetch("data/floors.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  delete S.floors._note;
  S.illoData = await fetch("data/illustration.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (S.illoData) S.illoData.spots = { ...S.illoData.spots, ...store.get("cg_illo", {}) };
}

/* ---------------- 지도 ---------------- */
function pinIcon(b, sel = false) {
  const c = (CAT[b.category] || CAT.강의).color;
  const short = b.name.match(/제\d/) ? b.name.match(/\d+/)[0] : b.name.slice(0, 1);
  return L.divIcon({
    className: "",
    html: `<div class="pin ${sel ? "sel" : ""}" style="background:${c}"><span>${esc(short)}</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
}

function initMap() {
  if (!window.L) { toast("지도 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인하세요."); return; }
  S.map = L.map("map", { zoomControl: true }).setView(S.campus.center, S.campus.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(S.map);

  for (const b of S.buildings) addMarker(b);

  if (FEATURES.bus && S.bus?.stop) {
    const st = S.bus.stop;
    L.marker([st.lat, st.lng], {
      icon: L.divIcon({ className: "", html: `<div class="bus-pin">🚌 후문 정류장</div>`, iconSize: [90, 24], iconAnchor: [45, 12] }),
      zIndexOffset: 1000,
    }).addTo(S.map).on("click", () => switchTab("bus"));
    const sh = S.bus.shuttle?.stop;
    if (sh) L.marker([sh.lat, sh.lng], {
      icon: L.divIcon({ className: "", html: `<div class="bus-pin shuttle-pin">🚐 통학버스</div>`, iconSize: [80, 24], iconAnchor: [40, 12] }),
      zIndexOffset: 1000,
    }).addTo(S.map).on("click", () => { switchTab("bus"); $("#shuttle").open = true; });
  }
}

function addMarker(b) {
  if (!S.map) return;
  const m = L.marker([b.lat, b.lng], { icon: pinIcon(b), draggable: S.edit })
    .addTo(S.map)
    .bindTooltip(b.name, { permanent: true, direction: "bottom", className: "lbl", offset: [0, 2] })
    .on("click", () => select(b.id))
    .on("dragend", (e) => {
      const { lat, lng } = e.target.getLatLng();
      b.lat = +lat.toFixed(6); b.lng = +lng.toFixed(6); b.verified = true; b.source = "edit";
      const edits = store.get("cg_positions", {});
      edits[b.id] = { lat: b.lat, lng: b.lng, verified: true };
      store.set("cg_positions", edits);
      renderList();
      toast(`${b.name} 위치 저장됨`);
    });
  S.markers[b.id] = m;
}

/* ---------------- 건물 안 시설 ---------------- */
const insideItems = (b) => (b.inside || []).flatMap((r) => r.items);
const insideText = (b) => (b.inside || []).map((r) => `${r.label}: ${r.items.join(", ")}`).join(" / ");
// "ATM", "프린터" 같은 시설이 있는 건물 찾기
const FACILITY = [
  { re: /atm|현금|돈\s*뽑|출금|은행/i, label: "ATM", match: /ATM/ },
  { re: /프린트|프린터|인쇄|출력|복사/i, label: "프린터·복사", match: /프린터|복사실|PC/ },
  { re: /편의점|매점|cu|간식/i, label: "편의점", match: /편의점|CU|자판기/ },
  { re: /밥|식당|학식|먹|점심|저녁|푸드/i, label: "식당", match: /식당|푸드코트/ },
  { re: /카페|커피/i, label: "카페", match: /카페/ },
  { re: /헬스|운동|체력/i, label: "운동", match: /헬스장|실내 트랙|실내 코트|체력/ },
  { re: /세탁|빨래/i, label: "세탁실", match: /세탁실/ },
  { re: /열람실|공부|스터디/i, label: "공부할 곳", match: /열람실|스터디/ },
  { re: /우체국|택배|우편/i, label: "우편", match: /우편/ },
  { re: /기숙사|생활관|긱사/i, label: "기숙사", match: /기숙사/ },
  { re: /행정|증명서|학적|장학/i, label: "행정", match: /행정/ },
];
function facilityQuery(q) {
  const f = FACILITY.find((x) => x.re.test(q));
  if (!f) return null;
  const hits = S.buildings.filter((b) => insideItems(b).some((it) => f.match.test(it)));
  return { label: f.label, hits };
}

/* ---------------- 지도 핀 (검색·AI 답변 위치 표시) ---------------- */
function showPins(ids, label = "") {
  clearPins(false);
  const bs = [...new Set(ids)].map((id) => S.buildings.find((b) => b.id === id)).filter(Boolean);
  if (!bs.length || !S.map) return;
  if (S.view !== "map") setView("map");
  S.pinLayer = L.layerGroup().addTo(S.map);
  for (const b of bs) {
    const hit = (b.inside || []).filter((r) => !label || r.items.some((it) => (FACILITY.find((f) => f.label === label)?.match || /./).test(it)));
    const tip = label && hit.length ? `${b.name} · ${hit.map((r) => r.label).join(", ")}` : b.name;
    L.marker([b.lat, b.lng], {
      icon: L.divIcon({ className: "", html: `<div class="hitpin"><span>📍</span></div>`, iconSize: [36, 44], iconAnchor: [18, 42] }),
      zIndexOffset: 2000,
    }).addTo(S.pinLayer).bindTooltip(tip, { permanent: true, direction: "top", className: "hitlbl", offset: [0, -40] }).on("click", () => select(b.id, { fly: false }));
  }
  if (bs.length === 1) S.map.flyTo([bs[0].lat, bs[0].lng], 18, { duration: 0.6 });
  else S.map.flyToBounds(L.latLngBounds(bs.map((b) => [b.lat, b.lng])).pad(0.35), { duration: 0.6, maxZoom: 18 });
  $("#pinBar").hidden = false;
  $("#pinBar span").textContent = label ? `${label} 있는 곳 ${bs.length}곳` : bs.length === 1 ? bs[0].name : `${bs.length}곳 표시`;
}
function clearPins(hideBar = true) {
  S.pinLayer?.remove(); S.pinLayer = null;
  if (hideBar) $("#pinBar").hidden = true;
}

/* ---------------- 길안내 (캠퍼스 도로·보행로 그래프) ---------------- */
const R2D = Math.PI / 180;
const distM = (a, b) => { // [lat,lng]
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * R2D) * 111320, y = (b[0] - a[0]) * 110950;
  return Math.hypot(x, y);
};
function buildGraph(fc) {
  const nodes = [], key = new Map(), adj = [];
  const nodeOf = (lat, lng) => {
    const k = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (!key.has(k)) { key.set(k, nodes.length); nodes.push([lat, lng]); adj.push([]); }
    return key.get(k);
  };
  for (const f of fc.features) {
    if (f.properties.kind !== "road" || /construction/.test(f.properties.highway)) continue;
    const pts = f.geometry.coordinates.map(([lng, lat]) => nodeOf(lat, lng));
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distM(nodes[pts[i]], nodes[pts[i + 1]]);
      adj[pts[i]].push([pts[i + 1], d]); adj[pts[i + 1]].push([pts[i], d]);
    }
  }
  // 끝점끼리 가까우면(6m) 이어 주기 — OSM 선이 살짝 떨어진 곳 보정
  for (let i = 0; i < nodes.length; i++) if (adj[i].length === 1)
    for (let j = 0; j < nodes.length; j++) if (j !== i) { const d = distM(nodes[i], nodes[j]); if (d < 6) { adj[i].push([j, d]); adj[j].push([i, d]); } }
  return { nodes, adj };
}
function nearestNode(G, ll) {
  let best = -1, bd = Infinity;
  G.nodes.forEach((n, i) => { if (!G.adj[i].length) return; const d = distM(n, ll); if (d < bd) { bd = d; best = i; } });
  return [best, bd];
}
function shortest(G, s, t) {
  const dist = new Float64Array(G.nodes.length).fill(Infinity), prev = new Int32Array(G.nodes.length).fill(-1), done = new Uint8Array(G.nodes.length);
  dist[s] = 0;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    for (const [v, w] of G.adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  if (!isFinite(dist[t])) return null;
  const path = []; for (let v = t; v >= 0; v = prev[v]) path.unshift(G.nodes[v]);
  return { path, len: dist[t] };
}
// 위치: 휴대폰은 GPS로 정확하지만, 컴퓨터는 인터넷 주소(IP·와이파이)로 추정해서
// 수십 km 틀릴 수 있어요(예: 학교망이 춘천으로 잡힘). 그래서 정확도(accuracy)를 보고 판단합니다.
const GOOD_ACC = 150; // m 이내면 믿을 만한 위치
function getFix(maxMs = 9000) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    let best = null, done = false;
    const finish = () => { if (done) return; done = true; navigator.geolocation.clearWatch(wid); res(best); };
    const wid = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { ll: [p.coords.latitude, p.coords.longitude], acc: p.coords.accuracy || 99999 };
        if (!best || fix.acc < best.acc) best = fix;
        if (fix.acc <= 30) finish(); // 충분히 정확하면 바로 끝
      },
      (e) => { best = best || { error: e.code }; finish(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    setTimeout(finish, maxMs);
  });
}
async function getMyPos() {
  if (S.manualPos) return S.manualPos;
  const f = await getFix(7000);
  return f && f.ll && f.acc <= GOOD_ACC * 2 ? f.ll : null;
}
function drawMe(ll, acc, manual = false) {
  S.me?.remove();
  S.me = L.layerGroup().addTo(S.map);
  if (acc && !manual) L.circle(ll, { radius: Math.min(acc, 3000), color: "#2563eb", weight: 1, fillOpacity: 0.12 }).addTo(S.me);
  L.circleMarker(ll, { radius: 9, color: "#fff", weight: 3, fillColor: manual ? "#16a34a" : "#2563eb", fillOpacity: 1, className: "me-dot" })
    .addTo(S.me).bindTooltip(manual ? "내 위치(직접 지정)" : "내 위치", { permanent: true, direction: "top", className: "melbl", offset: [0, -10] });
}
function setManualPos(ll, quiet = false) {
  S.manualPos = ll;
  drawMe(ll, 0, true);
  if (!quiet) toast("여기를 내 위치로 정했어요. 길안내가 여기서 출발해요.");
  if (S.routeDest) routeTo(S.routeDest, ll); // 길안내 중이면 새 출발지로 다시 그림
}
/* 지도 위를 한 번 눌러 위치를 찍는 모드 */
function startPick(msg, cb) {
  if (S.view !== "map") setView("map");
  cancelPick();
  const bar = $("#pickBar");
  bar.hidden = false; bar.querySelector("span").textContent = msg;
  S.map.getContainer().classList.add("picking");
  S.pickCb = (e) => { const ll = [e.latlng.lat, e.latlng.lng]; cancelPick(); cb(ll); };
  S.map.once("click", S.pickCb);
  closePanelOnMobile();
}
function cancelPick() {
  if (S.pickCb) S.map.off("click", S.pickCb);
  S.pickCb = null;
  $("#pickBar").hidden = true;
  S.map?.getContainer().classList.remove("picking");
}
async function locateMe() {
  if (!S.map) return;
  if (S.view !== "map") setView("map");
  // 이미 직접 지정한 위치가 있으면 바로 보여 줌
  if (S.manualPos) { drawMe(S.manualPos, 0, true); S.map.flyTo(S.manualPos, 18); }
  if (!navigator.geolocation) return startPick("📍 지도에서 지금 있는 곳을 눌러 주세요", (ll) => { setManualPos(ll); });
  toast("내 위치 찾는 중…", 2500);
  const f = await getFix(8000);
  const ok = f && f.ll && f.acc <= GOOD_ACC * 2;
  if (ok) {
    S.manualPos = null; S.lastFix = f.ll;
    drawMe(f.ll, f.acc);
    const far = distM(f.ll, S.campus.center);
    S.map.flyTo(f.ll, far > 3000 ? 13 : 18);
    if (far > 3000) toast(`삼척캠퍼스에서 약 ${(far / 1000).toFixed(1)}km 떨어져 있어요.`, 4000);
    if (S.routeDest) routeTo(S.routeDest, f.ll);
    return;
  }
  if (S.manualPos) return toast("지정한 위치를 쓰고 있어요. 바꾸려면 지도를 우클릭(길게 누르기) 하세요.", 3500);
  // GPS가 없거나 부정확(PC는 인터넷 주소로 추정 → 엉뚱한 곳) → 지도에서 직접 찍기
  const why = f?.error === 1 ? "위치 권한이 꺼져 있어요." : f?.acc ? `자동 위치 오차가 커요(약 ${f.acc >= 1000 ? Math.round(f.acc / 1000) + "km" : Math.round(f.acc) + "m"}).` : "자동 위치를 찾지 못했어요.";
  S.map.flyTo(S.campus.center, 17);
  startPick(`📍 ${why} 지도에서 지금 있는 곳을 눌러 주세요`, (ll) => { setManualPos(ll); S.map.panTo(ll); });
}
const GATE_ID = "n114";
async function routeTo(id, from) {
  const b = S.buildings.find((x) => x.id === id);
  if (!b || !S.graph) return toast("길안내 데이터를 아직 불러오지 못했어요");
  if (S.view !== "map") setView("map");
  const gate = S.buildings.find((x) => x.id === GATE_ID);
  const onCampus = (ll) => ll && distM(ll, S.campus.center) <= 1500;
  // 기다리지 않고 바로 그림: 지정 위치 → 최근 GPS → 정문
  let start, startName;
  if (onCampus(from)) { start = from; startName = S.manualPos === from ? "내 위치(지정)" : "내 위치"; }
  else if (onCampus(S.manualPos)) { start = S.manualPos; startName = "내 위치(지정)"; }
  else if (onCampus(S.lastFix)) { start = S.lastFix; startName = "내 위치"; }
  else { start = [gate.lat, gate.lng]; startName = "정문"; }
  S.routeDest = id;
  const info = drawRoute(b, start, startName);
  // 정문에서 출발한 경우, 백그라운드로 GPS를 한 번 시도해 정확하면 다시 그림
  if (startName === "정문" && !from && navigator.geolocation && !S.routeProbe) {
    S.routeProbe = true;
    const f = await getFix(6000); S.routeProbe = false;
    if (f && f.ll && f.acc <= GOOD_ACC && onCampus(f.ll) && S.routeDest === id) {
      S.lastFix = f.ll; drawMe(f.ll, f.acc); drawRoute(b, f.ll, "내 위치");
    }
  }
  return info;
}
// 지도에 그리지 않고 도보 시간만 계산 (대시보드·AI용)
function routeEstimate(id) {
  const b = S.buildings.find((x) => x.id === id);
  if (!b || !S.graph) return null;
  const on = (ll) => ll && distM(ll, S.campus.center) <= 1500;
  const gate = S.buildings.find((x) => x.id === GATE_ID);
  const [start, startName] = on(S.manualPos) ? [S.manualPos, "내 위치"] : on(S.lastFix) ? [S.lastFix, "내 위치"] : [[gate.lat, gate.lng], "정문"];
  const [sn, sd] = nearestNode(S.graph, start), [en, ed] = nearestNode(S.graph, [b.lat, b.lng]);
  const r = sn >= 0 && en >= 0 ? shortest(S.graph, sn, en) : null;
  const meters = r ? sd + r.len + ed : distM(start, [b.lat, b.lng]);
  return { meters, mins: Math.max(1, Math.round(meters / 70)), startName };
}
function drawRoute(b, start, startName) {
  const end = [b.lat, b.lng];
  const [sn, sd] = nearestNode(S.graph, start), [en, ed] = nearestNode(S.graph, end);
  const r = sn >= 0 && en >= 0 ? shortest(S.graph, sn, en) : null;
  const line = r ? [start, ...r.path, end] : [start, end];
  const meters = r ? sd + r.len + ed : distM(start, end);
  S.routeLayer?.remove();
  S.routeLayer = L.layerGroup().addTo(S.map);
  L.polyline(line, { color: "#ffffff", weight: 10, opacity: 0.95 }).addTo(S.routeLayer);
  L.polyline(line, { color: "#2563eb", weight: 6, opacity: 1, dashArray: r ? null : "8 8", className: "route-line" }).addTo(S.routeLayer);
  // 내 위치 점이 이미 있으면 출발 이름표는 생략(겹침 방지)
  if (startName === "정문") L.circleMarker(start, { radius: 8, color: "#fff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }).addTo(S.routeLayer).bindTooltip("출발 · 정문", { permanent: true, direction: "left", className: "hitlbl start" });
  else drawMe(start, 0, startName.includes("지정"));
  L.marker(end, { icon: L.divIcon({ className: "", html: `<div class="hitpin dest"><span>🏁</span></div>`, iconSize: [36, 44], iconAnchor: [18, 42] }), zIndexOffset: 2100 }).addTo(S.routeLayer)
    .bindTooltip(b.name, { permanent: true, direction: "top", className: "hitlbl", offset: [0, -40] });
  S.map.flyToBounds(L.latLngBounds(line).pad(0.25), { duration: 0.7, maxZoom: 18 });
  const mins = Math.max(1, Math.round(meters / 70));
  $("#routeBar").hidden = false;
  $("#routeBar span").innerHTML = `🧭 <b>${esc(startName)}</b> → <b>${esc(b.name)}</b> · 약 ${Math.round(meters / 10) * 10}m · 걸어서 ${mins}분${r ? "" : " (직선 거리)"}`;
  return { meters, mins, startName, exact: !!r };
}
function clearRoute() { S.routeLayer?.remove(); S.routeLayer = null; S.routeDest = null; $("#routeBar").hidden = true; }

/* ---------------- 건물 목록/검색 ---------------- */
function matches(b, q) {
  const n = norm(q);
  if (!n) return 0;
  const hay = [b.name, b.no, ...(b.aliases || [])].filter(Boolean).map(norm);
  if (hay.some((h) => h === n)) return 3;
  if (hay.some((h) => h.includes(n) || (h.length >= 3 && n.includes(h)))) return 2;
  if ([...(b.facilities || []), ...(b.keywords || []), ...insideItems(b)].map(norm).some((h) => h.includes(n))) return 1;
  return 0;
}
function search(q) {
  return S.buildings.map((b) => [b, matches(b, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([b]) => b);
}

function renderCats() {
  const cats = ["전체", ...Object.keys(CAT).filter((c) => S.buildings.some((b) => b.category === c))];
  $("#cats").innerHTML = cats.map((c) => `<button data-c="${c}" class="${c === S.cat ? "on" : ""}">${c === "전체" ? "전체" : CAT[c].label}</button>`).join("");
  $$("#cats button").forEach((el) => el.addEventListener("click", () => { S.cat = el.dataset.c; renderCats(); renderList(); }));
}

function renderList() {
  const list = S.buildings.filter((b) => S.cat === "전체" || b.category === S.cat);
  $("#blist").innerHTML = list.map((b) => {
    const c = (CAT[b.category] || CAT.강의).color;
    const short = b.no || b.name.match(/\d+/)?.[0] || b.name[0];
    return `<li data-id="${b.id}">
      <span class="dot" style="background:${c}">${esc(short)}</span>
      <div><div class="t">${esc(b.name)}${b.verified ? "" : `<span class="badge">위치 추정</span>`}${S.floors[b.id]?.floors?.length ? `<span class="badge ok">내부 사진</span>` : ""}</div>
      <div class="s">${esc(insideItems(b).slice(0, 4).join(" · ") || (b.no ? b.no + "동" : ""))}</div></div></li>`;
  }).join("");
  $$("#blist li").forEach((el) => el.addEventListener("click", () => select(el.dataset.id)));
}

let opts3d = {};
function select(id, { fly = true, fromScene = false } = {}) {
  if (aiOpen()) closeAI(); // 건물을 고르면 지도 화면으로
  opts3d = { fromScene };
  const b = S.buildings.find((x) => x.id === id);
  if (!b) return;
  if (S.selected && S.markers[S.selected]) S.markers[S.selected].setIcon(pinIcon(S.buildings.find((x) => x.id === S.selected)));
  S.selected = id;
  S.markers[id]?.setIcon(pinIcon(b, true));
  if (fly && S.map && S.view !== "illo") S.map.flyTo([b.lat, b.lng], 18, { duration: 0.6 });
  if (S.view === "illo") focusIllo(id);
  if (S.view === "3d" && S.three && !opts3d.fromScene) S.three.focus(id);
  switchTab("buildings");
  const stop = FEATURES.bus && S.bus?.shuttle?.stop?.buildingId === id ? S.bus.shuttle.stop : null;
  const kakao = `https://map.kakao.com/link/to/${encodeURIComponent(b.name + " (강원대 삼척)")},${b.lat},${b.lng}`;
  $("#detail").hidden = false;
  const nf = S.floors[b.id]?.floors?.length || 0;
  $("#detail").innerHTML = `
    <button class="detail-x" id="detailX" aria-label="닫기">✕</button>
    <h3>${b.no ? `<span class="no">${esc(b.no)}</span>` : ""}${esc(b.name)}</h3>
    <div class="muted meta">${esc((CAT[b.category] || {}).label || b.category)}${b.floorsText ? ` · ${esc(b.floorsText)}` : ""}</div>
    ${(b.inside || []).length ? `<dl class="inside">${b.inside.map((r) => `<dt>${esc(r.label)}</dt><dd>${r.items.map((it) => `<span>${esc(it)}</span>`).join("")}</dd>`).join("")}</dl>` : `<p class="muted">시설 정보 준비 중</p>`}
    ${stop ? `<div class="note">🚐 통학버스 타는 곳 (${esc(stop.name)}) <a href="#" id="toBus">시간 보기</a></div>` : ""}
    <button class="ai-ask" data-ask="${esc(b.name)}에 대해 알려줘. 가는 길도">✨ AI에게 이 건물 물어보기</button>
    <div class="row actions">
      ${nf ? `<button class="primary alt" id="inside">🏢 내부 사진 (${nf})</button>` : ""}
      <button class="ghost" id="share">링크 복사</button>
      <a class="ghost" href="${kakao}" target="_blank" rel="noopener">카카오맵</a>
    </div>
    ${b.photo ? `<img class="photo" src="${esc(b.photo)}" alt="${esc(b.name)} 외관" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}`;
  $("#inside")?.addEventListener("click", () => openViewer(b.id));
  $("#detailX").addEventListener("click", () => { $("#detail").hidden = true; });
  $("#toBus")?.addEventListener("click", (e) => { e.preventDefault(); switchTab("bus"); });
  $("#share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?b=${b.id}`;
    try { await navigator.clipboard.writeText(url); toast("링크를 복사했어요. QR로 만들어 붙여도 돼요."); } catch { prompt("링크", url); }
  });
  history.replaceState(null, "", `?b=${id}`);
  openPanel();
  $("#detail").scrollIntoView({ block: "start", behavior: "smooth" });
}

/* ---------------- 패널 열고 닫기 ---------------- */
function openPanel() {
  $("#panel").classList.remove("min", "collapsed");
  $("#panelOpen").hidden = true;
  setTimeout(() => { S.map?.invalidateSize(); S.illo?.invalidateSize(); }, 260);
}
function closePanel() {
  const mobile = matchMedia("(max-width: 760px)").matches;
  $("#panel").classList.add(mobile ? "min" : "collapsed");
  $("#panel").classList.remove("max");
  $("#panelOpen").hidden = mobile;
  setTimeout(() => { S.map?.invalidateSize(); S.illo?.invalidateSize(); }, 260);
}
function closePanelOnMobile() { if (matchMedia("(max-width: 760px)").matches) closePanel(); }

function initSearch() {
  const q = $("#q"), sug = $("#suggest");
  let idx = -1, items = [];
  const close = () => { sug.hidden = true; idx = -1; };
  q.addEventListener("input", () => {
    items = search(q.value).slice(0, 6);
    if (!q.value.trim()) return close();
    const fq = facilityQuery(q.value);
    sug.innerHTML = items.length
      ? items.map((b, i) => `<li data-id="${b.id}" class="${i === idx ? "on" : ""}"><span>${esc(b.name)}</span><small>${esc((b.facilities || []).slice(0, 2).join(" · "))}</small></li>`).join("")
      : `<li data-ai="1"><span>‘${esc(q.value)}’ AI 도우미에게 물어보기</span><small>→</small></li>`;
    if (fq?.hits.length) sug.innerHTML = `<li data-fac="${esc(q.value)}"><span>📍 ${esc(fq.label)} 있는 곳 모두 지도에 표시</span><small>${fq.hits.length}곳</small></li>` + sug.innerHTML;
    sug.hidden = false;
    $$("#suggest li").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); pick(el); }));
  });
  const pick = (el) => {
    if (el.dataset.fac) { const fq = facilityQuery(el.dataset.fac); showPins(fq.hits.map((b) => b.id), fq.label); closePanelOnMobile(); q.value = ""; close(); q.blur(); return; }
    if (el.dataset.ai) { switchTab("ai"); ask(q.value); } else { select(el.dataset.id, { fly: false }); showPins([el.dataset.id]); }
    q.value = ""; close(); q.blur();
  };
  q.addEventListener("keydown", (e) => {
    const lis = $$("#suggest li");
    if (e.key === "ArrowDown") { idx = Math.min(idx + 1, lis.length - 1); }
    else if (e.key === "ArrowUp") { idx = Math.max(idx - 1, 0); }
    else if (e.key === "Enter") { const el = lis[idx >= 0 ? idx : 0]; if (el) pick(el); return; }
    else if (e.key === "Escape") return close();
    else return;
    e.preventDefault();
    lis.forEach((l, i) => l.classList.toggle("on", i === idx));
  });
  q.addEventListener("blur", () => setTimeout(close, 120));
}

/* ---------------- 위치 편집 / OSM ---------------- */
function initEdit() {
  $("#editMode").addEventListener("change", (e) => {
    S.edit = e.target.checked;
    $("#exportJson").hidden = !S.edit;
    $("#exportIllo").hidden = !S.edit;
    $("#illo").classList.toggle("placing", S.edit);
    illoStatus();
    for (const m of Object.values(S.illoMarkers || {})) S.edit ? m.dragging?.enable() : m.dragging?.disable();
    for (const m of Object.values(S.markers)) S.edit ? m.dragging?.enable() : m.dragging?.disable();
    toast(S.edit ? "마커를 끌어서 실제 위치로 옮기세요. 자동 저장돼요." : "편집 모드 끔");
  });
  $("#exportJson").addEventListener("click", async () => {
    const raw = await fetch("data/buildings.json").then((r) => r.json());
    raw.buildings = S.buildings.map(({ source, ...b }) => b);
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "buildings.json" });
    a.click();
    toast("buildings.json 을 받았어요. data/ 폴더의 파일을 교체하세요.");
  });
  $("#loadOsm").addEventListener("click", () => loadOsm(true));
  $("#exportIllo").addEventListener("click", () => {
    const out = { ...S.illoData };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "illustration.json" }).click();
    toast("illustration.json 을 받았어요. data/ 폴더의 파일을 교체하세요.");
  });
}

// OpenStreetMap(Overpass API)에서 캠퍼스 주변 실제 건물 윤곽을 불러와 지도에 그립니다.
async function loadOsm(force = false) {
  const status = $("#osmStatus");
  const cacheKey = "cg_osm_v1";
  let data = store.get(cacheKey, null);
  if (force || !data || Date.now() - data.t > 7 * 864e5) {
    status.textContent = "OpenStreetMap 건물 데이터 불러오는 중…";
    const [lat, lng] = S.campus.center;
    const q = `[out:json][timeout:25];(way["building"](around:650,${lat},${lng});way["amenity"="university"](around:900,${lat},${lng}););out geom tags;`;
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      data = { t: Date.now(), ways: j.elements.filter((e) => e.geometry).map((e) => ({ tags: e.tags || {}, g: e.geometry.map((p) => [p.lat, p.lon]) })) };
      store.set(cacheKey, data);
    } catch (e) {
      status.textContent = "OSM 데이터를 불러오지 못했어요 (네트워크 또는 서버 혼잡). 기본 위치로 표시합니다.";
      return;
    }
  }
  if (!S.map) return;
  S.osmLayer?.remove();
  S.osmLayer = L.layerGroup().addTo(S.map);
  let named = 0, fixed = 0;
  for (const w of data.ways) {
    const isCampus = w.tags.amenity === "university";
    L.polygon(w.g, isCampus
      ? { color: "#2563eb", weight: 2, dashArray: "6 6", fill: false, interactive: false }
      : { color: "#64748b", weight: 1, fillColor: "#94a3b8", fillOpacity: 0.25, interactive: false }).addTo(S.osmLayer);
    if (isCampus || !w.tags.name) continue;
    named++;
    const n = norm(w.tags.name);
    const b = S.buildings.find((x) => [x.name, ...(x.aliases || [])].some((a) => norm(a) === n));
    if (b && !b.verified && b.source !== "edit") {
      const c = w.g.reduce((a, p) => [a[0] + p[0] / w.g.length, a[1] + p[1] / w.g.length], [0, 0]);
      b.lat = +c[0].toFixed(6); b.lng = +c[1].toFixed(6); b.source = "osm"; b.verified = true;
      S.markers[b.id]?.setLatLng(c);
      fixed++;
    }
  }
  renderList();
  status.textContent = `OSM 건물 ${data.ways.length}개 표시 (이름 있는 건물 ${named}개, 위치 자동 보정 ${fixed}개). 출처: © OpenStreetMap contributors`;
}

/* ---------------- 버스 (정류장 시간표 기반) ---------------- */
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const routeColor = (no) => S.bus.routes.find((r) => r.no === no)?.color || "#475569";
const BUSUI = { dir: "donghae", holiday: false };

function isOffDay(now = new Date()) {
  const d = now.getDay();
  return d === 0 || d === 6 || BUSUI.holiday; // 주말 또는 '공휴일' 토글
}

// 방향별 오늘 운행 목록: 기점 출발 + offset = 후문 도착(추정)
function busList(dir, now = new Date()) {
  const off = isOffDay(now);
  const offset = S.bus.directions[dir].offsetMin;
  const cur = now.getHours() * 60 + now.getMinutes();
  const out = [];
  for (const r of S.bus.routes) {
    for (const x of r.times[dir] || []) {
      const dep = toMin(x.t), at = dep + offset;
      out.push({ route: r.no, color: r.color, origin: x.t, at: fmtMin(at), atMin: at, wait: at - cur, runs: !(off && x.weekdayOnly), weekdayOnly: x.weekdayOnly });
    }
  }
  return out.sort((a, b) => a.atMin - b.atMin);
}
const upcoming = (dir, n = 3) => busList(dir).filter((x) => x.runs && x.wait >= 0).slice(0, n);
const waitText = (m) => (m < 1 ? "곧 도착" : m < 60 ? `${m}분 후` : `${Math.floor(m / 60)}시간 ${m % 60}분 후`);

// 통학버스: 운행 기간 + 평일만
function shuttleStatus(now = new Date()) {
  const sh = S.bus.shuttle;
  if (!sh) return { runs: false, why: "정보 없음" };
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (sh.period && (ymd < sh.period.start || ymd > sh.period.end)) return { runs: false, why: `운행 기간(${sh.period.start} ~ ${sh.period.end})이 아니에요` };
  if (sh.weekdayOnly && isOffDay(now)) return { runs: false, why: "주말·공휴일에는 운행하지 않아요" };
  return { runs: true, why: "" };
}
function nextShuttles(n = 3, now = new Date()) {
  if (!shuttleStatus(now).runs) return [];
  const cur = now.getHours() * 60 + now.getMinutes();
  return S.bus.shuttle.lines.flatMap((l) => l.runs.filter((x) => x.from.startsWith("삼척캠")).map((x) => ({ ...x, line: l.name, wait: toMin(x.dep) - cur })))
    .filter((x) => x.wait >= 0).sort((a, b) => a.wait - b.wait).slice(0, n);
}

function busSnapshot() {
  const dirs = {};
  for (const [k, d] of Object.entries(S.bus.directions)) {
    dirs[k] = { label: d.label, via: d.sub, next: upcoming(k, 3).map((x) => ({ route: x.route, at: x.at, minutes: x.wait })) };
  }
  return {
    stop: S.bus.stop.name,
    basis: "정류장 시간표 기준 추정(실시간 아님). 주말·공휴일엔 일부 편 미운행",
    today: isOffDay() ? "주말/공휴일" : "평일",
    directions: dirs,
    routes: S.bus.routes.map((r) => ({ no: r.no, name: r.name, stops: r.stops })),
    other: S.bus.other,
    shuttle: S.bus.shuttle ? {
      basis: S.bus.shuttle.basis, stop: S.bus.shuttle.stop.name, rules: S.bus.shuttle.rules,
      today: shuttleStatus().runs ? "오늘 운행" : `오늘 미운행: ${shuttleStatus().why}`,
      nextFromSamcheok: nextShuttles(3).map((x) => `${x.dep} ${x.line} (${x.wait}분 후)`),
      lines: S.bus.shuttle.lines.map((l) => ({ name: l.name, runs: l.runs.map((x) => `${x.dep} ${x.from}→${x.to} ${x.arr}${x.bus ? ` (${x.bus})` : ""}`) })),
    } : null,
  };
}

function busAnswer() {
  const parts = Object.entries(S.bus.directions).map(([k, d]) => {
    const n = upcoming(k, 2);
    return n.length ? `${d.label}: ${n.map((x) => `${x.route}번 ${x.at}(${waitText(x.wait)})`).join(", ")}` : `${d.label}: 오늘 남은 버스 없음`;
  });
  return `${S.bus.stop.name} 기준 다음 버스예요 (시간표 추정, ${isOffDay() ? "주말·공휴일" : "평일"}).\n${parts.join("\n")}\n실시간 정보가 아니라 몇 분 차이가 날 수 있어요. [[BUS]]`;
}

function renderBus() {
  if (!S.bus) return;
  const dir = BUSUI.dir, d = S.bus.directions[dir];
  $("#stopName").textContent = S.bus.stop.name;
  $("#busMode").innerHTML = `${isOffDay() ? "주말·공휴일 시간표" : "평일 시간표"} · 시간표 기준 추정 도착`;
  $$("#busDirs button").forEach((b) => b.classList.toggle("on", b.dataset.dir === dir));
  const nx = upcoming(dir, 3);
  $("#arrivals").innerHTML = nx.length
    ? nx.map((a, i) => `<li class="${i === 0 ? "first" : ""}"><span class="route-no" style="background:${a.color}">${esc(a.route)}</span>
        <div>${esc(a.at)} 도착 예정<div class="muted" style="font-size:12px">${esc(d.origin)} ${esc(a.origin)} · ${esc(d.sub)}</div></div>
        <div class="when"><b>${a.wait < 1 ? "곧" : a.wait < 60 ? a.wait + "분" : Math.floor(a.wait / 60) + "시간 " + (a.wait % 60) + "분"}</b><small>${a.wait < 1 ? "도착" : "남음"}</small></div></li>`).join("")
    : `<li class="empty">오늘 ${esc(d.label)} 남은 버스가 없어요</li>`;
  // 전체 시간표
  const all = busList(dir);
  $("#busTable").innerHTML = all.map((x) => `<span class="tt ${x.wait < 0 ? "past" : ""} ${x.runs ? "" : "off"}" style="--c:${x.color}" title="${esc(x.route)} · ${esc(d.origin)} ${esc(x.origin)}${x.weekdayOnly ? " · 주말·공휴일 미운행" : ""}"><i>${esc(x.route)}</i>${esc(x.at)}</span>`).join("");
  // 노선도
  $("#routes").innerHTML = S.bus.routes.map((r) => `<li><div><span class="route-no" style="background:${r.color};display:inline-block;min-width:auto;padding:2px 8px">${esc(r.no)}</span> ${esc(r.name)}</div>
      <div class="line" style="--c:${r.color}">${r.stops.map((s, i) => `<span class="st">${esc(s)}</span>${i === 0 ? `<span class="st me">강원대 후문</span>` : ""}`).join("")}</div></li>`).join("")
    + (S.bus.other || []).map((o) => `<li><span class="route-no" style="background:#475569;display:inline-block;min-width:auto;padding:2px 8px">${esc(o.no)}</span> <span class="muted">${esc(o.note)}</span></li>`).join("");
  // 셔틀
  const sh = S.bus.shuttle;
  const st = sh ? shuttleStatus() : null, ns = sh ? nextShuttles(2) : [];
  const keepOpen = $("#shuttle").open;
  $("#shuttle").innerHTML = sh ? `<summary>🚐 ${esc(sh.title)} · ${st.runs ? (ns.length ? `다음 ${esc(ns[0].dep)} ${esc(ns[0].line)}` : "오늘 남은 운행 없음") : "오늘 미운행"}</summary>
      <p class="muted" style="font-size:12px;margin:8px 0">${esc(sh.basis)} · 운행기간 ${esc(sh.period.start)} ~ ${esc(sh.period.end)}, 주말·공휴일 미운행${st.runs ? "" : ` — <b>${esc(st.why)}</b>`}</p>
      <ul class="sh-rules">${sh.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      ${ns.length ? `<div class="sh-next">${ns.map((x) => `<span><b>${esc(x.dep)}</b> ${esc(x.line)} · ${waitText(x.wait)}</span>`).join("")}</div>` : ""}` + sh.lines.map((l) => `
      <h5>${esc(l.name)}</h5><ul class="shuttle">${l.runs.map((x) => `<li><b>${esc(x.dep)}</b> ${esc(x.from)} → ${esc(x.to)} <b>${esc(x.arr)}</b>${x.bus ? ` <span class="sh-bus">${esc(x.bus)}</span>` : ""}<div class="muted">${esc(x.via)}</div></li>`).join("")}</ul>`).join("") : "";
  $("#shuttle").open = keepOpen;
  $("#busSrc").innerHTML = `도착 시각 = 기점 출발 + ${S.bus.directions.donghae.offsetMin}분(동해 방면) / ${S.bus.directions.samcheok.offsetMin}분(삼척 방면) 추정. 흐린 시각은 주말·공휴일 미운행. 출처: ${S.bus.sources.map((x) => (x.url ? `<a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title))).join(" · ")}`;
}

function initBus() {
  $$("#busDirs button").forEach((b) => b.addEventListener("click", () => { BUSUI.dir = b.dataset.dir; renderBus(); }));
  $("#busHoliday").addEventListener("change", (e) => { BUSUI.holiday = e.target.checked; renderBus(); });
  renderBus();
  setInterval(() => { if (!document.hidden && !$("#tab-bus").hidden) renderBus(); }, 30000);
}

/* ---------------- 날씨 · 미세먼지 (Open-Meteo, 키 불필요) ---------------- */
// 외부 데이터: Open-Meteo 예보 API(기상청 등 각국 기상기관 모델 기반) + 대기질 API(CAMS). 가입·키 없이 브라우저에서 바로 호출.
const WMO = {
  0: ["☀️", "맑음"], 1: ["🌤️", "대체로 맑음"], 2: ["⛅", "구름 조금"], 3: ["☁️", "흐림"],
  45: ["🌫️", "안개"], 48: ["🌫️", "짙은 안개"],
  51: ["🌦️", "약한 이슬비"], 53: ["🌦️", "이슬비"], 55: ["🌧️", "강한 이슬비"],
  56: ["🌧️", "어는 이슬비"], 57: ["🌧️", "어는 이슬비"],
  61: ["🌧️", "약한 비"], 63: ["🌧️", "비"], 65: ["🌧️", "강한 비"], 66: ["🌧️", "어는 비"], 67: ["🌧️", "어는 비"],
  71: ["🌨️", "약한 눈"], 73: ["🌨️", "눈"], 75: ["❄️", "많은 눈"], 77: ["🌨️", "싸락눈"],
  80: ["🌦️", "소나기"], 81: ["🌧️", "소나기"], 82: ["⛈️", "강한 소나기"], 85: ["🌨️", "소낙눈"], 86: ["❄️", "강한 소낙눈"],
  95: ["⛈️", "뇌우"], 96: ["⛈️", "뇌우·우박"], 99: ["⛈️", "강한 뇌우·우박"],
};
const wmo = (c) => WMO[c] || ["🌡️", "알 수 없음"];
// 환경부 기준 (㎍/㎥)
const pmGrade = (v, kind) => {
  if (v == null) return { t: "–", c: "#64748b" };
  const cut = kind === "pm25" ? [15, 35, 75] : [30, 80, 150];
  return v <= cut[0] ? { t: "좋음", c: "#2563eb" } : v <= cut[1] ? { t: "보통", c: "#16a34a" } : v <= cut[2] ? { t: "나쁨", c: "#d97706" } : { t: "매우 나쁨", c: "#dc2626" };
};

async function loadWeather() {
  const [lat, lng] = S.campus.center;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset` +
    `&timezone=Asia%2FSeoul&forecast_days=2&wind_speed_unit=ms`;
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
  try {
    const [wx, aq] = await Promise.all([
      fetch(wxUrl).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(aqUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    S.wx = { wx, aq, at: Date.now() };
    S.wxErr = null;
  } catch (e) {
    S.wxErr = e.message;
  }
  renderWeather();
}

function nextHours(n = 12) {
  const h = S.wx?.wx?.hourly;
  if (!h) return [];
  const nowKey = S.wx.wx.current.time.slice(0, 13);
  const i0 = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) === nowKey));
  return h.time.slice(i0, i0 + n).map((t, k) => ({
    hour: Number(t.slice(11, 13)), temp: h.temperature_2m[i0 + k], pop: h.precipitation_probability[i0 + k],
    mm: h.precipitation[i0 + k], code: h.weather_code[i0 + k],
  }));
}

function weatherAdvice() {
  if (!S.wx) return [];
  const c = S.wx.wx.current, hrs = nextHours(12), out = [];
  const rainNow = c.precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(c.weather_code);
  const rainSoon = hrs.slice(1, 7).find((x) => x.pop >= 50);
  if (rainNow) out.push("☔ 지금 비가 와요. 건물 사이 이동할 때 우산을 챙기세요.");
  else if (rainSoon) out.push(`☂️ ${rainSoon.hour}시쯤 비 올 확률 ${rainSoon.pop}%예요. 우산을 챙기는 게 좋아요.`);
  else out.push("🌂 앞으로 6시간은 비 소식이 거의 없어요.");
  if (c.apparent_temperature <= 0) out.push(`🧣 체감 ${Math.round(c.apparent_temperature)}°C로 추워요. 따뜻하게 입으세요.`);
  else if (c.apparent_temperature >= 30) out.push(`🥵 체감 ${Math.round(c.apparent_temperature)}°C로 더워요. 물을 챙기세요.`);
  if (c.wind_speed_10m >= 8) out.push(`💨 바람이 강해요 (${c.wind_speed_10m.toFixed(0)}m/s). 언덕길 이동에 주의하세요.`);
  const pm = S.wx.aq?.current;
  if (pm) {
    const g = [pmGrade(pm.pm10, "pm10").t, pmGrade(pm.pm2_5, "pm25").t];
    if (g.some((x) => x.includes("나쁨"))) out.push("😷 미세먼지가 나빠요. 야외 활동(운동장·야외음악당)은 줄이고 마스크를 쓰세요.");
  }
  return out;
}

function rainSoon() {
  if (!S.wx) return false;
  const c = S.wx.wx.current;
  return c.precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(c.weather_code) || nextHours(8).slice(1).some((x) => x.pop >= 50);
}
function weatherSnapshot() {
  if (!S.wx) return { note: "날씨 정보를 아직 못 받았음" };
  const c = S.wx.wx.current, d = S.wx.wx.daily, pm = S.wx.aq?.current;
  return {
    source: "Open-Meteo (삼척캠퍼스 좌표 기준 예보)",
    now: { time: c.time, desc: wmo(c.weather_code)[1], temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, wind_ms: c.wind_speed_10m, precip_mm: c.precipitation },
    today: { max: d.temperature_2m_max[0], min: d.temperature_2m_min[0], rainChanceMax: d.precipitation_probability_max[0], sunset: d.sunset[0]?.slice(11) },
    next12h: nextHours(12).map((x) => ({ hour: x.hour, temp: x.temp, rainChance: x.pop, desc: wmo(x.code)[1] })),
    air: pm ? { pm10: pm.pm10, pm10Grade: pmGrade(pm.pm10, "pm10").t, pm25: pm.pm2_5, pm25Grade: pmGrade(pm.pm2_5, "pm25").t } : null,
    advice: weatherAdvice(),
  };
}

function weatherAnswer() {
  if (!S.wx) return "날씨 정보를 아직 받지 못했어요. 잠시 뒤 다시 물어봐 주세요. [[WX]]";
  const c = S.wx.wx.current, [ic, desc] = wmo(c.weather_code);
  return `지금 삼척캠퍼스는 ${ic} ${desc}, ${Math.round(c.temperature_2m)}°C(체감 ${Math.round(c.apparent_temperature)}°C)예요.\n${weatherAdvice().join("\n")} [[WX]]`;
}

function renderWeather() {
  const chip = $("#wxChip");
  if (!S.wx) {
    $("#wxNow").innerHTML = S.wxErr ? `<p class="muted">날씨를 불러오지 못했어요 (${esc(S.wxErr)}). 인터넷 연결을 확인하세요.</p>` : `<p class="muted">불러오는 중…</p>`;
    chip.hidden = true;
    return;
  }
  const c = S.wx.wx.current, d = S.wx.wx.daily, [ic, desc] = wmo(c.weather_code), pm = S.wx.aq?.current;
  const g10 = pmGrade(pm?.pm10, "pm10"), g25 = pmGrade(pm?.pm2_5, "pm25");
  // 날씨 탭은 숨기고, 비 소식이 있을 때만 작은 우산 배지를 띄움
  const rainNow = c.precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(c.weather_code);
  const soon = nextHours(8).slice(1).find((x) => x.pop >= 50);
  chip.hidden = !(rainNow || soon);
  chip.innerHTML = rainNow ? "☔ 지금 비가 와요 · 우산 필요해요" : soon ? `☂️ ${soon.hour}시쯤 비 예보 · 우산 챙기세요` : "";
  $("#wxNow").innerHTML = `
    <div class="wx-now">
      <div class="wx-ic">${ic}</div>
      <div><div class="wx-t">${Math.round(c.temperature_2m)}°C</div>
        <div class="muted">${esc(desc)} · 체감 ${Math.round(c.apparent_temperature)}° · 최고 ${Math.round(d.temperature_2m_max[0])}° / 최저 ${Math.round(d.temperature_2m_min[0])}°</div></div>
    </div>
    <div class="wx-grid">
      <div><small>강수확률(오늘)</small><b>${d.precipitation_probability_max[0] ?? "–"}%</b></div>
      <div><small>바람</small><b>${c.wind_speed_10m.toFixed(1)}m/s</b></div>
      <div><small>미세먼지</small><b style="color:${g10.c}">${g10.t}</b><small>${pm?.pm10 != null ? Math.round(pm.pm10) + "㎍" : ""}</small></div>
      <div><small>초미세먼지</small><b style="color:${g25.c}">${g25.t}</b><small>${pm?.pm2_5 != null ? Math.round(pm.pm2_5) + "㎍" : ""}</small></div>
    </div>`;
  $("#wxAdvice").innerHTML = weatherAdvice().map((a) => `<li>${esc(a)}</li>`).join("");
  $("#wxHours").innerHTML = nextHours(12).map((x) => `
    <div class="wx-h"><small>${x.hour}시</small><span>${wmo(x.code)[0]}</span><b>${Math.round(x.temp)}°</b>
    <i style="opacity:${x.pop >= 30 ? 1 : 0.35}">💧${x.pop}%</i></div>`).join("");
  const t = new Date(S.wx.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  $("#wxSrc").innerHTML = `${t} 기준 · 일몰 ${esc(d.sunset[0]?.slice(11) || "–")} · 출처: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (예보·대기질, CC BY 4.0)`;
}

/* ---------------- 규칙 기반 장소 답변 (AI 비서의 마지막 대비책) ---------------- */
// 키가 없거나 서버가 응답하지 않을 때 쓰는 규칙 기반 답변 (데모가 멈추지 않게)
function localAnswer(q) {
  const t = q.toLowerCase();
  if (FEATURES.weather && /날씨|비\s*와|비와|비\s*올|우산|추워|추운|더워|더운|기온|미세먼지|바람|weather|rain|umbrella/.test(t)) {
    return weatherAnswer();
  }
  if (FEATURES.bus && /셔틀|통학버스|shuttle|도계/.test(t)) {
    const sh = S.bus.shuttle;
    const st = shuttleStatus(), ns = nextShuttles(2);
    const head = st.runs ? (ns.length ? `오늘 삼척캠 출발 다음 통학버스: ${ns.map((x) => `${x.dep} ${x.line}`).join(", ")}` : "오늘 삼척캠 출발 통학버스는 끝났어요.") : `오늘은 통학버스가 없어요 (${st.why}).`;
    return `${head}\n타는 곳: ${sh.stop.name}. 재학생만 탈 수 있어요(학생증 확인).\n${sh.lines.map((l) => `· ${l.name}: ${l.runs.map((x) => `${x.dep} ${x.from}→${x.to}`).join(", ")}`).join("\n")} [[BUS]] [[MAP:${sh.stop.buildingId}]]`;
  }
  if (FEATURES.bus && /버스|bus|정류장|21-1|21-3|동해|발한|시내\s*가/.test(t)) return busAnswer();
  // "OO 가는 길", "OO 어떻게 가" → 길안내
  if (/가는\s*길|어떻게\s*가|길\s*알려|길안내|데려다|how.*get/i.test(t)) {
    const words = q.split(/[\s?.,!]+/).filter((w) => w.length >= 2 && !/가는|길|어떻게|알려|정문에서|여기서/.test(w));
    const dest = words.flatMap((w) => search(w.replace(/(으로|로|까지|에|을|를|이|가)$/g, "")))[0];
    if (dest) return `${dest.name}까지 길을 지도에 그렸어요. 파란 선을 따라가세요. [[ROUTE:${dest.id}]]`;
  }
  const fq = facilityQuery(q);
  if (fq) {
    if (!fq.hits.length) return `${fq.label} 정보가 아직 없어요.`;
    return `${fq.label} 있는 곳이에요. 지도에 표시했어요.\n${fq.hits.map((b) => `· ${b.name}: ${(b.inside || []).filter((r) => r.items.some((it) => FACILITY.find((f) => f.label === fq.label).match.test(it))).map((r) => r.label + " " + r.items.filter((it) => FACILITY.find((f) => f.label === fq.label).match.test(it)).join(", ")).join(" / ")}`).join("\n")} ${fq.hits.map((b) => `[[MAP:${b.id}]]`).join(" ")} [[PINLABEL:${fq.label}]]`;
  }
  if (/처음|어디로|방문|visitor|뭐부터/.test(t)) return `처음이면 정문에서 출발하세요. 정문 바로 앞이 제3공학관이고, 학생식당·편의점·ATM은 제5공학관 1층과 학생회관에 있어요. [[MAP:n114]] [[MAP:n120]] [[MAP:n112]]`;
  const words = q.split(/[\s?.,!]+/).filter((w) => w.length >= 2);
  const hits = [...new Set(words.flatMap((w) => search(w.replace(/(이|가|은|는|을|를|에|어디|예요|에요|있어요)$/g, ""))))].slice(0, 3);
  if (/library|도서관/.test(t) && !hits.length) hits.push(S.buildings.find((b) => b.id === "n104"));
  if (hits.length) return hits.map((b) => `${b.name}\n${(b.inside || []).map((r) => `· ${r.label}: ${r.items.join(", ")}`).join("\n")} [[MAP:${b.id}]]`).join("\n");
  return "그 내용은 아직 확인된 정보가 없어요. 'ATM 어디', '프린트 어디서 해', '5공학관 가는 길'처럼 물어봐 주세요.";
}

/* ---------------- 조감도 보기 ---------------- */
// 그림 픽셀 [x, y] → Leaflet CRS.Simple 좌표 [h - y, x]
const illoLL = ([x, y]) => [S.illoData.height - y, x];

function illoIcon(b, sel) {
  const label = b.no ? `${b.no} ${b.name.replace(/^제/, "")}` : b.name;
  return L.divIcon({ className: "", html: `<span class="illo-pin ${sel ? "sel" : ""}">${esc(label)}</span>`, iconSize: [0, 0] });
}

function addIlloMarker(b) {
  const pos = S.illoData.spots[b.id];
  if (!pos) return;
  S.illoMarkers[b.id]?.remove();
  const m = L.marker(illoLL(pos), { icon: illoIcon(b, S.selected === b.id), draggable: S.edit })
    .addTo(S.illo)
    .on("click", () => select(b.id, { fly: false }))
    .on("dragend", (e) => { const { lat, lng } = e.target.getLatLng(); saveSpot(b.id, [Math.round(lng), Math.round(S.illoData.height - lat)]); });
  S.illoMarkers[b.id] = m;
}

function saveSpot(id, xy) {
  S.illoData.spots[id] = xy;
  const saved = store.get("cg_illo", {}); saved[id] = xy; store.set("cg_illo", saved);
  illoStatus();
}

function illoStatus() {
  if (!S.edit || S.view !== "illo") return;
  const n = S.buildings.filter((b) => S.illoData.spots[b.id]).length;
  $("#osmStatus").textContent = `조감도 위치 ${n}/${S.buildings.length}개 지정됨 · 목록에서 건물을 고르고 그림을 클릭하세요.`;
}

function initIllo() {
  if (S.illo || !S.illoData || !window.L) return;
  const { width: w, height: h, image, credit } = S.illoData;
  S.illo = L.map("illo", { crs: L.CRS.Simple, minZoom: -1, maxZoom: 2, zoomSnap: 0.25, attributionControl: true });
  const bounds = [[0, 0], [h, w]];
  L.imageOverlay(image, bounds, { attribution: esc(credit || "") }).addTo(S.illo);
  S.illo.fitBounds(bounds);
  S.illo.setMaxBounds([[-h * 0.2, -w * 0.2], [h * 1.2, w * 1.2]]);
  S.illoMarkers = {};
  for (const b of S.buildings) addIlloMarker(b);
  S.illo.on("click", (e) => {
    if (!S.edit) return;
    if (!S.selected) return toast("먼저 목록에서 건물을 고르세요");
    const xy = [Math.round(e.latlng.lng), Math.round(h - e.latlng.lat)];
    saveSpot(S.selected, xy);
    addIlloMarker(S.buildings.find((x) => x.id === S.selected));
    toast("위치를 찍었어요");
  });
}

function focusIllo(id) {
  if (!S.illo) return;
  for (const [bid, m] of Object.entries(S.illoMarkers)) m.setIcon(illoIcon(S.buildings.find((x) => x.id === bid), bid === id));
  const pos = S.illoData.spots[id];
  if (pos) S.illo.flyTo(illoLL(pos), Math.max(S.illo.getZoom(), 0.75), { duration: 0.5 });
  else if (!S.edit) toast("조감도에는 아직 이 건물 위치가 없어요");
}

async function init3DView() {
  if (S.three || S.threeLoading) return;
  S.threeLoading = true;
  const box = $("#view3d");
  box.innerHTML = `<div class="v3d-loading">3D 캠퍼스 불러오는 중…</div>`;
  try {
    const [mod, data] = await Promise.all([import("./three-view.js?v=38"), fetch("data/campus3d.json").then((r) => r.json())]);
    box.innerHTML = "";
    S.three = mod.init3D(box, {
      data, buildings: S.buildings, theme: currentTheme(),
      onSelect: (id) => select(id, { fly: false, fromScene: true }),
    });
    if (S.selected) S.three.focus(S.selected);
    window.__campus3d = S.three; // 개발자 도구에서 확인용
  } catch (e) {
    console.error(e);
    const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl2") || !!document.createElement("canvas").getContext("webgl"); } catch { return false; } })();
    const why = !webgl ? "이 브라우저에서 WebGL(3D 그래픽)이 꺼져 있어요. 크롬 설정 > 시스템 > '그래픽 가속 사용'을 켜 주세요."
      : /fetch|import|module|network/i.test(String(e?.message)) ? "3D 라이브러리를 받지 못했어요(인터넷·학교망 차단 확인). Ctrl+F5로 새로고침해 보세요." : "3D를 그리다 오류가 났어요. Ctrl+F5로 새로고침해 보세요.";
    box.innerHTML = `<div class="v3d-loading"><div style="text-align:center;line-height:1.7">${why}<br><small style="opacity:.7">${esc(String(e?.message || e)).slice(0, 160)}</small><br><button class="primary" id="retry3d">다시 시도</button></div></div>`;
    $("#retry3d")?.addEventListener("click", () => init3DView());
  } finally { S.threeLoading = false; }
}

function setView(v) {
  if (v === "illo" && !S.illoData) return toast("조감도 이미지가 없어요");
  S.view = v;
  $$(".view-toggle button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#map").hidden = v !== "map";
  $("#illo").hidden = v !== "illo";
  $("#view3d").hidden = v !== "3d";
  $("#wxChip").style.display = v === "3d" ? "none" : "";
  if (v === "3d") { init3DView(); S.three?.resume(); if (S.selected) S.three?.setTarget(S.selected); } else S.three?.pause();
  $("#illo").classList.toggle("placing", S.edit);
  if (v === "illo") { initIllo(); setTimeout(() => S.illo?.invalidateSize(), 50); if (S.selected) focusIllo(S.selected); illoStatus(); }
  else setTimeout(() => S.map?.invalidateSize(), 50);
}

/* ---------------- 건물 내부 (층별 사진) ---------------- */
const V = { id: null, fi: 0, pi: 0 };

function floorSummary() {
  // AI 가 "도서관 2층에 뭐 있어?" 에 답할 수 있도록 층별 설명·사진 제목만 전달
  const out = {};
  for (const [id, f] of Object.entries(S.floors)) {
    out[id] = (f.floors || []).map((fl) => ({ floor: fl.label, desc: fl.desc || "", photos: (fl.photos || []).map((p) => p.caption).filter(Boolean) }));
  }
  return out;
}

function openViewer(id, floorLabel) {
  const data = S.floors[id];
  const b = S.buildings.find((x) => x.id === id);
  if (!data?.floors?.length || !b) return toast("이 건물은 아직 내부 사진이 없어요");
  V.id = id; V.pi = 0;
  V.fi = Math.max(0, floorLabel ? data.floors.findIndex((f) => f.label.toLowerCase() === floorLabel.toLowerCase()) : 0);
  $("#vTitle").innerHTML = `${b.no ? `<span class="no">${esc(b.no)}</span>` : ""}${esc(b.name)} <small>내부</small>`;
  // 층 쌓기 (위층이 위로): 데이터는 아래층→위층 순서
  const n = data.floors.length;
  $("#vStack").style.height = `${120 + n * 34}px`;
  $("#vStack").innerHTML = data.floors.map((f, i) => `
    <button class="plate" data-i="${i}" style="--i:${i}" title="${esc(f.label)}">
      <span class="face"></span><span class="lbl">${esc(f.label)}</span>
    </button>`).join("");
  $$("#vStack .plate").forEach((el) => el.addEventListener("click", () => { V.fi = +el.dataset.i; V.pi = 0; renderViewer(); }));
  $("#vFloors").innerHTML = data.floors.map((f, i) => `<button data-i="${i}">${esc(f.label)}</button>`).join("");
  $$("#vFloors button").forEach((el) => el.addEventListener("click", () => { V.fi = +el.dataset.i; V.pi = 0; renderViewer(); }));
  $("#viewer").hidden = false;
  document.body.style.overflow = "hidden";
  renderViewer();
}

function renderViewer() {
  const floors = S.floors[V.id].floors;
  const f = floors[V.fi];
  const photos = f.photos || [];
  $$("#vStack .plate").forEach((el) => el.classList.toggle("on", +el.dataset.i === V.fi));
  $$("#vFloors button").forEach((el) => el.classList.toggle("on", +el.dataset.i === V.fi));
  $("#vFloorName").textContent = f.label + (f.desc ? ` · ${f.desc}` : "");
  const img = $("#vImg");
  if (photos.length) {
    const p = photos[V.pi];
    img.hidden = false; $("#vEmpty").hidden = true;
    img.src = p.src; img.alt = `${f.label} ${p.caption || ""}`;
    $("#vCap").textContent = p.caption || "";
    $("#vCount").textContent = `${V.pi + 1} / ${photos.length}`;
  } else {
    img.hidden = true; $("#vEmpty").hidden = false;
    $("#vCap").textContent = ""; $("#vCount").textContent = "";
  }
  $("#vPrev").disabled = $("#vNext").disabled = photos.length < 2;
  $("#vThumbs").innerHTML = photos.map((p, i) => `<button data-i="${i}" class="${i === V.pi ? "on" : ""}"><img src="${esc(p.src)}" alt="" loading="lazy"></button>`).join("");
  $$("#vThumbs button").forEach((el) => el.addEventListener("click", () => { V.pi = +el.dataset.i; renderViewer(); }));
  // 다음 사진 미리 받기
  if (photos[V.pi + 1]) new Image().src = photos[V.pi + 1].src;
}

function stepPhoto(d) {
  const photos = S.floors[V.id]?.floors[V.fi]?.photos || [];
  if (photos.length < 2) return;
  V.pi = (V.pi + d + photos.length) % photos.length;
  renderViewer();
}
function stepFloor(d) {
  const n = S.floors[V.id]?.floors.length || 0;
  const next = V.fi + d;
  if (next < 0 || next >= n) return;
  V.fi = next; V.pi = 0; renderViewer();
}
function closeViewer() { $("#viewer").hidden = true; document.body.style.overflow = ""; }

function initViewer() {
  $("#vClose").addEventListener("click", closeViewer);
  $("#viewer").addEventListener("click", (e) => { if (e.target.id === "viewer") closeViewer(); });
  $("#vPrev").addEventListener("click", () => stepPhoto(-1));
  $("#vNext").addEventListener("click", () => stepPhoto(1));
  document.addEventListener("keydown", (e) => {
    if ($("#viewer").hidden) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") stepPhoto(-1);
    else if (e.key === "ArrowRight") stepPhoto(1);
    else if (e.key === "ArrowUp") { e.preventDefault(); stepFloor(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); stepFloor(-1); }
  });
  let x0 = null;
  const stage = $("#vStage");
  stage.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) stepPhoto(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

/* ---------------- 탭 / 모바일 시트 ---------------- */
function switchTab(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-body").forEach((el) => (el.hidden = el.id !== `tab-${name}`));
  if (name === "bus") { renderBus(); }
  if (name === "weather") { renderWeather(); }
  $("#panel").classList.remove("min");
}

function initUI() {
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#grip").addEventListener("click", () => {
    const p = $("#panel");
    if (p.classList.contains("max")) { p.classList.remove("max"); p.classList.add("min"); }
    else if (p.classList.contains("min")) p.classList.remove("min");
    else p.classList.add("max");
    setTimeout(() => { S.map?.invalidateSize(); S.illo?.invalidateSize(); }, 250);
  });
  $("#busRefresh").addEventListener("click", () => { renderBus(); toast("현재 시각 기준으로 다시 계산했어요"); });
  $("#locate").addEventListener("click", (e) => { e.currentTarget.blur(); locateMe(); });
  // 지도를 길게 누르거나(휴대폰) 우클릭(PC)하면 그 자리를 내 위치로 지정
  S.map?.on("contextmenu", (e) => {
    const ll = [e.latlng.lat, e.latlng.lng];
    const box = document.createElement("div");
    box.innerHTML = `<button class="primary" style="font-size:13px">📍 여기를 내 위치로</button>`;
    const pop = L.popup({ closeButton: false, offset: [0, -4] }).setLatLng(e.latlng).setContent(box).openOn(S.map);
    box.querySelector("button").onclick = () => { S.map.closePopup(pop); setManualPos(ll); };
  });
}

/* ---------------- 다크 / 라이트 모드 ---------------- */
const ICON_MOON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const ICON_SUN = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>`;
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function applyTheme(t, save = false) {
  document.documentElement.dataset.theme = t;
  if (save) store.set("cg_theme", t);
  const btn = $("#themeBtn");
  // 라이트일 땐 달(누르면 다크), 다크일 땐 해(누르면 라이트)
  btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  btn.setAttribute("aria-label", t === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
  btn.title = btn.getAttribute("aria-label");
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0b1220" : "#1d4ed8";
  S.three?.setTheme(t);
}
function initTheme() {
  applyTheme(currentTheme());
  $("#themeBtn").addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark", true));
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => { if (!store.get("cg_theme", null)) applyTheme(e.matches ? "dark" : "light"); });
}

/* ---------------- 시작 ---------------- */
(async function main() {
  initTheme();
  await loadData();
  initMap();
  initUI();
  initSearch();
  renderCats();
  renderList();
  initEdit();
  await initAI({
    S, search, facilityQuery, FACILITY, insideItems, showPins, select, routeTo, routeEstimate, openViewer, switchTab, openPanel, toast,
    busSnapshot, upcoming, waitText, shuttleStatus, weatherSnapshot, weatherAnswer, wmo, rainSoon, localAnswer,
  });
  // ✦AI 버튼: 지도 앱 ↔ AI 전용 대시보드 전환
  $("#aiBtn").addEventListener("click", (e) => { e.currentTarget.blur(); aiOpen() ? closeAI() : openAI("home"); });
  $("#q").addEventListener("focus", () => { if (aiOpen()) closeAI(); }); // 지도 검색을 쓰면 지도 화면으로
  initViewer();
  S.view = "map";
  $$(".view-toggle button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  if (FEATURES.bus) {
    initBus();
  } else {
    $('.tabs [data-tab="bus"]').hidden = true;
  }
  if (FEATURES.weather) {
    loadWeather().then(renderDash);
    setInterval(() => { if (!document.hidden) loadWeather().then(renderDash); }, 10 * 60 * 1000);
    $("#wxChip").addEventListener("click", () => toast(weatherAnswer().replace(/\[\[WX\]\]/, ""), 5000));
    $("#wxRefresh").addEventListener("click", () => { loadWeather(); toast("날씨를 새로 받았어요"); });
  } else {
  }
  const wxTab = $('.tabs [data-tab="weather"]'); if (wxTab) wxTab.hidden = true;
  fetch("data/campus3d.json").then((r) => r.json()).then((fc) => { S.campus3d = fc; S.graph = buildGraph(fc); }).catch(() => {});
  $("#pinBar button").addEventListener("click", () => clearPins());
  $("#routeBar .x").addEventListener("click", clearRoute);
  $("#routeFrom").addEventListener("click", () => startPick("📍 출발할 곳을 지도에서 눌러 주세요", (ll) => setManualPos(ll, true)));
  $("#pickBar button").addEventListener("click", cancelPick);
  $("#panelClose").addEventListener("click", (e) => { e.currentTarget.blur(); closePanel(); });
  $("#panelOpen").addEventListener("click", (e) => {
    e.currentTarget.blur();
    openPanel();
    switchTab("buildings");
    $("#detail").hidden = true;          // 이전 건물 상세(✕) 대신 바로 건물 목록
    $("#tab-buildings").scrollTop = 0;
  });
  $$("#quickFind button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.q === "bus") return switchTab("bus");
    const fq = facilityQuery(b.dataset.q);
    if (fq?.hits.length) { showPins(fq.hits.map((x) => x.id), fq.label); closePanelOnMobile(); }
  }));
  $("#gateBtn")?.addEventListener("click", () => { showPins(["n114"]); closePanelOnMobile(); });
  loadOsm(false);
  const params = new URLSearchParams(location.search);
  if (params.get("view") === "3d") setView("3d");
  const deep = params.get("b");
  if (deep) select(deep);
  else { switchTab("buildings"); openAI("home"); } // 첫 화면 = AI 비서 대시보드
  if (params.get("ask")) aiAsk(params.get("ask"));
  if (deep && params.get("f")) openViewer(deep, params.get("f"));
})();
