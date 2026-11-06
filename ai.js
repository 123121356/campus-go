/* 캠퍼스GO AI — 에이전트(도구 호출) + 대시보드 + 시간표 + 커뮤니티/실시간 제보
   모델(Gemini)이 도구를 고르면, 도구는 이 브라우저에서 앱 데이터(지도·시간표·버스·공지·제보)로 실행된다.
   AI 서버가 안 되면 같은 도구를 쓰는 규칙 기반 비서로 자동 전환된다. */

let A; // app.js 가 넘겨주는 함수·상태 묶음
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
// (학식 식단 링크 안내는 삭제함)
const pad = (n) => String(n).padStart(2, "0");
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dday = (dateStr) => { const t = new Date(dateStr + "T00:00:00"), n = new Date(ymd(new Date()) + "T00:00:00"); return Math.round((t - n) / 864e5); };
const ddayText = (n) => (n === 0 ? "D-day" : n > 0 ? `D-${n}` : "지남");
const uid = () => Math.random().toString(36).slice(2, 9);

const D = {
  tt: [],        // 시간표 [{id,name,day(0-6),start,end,bid,room,place}]
  posts: [],     // 커뮤니티 [{id,type,title,body,at,done}]
  reports: [],   // 실시간 제보 [{place,level,note,at}]
  school: null,  // 공지 {notices:{general,academic,scholarship,events}, fetchedAt, source}
  schoolLive: false,
  cal: null,     // 학사일정
  convo: [],     // Gemini 대화 기록
  busy: false,
  mode: "",      // "gemini" | "local"
};
const save = () => { store.set("cg_tt", D.tt); if (!D.shared) { store.set("cg_posts", D.posts); store.set("cg_reports", D.reports); } };

/* ================= 커뮤니티·제보 공유 (서버 /api/community) =================
   서버에 공유 저장소가 연결돼 있으면 모든 사용자가 같은 글·제보를 봄(D.shared=true).
   없거나 실패하면 예전처럼 이 기기(localStorage)에만 저장. */
D.shared = false;
D.me = (() => { let t = store.get("cg_me", ""); if (!/^[a-z0-9]{8,40}$/i.test(t)) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set("cg_me", t); } return t; })();
async function commApi(body) {
  const r = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ me: D.me, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
// 메신저 알림 서버 (api/notify)
const chName = (c) => (/disc|디스/i.test(c || "") ? "discord" : /tele|텔레/i.test(c || "") ? "telegram" : "");
async function notifyApi(body) {
  try {
    const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ me: D.me, ...body }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || `서버 오류 ${r.status}`, ...j };
  } catch (e) { return { error: "알림 서버에 연결하지 못했어요" }; }
}
// 시간표가 바뀌면 메신저 구독(수업 알림)에 저장된 시간표도 바꿈
const syncSubsTT = () => { if (store.get("cg_hasSubs", false)) notifyApi({ kind: "tt", tt: D.tt }); };
async function syncComm() {
  try {
    const r = await fetch(`/api/community?me=${encodeURIComponent(D.me)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!j.shared) throw new Error("not shared");
    if (!D.shared) { // 처음 연결될 때: 이 기기에만 있던 내 글·제보를 서버로 올림
      D.shared = true;
      const localPosts = store.get("cg_posts", []), localReps = store.get("cg_reports", []);
      if (localPosts.length || localReps.length) {
        for (const p of localPosts.slice(0, 20).reverse()) await commApi({ kind: "post", post: p }).catch(() => {});
        for (const x of localReps.filter((x) => Date.now() - x.at < 3 * 3600000)) await commApi({ kind: "report", report: x }).catch(() => {});
        store.set("cg_posts", []); store.set("cg_reports", []);
        return syncComm();
      }
    }
    D.posts = j.posts || [];
    D.reports = (j.reports || []).slice().sort((a, b) => a.at - b.at);
  } catch {
    D.shared = false;
  }
  renderComm(); renderDash();
}

/* ================= 장소 해석 ================= */
function floorsOf(b) { const m = String(b.floorsText || "").match(/지상\s*(\d+)/); return m ? +m[1] : 0; }
function roomFloor(room, b) {
  const r = String(room || "").match(/(\d{3,4})/);
  if (!r) return null;
  const n = r[1];
  if (n.length === 4) return floorsOf(b) >= 10 || !b ? +n.slice(0, 2) : +n[0];
  return +n[0];
}
// "5공학관 301호", "5공 301", "도서관" → { b, room }
function resolvePlace(text) {
  const t = String(text || "");
  const room = (t.match(/(\d{3,4})\s*호?/) || [])[1] || "";
  let q = t.replace(/(\d{3,4})\s*호?/, " ").replace(/(\d)\s*공(?!학)/, "$1공학관").replace(/[()]/g, " ").trim();
  let b = null;
  for (const w of [q, ...q.split(/\s+/)].filter((x) => x && x.length >= 2)) {
    const hit = A.search(w.replace(/(으로|로|까지|에서|에|을|를|이|가)$/, ""))[0];
    if (hit) { b = hit; break; }
  }
  if (!b && room) { // 시간표에 같은 호실이 있으면 그 건물
    const c = D.tt.find((x) => x.room === room && x.bid);
    if (c) b = A.S.buildings.find((x) => x.id === c.bid);
  }
  return { b, room };
}
function floorGuide(b, room) {
  const f = roomFloor(room, b);
  if (!b) return null;
  const fl = f ? `${f}층` : null;
  const inside = (b.inside || []).filter((r) => fl && r.label.includes(fl.replace("층", "")) && /층/.test(r.label)).flatMap((r) => r.items);
  const photo = fl && A.S.floors[b.id]?.floors?.some((x) => x.label === fl);
  return { floor: fl, text: fl ? (f === 1 ? `${room}호는 1층이에요. 출입구로 들어가면 같은 층이에요.` : `${room}호는 ${fl}이에요. 1층 출입구로 들어가 계단이나 엘리베이터로 ${fl}까지 올라가세요.`) : null, sameFloor: inside, photo };
}

/* ================= 데이터 불러오기 ================= */
async function loadSchool() {
  // 매일 학습한 누적 지식베이스 (tools/learn-school.mjs 가 만듦). 없으면 그냥 넘어감
  if (!D.kb) D.kb = await fetch("data/knowledge.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 15000);
    const r = await fetch("api/school", { signal: ctl.signal });
    const j = await r.json();
    if (!r.ok || !j.notices) throw new Error(j.error);
    D.school = j; D.schoolLive = true;
  } catch {
    D.school = await fetch("data/school.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    D.schoolLive = false;
  }
  renderDash();
}
// 지식베이스에서 AI가 정리한 필드(요약·마감일·대상·키워드)를 붙여 줌
const kbMap = () => (D.kbMap ||= new Map((D.kb?.posts || []).map((p) => [p.url, p])));
const enrich = (x, k) => { const p = kbMap().get(x.url); return p ? { ...p, ...x, board: k || x.board, body: p.body || x.body, ai: p.ai } : { ...x, board: k || x.board }; };
const allNotices = () => Object.entries(D.school?.notices || {}).flatMap(([k, l]) => l.map((x) => enrich(x, k)));
// 검색용: 최신 공지 + 지금까지 매일 학습해 쌓인 과거 공지 전체
function knownNotices() {
  const live = allNotices(), seen = new Set(live.map((x) => x.url));
  return [...live, ...(D.kb?.posts || []).filter((p) => !seen.has(p.url))];
}
// 제목/본문의 "~11/13", "~ 11. 13." 같은 마감일 추출 (AI가 정리한 마감일이 있으면 그걸 우선)
function deadlineOf(n) {
  const ai = n.ai?.deadline || n.deadline;
  if (/^\d{4}-\d\d-\d\d$/.test(ai || "")) return ai;
  const txt = `${n.title} ${n.body || ""}`;
  const y = new Date().getFullYear();
  let m = txt.match(/~\s*(\d{1,2})\s*[./]\s*(\d{1,2})/);
  if (!m) m = txt.match(/(?:마감|기한|기간|까지)[^0-9]{0,12}(?:\d{4}\.\s*)?(\d{1,2})\.\s*(\d{1,2})\./);
  if (!m) return null;
  const d = `${y}-${pad(m[1])}-${pad(m[2])}`;
  return isNaN(new Date(d)) ? null : d;
}

/* ================= 혼잡도 추정 ================= */
function estimate(kind) {
  const m = nowMin(), wd = new Date().getDay();
  const weekend = wd === 0 || wd === 6;
  if (kind === "식당") {
    if (weekend) return { level: "여유", why: "주말" };
    if (m >= 690 && m <= 780) return { level: "혼잡", why: "점심 피크(11:30~13:00)" };
    if ((m >= 660 && m < 690) || (m > 780 && m <= 810)) return { level: "보통", why: "점심 전후" };
    if (m >= 1050 && m <= 1110) return { level: "보통", why: "저녁 시간" };
    return { level: "여유", why: "식사 시간이 아님" };
  }
  if (kind === "도서관") {
    const exam = (D.cal?.events || []).some((e) => /시험 종료일|종강/.test(e.title) && dday(e.start) >= 0 && dday(e.start) <= 14);
    if (exam) return { level: "혼잡", why: "시험 2주 전 기간" };
    if (weekend) return { level: "여유", why: "주말" };
    return m >= 780 && m <= 1260 ? { level: "보통", why: "오후·저녁 시간" } : { level: "여유", why: "이용이 적은 시간" };
  }
  if (kind === "버스") return m >= 1020 && m <= 1110 && !weekend ? { level: "혼잡", why: "하교 시간" } : { level: "보통", why: "평상시" };
  return null;
}
const kindOf = (p) => (/식당|학식|푸드|밥|카페/.test(p) ? "식당" : /도서관|열람|좌석|스터디/.test(p) ? "도서관" : /버스|정류장|셔틀/.test(p) ? "버스" : "기타");

/* ================= 도구 ================= */
const TOOLS = {
  async find_place({ query }) {
    const q = String(query || "");
    if (/화장실|toilet|restroom/i.test(q)) return { note: "화장실 위치 데이터는 아직 없어요. 강의동·도서관·학생회관 등 큰 건물은 층마다 있는 편이니 가까운 건물 1층을 이용하세요.", places: [] };
    const fq = A.facilityQuery(q);
    if (fq?.hits.length) {
      A.showPins(fq.hits.map((b) => b.id), fq.label); mapAct();
      return { facility: fq.label, places: fq.hits.map((b) => ({ building: b.name, where: (b.inside || []).filter((r) => r.items.some((it) => A.FACILITY.find((f) => f.label === fq.label).match.test(it))).map((r) => `${r.label}: ${r.items.join(", ")}`).join(" / ") })), shownOnMap: true };
    }
    const hits = A.search(q).slice(0, 4);
    if (!hits.length) { const { b } = resolvePlace(q); if (b) hits.push(b); }
    if (!hits.length) return { places: [], note: "일치하는 장소가 없어요" };
    A.showPins(hits.map((b) => b.id)); mapAct();
    return { places: hits.map((b) => ({ building: b.name, floors: b.floorsText || "", inside: (b.inside || []).map((r) => `${r.label}: ${r.items.join(", ")}`) })), shownOnMap: true };
  },

  async navigate({ destination, room }) {
    const p = resolvePlace(`${destination || ""} ${room || ""}`);
    if (!p.b) return { error: "어느 건물인지 모르겠어요. 건물 이름을 알려 주세요.", knownRooms: D.tt.filter((c) => c.room).map((c) => `${c.name}: ${c.place}`) };
    const r = await A.routeTo(p.b.id);
    const g = p.room ? floorGuide(p.b, p.room) : null;
    const arrive = new Date(Date.now() + (r?.mins || 0) * 60000);
    act(`🗺 지도에서 경로 보기`, () => { closeAI(); A.routeTo(p.b.id); });
    if (g?.photo) act(`🏢 ${p.b.name} ${g.floor} 사진`, () => A.openViewer(p.b.id, g.floor));
    return {
      to: p.b.name + (p.room ? ` ${p.room}호` : ""), from: r?.startName || "정문", distanceM: r ? Math.round(r.meters / 10) * 10 : null,
      walkMinutes: r?.mins ?? null, arriveAt: hm(arrive), floorGuide: g?.text || null, sameFloorFacilities: g?.sameFloor || [],
      routeDrawnOnMap: true, note: r?.startName === "정문" ? "현재 위치를 몰라 정문에서 출발하는 경로예요. 지도의 '출발지 바꾸기'로 바꿀 수 있어요." : "",
    };
  },

  async get_schedule({ day } = {}) {
    if (!D.tt.length) return { classes: [], note: "등록된 시간표가 없어요. '월 9시 자료구조 5공학관 301호 추가해줘'처럼 말하거나 시간표 사진을 올려 주세요." };
    const today = new Date().getDay();
    let d = today;
    if (day === "tomorrow" || /내일/.test(day || "")) d = (today + 1) % 7;
    else if (day && DAYS.includes(String(day)[0]) && day !== "today") d = DAYS.indexOf(String(day)[0]);
    const list = D.tt.filter((c) => c.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
    const out = { day: DAYS[d] + "요일", classes: list.map((c) => ({ name: c.name, time: `${c.start}~${c.end}`, place: c.place || "장소 미입력" })) };
    if (d === today) {
      const n = nextClass();
      if (n) {
        out.next = { name: n.c.name, start: n.c.start, place: n.c.place, minutesLeft: n.left, ongoing: n.ongoing };
        if (n.c.bid) { const e = A.routeEstimate(n.c.bid); if (e) { out.next.walkMinutes = e.mins; out.next.leaveBy = fromMin(toMin(n.c.start) - e.mins - 2); out.next.walkFrom = e.startName; } }
      } else out.next = null;
    }
    out.freeTime = gaps(list).map((g) => ({ from: g.from, to: g.to, minutes: g.min }));
    if (out.freeTime.length || /공강/.test(day || "")) out.ideasForFreeTime = freeIdeas();
    return out;
  },

  async add_classes({ classes }) {
    const added = [];
    for (const c of classes || []) {
      const day = DAYS.indexOf(String(c.day || "").trim()[0]);
      const start = normTime(c.start);
      if (day < 0 || !start || !c.name) continue;
      const end = normTime(c.end) || fromMin(toMin(start) + 75);
      const p = resolvePlace(c.place || "");
      const item = { id: uid(), name: String(c.name).slice(0, 40), day, start, end, bid: p.b?.id || "", room: p.room, place: [p.b?.name, p.room && p.room + "호"].filter(Boolean).join(" ") || String(c.place || "") };
      D.tt = D.tt.filter((x) => !(x.day === day && x.start === start));
      D.tt.push(item); added.push(`${DAYS[day]} ${start}~${end} ${item.name}${item.place ? ` (${item.place})` : ""}`);
    }
    save(); renderTT(); renderDash(); if (added.length) syncSubsTT();
    if (added.length) act("🗓 내 시간표 보기", () => aiPage("tt"));
    return { added, count: added.length, total: D.tt.length };
  },

  async remove_class({ name }) {
    const before = D.tt.length;
    D.tt = D.tt.filter((c) => !c.name.includes(String(name || "~")));
    save(); renderTT(); renderDash(); syncSubsTT();
    return { removed: before - D.tt.length };
  },

  async get_bus({ direction } = {}) {
    const snap = A.busSnapshot();
    if (direction && snap.directions[direction]) snap.directions = { [direction]: snap.directions[direction] };
    snap.shuttlePosition = shuttlePos();
    act("🚌 버스 시간표", () => { closeAI(); A.switchTab("bus"); });
    return snap;
  },

  async get_weather() { return A.weatherSnapshot(); },

  /* ----- 요즘 화제 (커뮤니티·검색 트렌드를 주기적으로 학습한 data/trends.json) ----- */
  async get_trends({ category = "", query = "" } = {}) {
    if (!D.trends) D.trends = await fetch("data/trends.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const j = D.trends;
    if (!j?.topics?.length) return { note: "아직 학습된 화제가 없어요 (tools/learn-trends.mjs 실행 필요)" };
    const cat = String(category || "").toLowerCase(), q = String(query || "").replace(/\s+/g, "");
    const list = j.topics.filter((t) => (!cat || cat === "all" || t.category === cat) && (!q || `${t.title}${t.summary}`.replace(/\s+/g, "").includes(q))).slice(0, 10);
    return {
      updatedAt: j.updatedAt, basis: "공개 커뮤니티 제목·검색 트렌드를 AI가 주제로 요약한 것 (사실 확인 안 됨, 분위기 참고용)",
      topics: list.map((t) => ({ title: t.title, category: t.category, summary: t.summary, from: t.sources.map((s) => j.sourceLabels?.[s] || s), heat: t.heat, daysTrending: t.days || 1, fading: !!t.cooling })),
    };
  },

  /* ----- 메신저(텔레그램·디스코드)로 보내기 ----- */
  async messenger_link({ channel = "telegram", webhook = "" } = {}) {
    return notifyApi({ kind: "link", channel: /disc|디스/i.test(channel) ? "discord" : "telegram", webhook });
  },
  async send_message({ channel = "", text = "" } = {}) {
    return notifyApi({ kind: "send", channel: chName(channel), text });
  },
  async subscribe(a = {}) {
    const schedule = { type: a.schedule_type, time: a.time, days: a.days, minutes: a.minutes, hours: a.hours, at: a.at };
    const r = await notifyApi({ kind: "subscribe", channel: chName(a.channel), topics: a.topics, schedule, text: a.text, filter: a.filter, title: a.title, preview: /^(y|yes|true|네|응)/i.test(String(a.preview || "")), tt: D.tt });
    if (r.ok) store.set("cg_hasSubs", true);
    return r;
  },
  async my_subscriptions({ action = "list", id = "", all = "" } = {}) {
    if (action === "cancel") return notifyApi({ kind: "cancel", id, all: /^(y|yes|true|모두|전부)/i.test(String(all)) });
    const r = await fetch(`/api/notify?me=${encodeURIComponent(D.me)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || `서버 오류 ${r.status}` };
  },

  async search_school_info({ query = "", category = "all" } = {}) {
    const words = String(query).toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2 && !/공지|안내|알려|있어|뭐|어떤|해줘|요약/.test(w));
    const cat = { notice: ["general"], academic: ["academic"], scholarship: ["scholarship"], event: ["events"] }[category];
    const score = (t) => words.reduce((s, w) => s + (t.includes(w) ? 2 : 0), 0);
    let notices = [], calendar = [];
    if (category !== "calendar") {
      // 제목·AI키워드 일치는 가산점, 본문 일치는 기본점 → 매일 쌓인 과거 공지까지 검색
      const sc = (n) => score(`${n.title} ${(n.ai?.keywords || []).join(" ")}`.toLowerCase()) * 2 + score(`${n.ai?.summary || ""} ${n.ai?.target || ""} ${n.body || ""}`.toLowerCase());
      notices = knownNotices().filter((n) => (!cat || cat.includes(n.board)) && !/학식|식단|메뉴|wkmenu/.test(`${n.title} ${n.url || ""}`)) // 학식 관련 학습 링크는 안내하지 않음
        .map((n) => ({ n, s: words.length ? sc(n) : 1 }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (b.n.date || "").localeCompare(a.n.date || "")).slice(0, 6)
        .map(({ n }) => { const dl = deadlineOf(n); return { type: D.school?.labels?.[n.board] || D.kb?.labels?.[n.board] || n.board, campus: n.campus, title: n.title, posted: n.date, deadline: dl ? `${dl} (${ddayText(dday(dl))})` : null, target: n.ai?.target || null, howToApply: n.ai?.how || null, contact: n.tel || "", summary: n.ai?.summary && n.ai.by !== "rule" ? `${n.ai.summary} / 원문 앞부분: ${(n.body || "").slice(0, 200)}` : (n.body || "").slice(0, 350), attachments: n.files?.length ? n.files : undefined, url: n.url }; });
    }
    if (["all", "academic", "calendar", "scholarship"].includes(category)) {
      calendar = (D.cal?.events || []).map((e) => ({ e, s: words.length ? score(e.title.toLowerCase()) : 1, d: dday(e.end) }))
        .filter((x) => x.s > 0 && x.d >= -3).sort((a, b) => b.s - a.s || a.e.start.localeCompare(b.e.start)).slice(0, 6)
        .map(({ e }) => ({ title: e.title, campus: e.campus, period: e.start === e.end ? e.start : `${e.start} ~ ${e.end}`, dday: ddayText(dday(e.start)) }));
    }
    if (!notices.length && !calendar.length && words.length) return TOOLS.search_school_info({ query: "", category });
    if (notices[0]?.url) act("📄 공지 원문 열기", () => window.open(notices[0].url, "_blank", "noopener"));
    const kbNote = D.kb?.stats ? ` · 매일 학습 지식베이스 누적 ${D.kb.stats.total}건(최종 ${String(D.kb.updatedAt || "").slice(0, 10)})` : "";
    return { source: (D.school ? `${D.school.source}${D.schoolLive ? " · 실시간 수집" : " · 저장본 " + String(D.school.fetchedAt || "").slice(0, 10)}` : "공지 데이터를 불러오지 못함") + kbNote, today: ymd(new Date()), notices, calendar };
  },

  async campus_status({ place = "" } = {}) {
    const since = Date.now() - 90 * 60000;
    const rep = D.reports.filter((r) => r.at > since && (!place || r.place.includes(place) || place.includes(r.place)))
      .sort((a, b) => b.at - a.at).slice(0, 8).map((r) => ({ place: r.place, level: r.level, note: r.note || "", minutesAgo: Math.round((Date.now() - r.at) / 60000), source: "제보" }));
    const kinds = place ? [kindOf(place)] : ["식당", "도서관", "버스"];
    const est = kinds.map((k) => ({ k, e: estimate(k) })).filter((x) => x.e).map((x) => ({ place: x.k, level: x.e.level, why: x.e.why, source: "시간대 추정" }));
    return { reports: rep, estimates: est, note: "실시간 센서·좌석 시스템 연동 데이터는 없어요. 제보와 시간대 추정만 있어요.", libraryNote: /도서관|좌석|열람/.test(place) ? "도서관 좌석 현황은 학교 좌석배정 시스템에서 확인하세요(앱 미연동)." : undefined };
  },

  async report_status({ place, level, note = "" }) {
    const lv = /혼잡|많|붐/.test(level) ? "혼잡" : /여유|한산|적/.test(level) ? "여유" : "보통";
    const rep = { place: String(place).slice(0, 30), level: lv, note: String(note).slice(0, 80), at: Date.now() };
    D.reports.push(rep);
    D.reports = D.reports.slice(-200); save(); renderDash(); renderComm();
    let sharedOk = false;
    if (D.shared) { try { await commApi({ kind: "report", report: rep }); sharedOk = true; syncComm(); } catch {} }
    return { saved: true, place, level: lv, visibleTo: sharedOk ? "모든 사용자" : "이 기기만" };
  },

  async community({ action = "list", type = "", title = "", body = "" } = {}) {
    if (action === "post") {
      if (!title && !body) return { error: "제목이나 내용이 필요해요" };
      const p = { id: uid(), type: normType(type || title + body), title: String(title || body).slice(0, 60), body: String(body).slice(0, 400).replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "(번호 가림)"), at: Date.now(), done: false };
      let sharedOk = false;
      if (D.shared) {
        try { const r = await commApi({ kind: "post", post: p }); D.posts.unshift(r.post); sharedOk = true; syncComm(); }
        catch { D.posts.unshift(p); }
      } else D.posts.unshift(p);
      save(); renderComm(); renderDash();
      act("👥 커뮤니티 보기", () => aiPage("comm"));
      return { posted: true, type: p.type, title: p.title, visibleTo: sharedOk ? "모든 사용자" : "이 기기만" };
    }
    const t = type ? normType(type) : "";
    const list = D.posts.filter((p) => !t || p.type === t).slice(0, 10).map((p) => ({ type: p.type, title: p.title, body: p.body.slice(0, 120), ago: agoText(p.at), done: p.done }));
    act("👥 커뮤니티 보기", () => aiPage("comm"));
    const ev = allNotices().filter((n) => n.board === "events").slice(0, 3).map((n) => ({ title: n.title, posted: n.date, url: n.url }));
    return { posts: list, count: list.length, schoolEvents: ev, note: list.length ? "" : "아직 글이 없어요. 첫 글을 올려 보세요." };
  },

  async get_meals() {
    const places = A.S.buildings.filter((b) => A.insideItems(b).some((it) => /식당|푸드코트|카페|편의점/.test(it)))
      .map((b) => ({ building: b.name, has: A.insideItems(b).filter((it) => /식당|푸드코트|카페|편의점/.test(it)).join(", ") }));
    A.showPins(places.map((p) => A.S.buildings.find((b) => b.name === p.building)?.id), "식당"); mapAct();
    const today = ymd(new Date());
    const menus = D.posts.filter((p) => p.type === "학식메뉴" && ymd(new Date(p.at)) === today).map((p) => `${p.title} ${p.body}`.trim());
    const m = nowMin();
    return { places, congestion: estimate("식당"), todayMenusFromUsers: menus, officialMenu: { restaurant: "제5공학관 학생식당", note: "학식(학생식당)은 제5공학관에 있어요. 식단 링크는 안내하지 않아요." }, hours: m < 480 || m > 1140 ? "운영시간 공식 데이터 없음. 지금은 이른 아침/늦은 시간이라 대부분 닫혀 있을 수 있어요. 편의점(CU)은 확인 필요." : "운영시간 공식 데이터 없음(운영 여부 확인 필요)" };
  },
};

function normTime(s) {
  if (!s) return "";
  const t = String(s).replace(/\s/g, "");
  let m = t.match(/^(오전|오후)?(\d{1,2}):(\d{2})/); if (m) { let h = +m[2]; if (m[1] === "오후" && h < 12) h += 12; return `${pad(h)}:${m[3]}`; }
  m = t.match(/(오전|오후)?(\d{1,2})시(?:(\d{1,2})분|반)?/);
  if (m) { let h = +m[2]; if (m[1] === "오후" && h < 12) h += 12; if (!m[1] && h >= 1 && h <= 7) h += 12; return `${pad(h)}:${t.includes("반") ? "30" : pad(+(m[3] || 0))}`; }
  m = t.match(/^(\d{1,2})$/); if (m) { let h = +m[1]; if (h >= 1 && h <= 7) h += 12; return `${pad(h)}:00`; }
  return "";
}
const TYPES = ["분실물", "중고거래", "팀원모집", "동아리·행사", "주변정보", "학식메뉴"];
function normType(t) {
  t = String(t);
  if (/분실|잃어|주웠|습득/.test(t)) return "분실물";
  if (/중고|팔아|판매|삽니다|구매|나눔/.test(t)) return "중고거래";
  if (/팀원|모집|프로젝트|스터디/.test(t)) return "팀원모집";
  if (/동아리|행사|공연|축제|이벤트/.test(t)) return "동아리·행사";
  if (/학식|메뉴|식단/.test(t)) return "학식메뉴";
  return TYPES.includes(t) ? t : "주변정보";
}
const agoText = (at) => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };

function nextClass() {
  const d = new Date().getDay(), m = nowMin();
  const list = D.tt.filter((c) => c.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
  const on = list.find((c) => toMin(c.start) <= m && toMin(c.end) > m);
  const nx = list.find((c) => toMin(c.start) > m);
  if (nx) return { c: nx, left: toMin(nx.start) - m, ongoing: on ? on.name : null };
  if (on) return { c: on, left: 0, ongoing: on.name };
  return null;
}
// 공강 추천에 쓸 '실제' 장소·행사 (모델이 지어내지 않게 도구가 제공)
function freeIdeas() {
  const meal = estimate("식당"), lib = estimate("도서관");
  const ev = allNotices().filter((n) => n.board === "events" || /특강|프로그램|워크숍|세미나/.test(n.title)).filter((n) => /삼척|ALL/.test(n.campus)).slice(0, 2);
  return [
    { place: "도서관", what: "1층 카페·열람실·PC, 4층 그룹 스터디룸", congestion: `${lib.level} [시간대 추정]` },
    { place: "제5공학관 1층 학생식당·편의점", what: "식사(붐비기 전에)", congestion: `${meal.level} [시간대 추정]` },
    { place: "학생회관", what: "푸드코트·복사실(인쇄)·ATM·택배·서점" },
    { place: "그린에너지 연구관 10층 카페", what: "바다가 보이는 카페에서 휴식" },
    { place: "복합 스포츠센터", what: "헬스장·실내 트랙" },
    ...ev.map((n) => ({ event: n.title, posted: n.date, source: "학교 공지" })),
  ];
}
function gaps(list) {
  const out = [];
  for (let i = 0; i < list.length - 1; i++) {
    const a = toMin(list[i].end), b = toMin(list[i + 1].start);
    if (b - a >= 50) out.push({ from: list[i].end, to: list[i + 1].start, min: b - a, near: list[i].bid || list[i + 1].bid });
  }
  return out;
}
// 통학버스 추정 위치 (시간표상 운행 중인 편)
function shuttlePos() {
  const sh = A.S.bus?.shuttle;
  if (!sh || !A.shuttleStatus().runs) return { running: false, note: "오늘은 통학버스 운행이 없어요" };
  const m = nowMin();
  const live = sh.lines.flatMap((l) => l.runs.map((x) => ({ ...x, line: l.name }))).filter((x) => toMin(x.dep) <= m && toMin(x.arr) >= m);
  if (!live.length) return { running: false, note: "지금 운행 중인 통학버스가 없어요(시간표 기준)" };
  return { running: true, basis: "시간표 추정(GPS 아님)", buses: live.map((x) => ({ line: x.line, from: x.from, to: x.to, arriveAt: x.arr, minutesToArrive: toMin(x.arr) - m, progress: Math.round(((m - toMin(x.dep)) / Math.max(1, toMin(x.arr) - toMin(x.dep))) * 100) + "%" })) };
}

/* ================= 대화 화면 ================= */
let ACTS = [];
const act = (label, fn) => { if (!ACTS.some((a) => a.label === label)) ACTS.push({ label, fn }); };
const mapAct = () => act("🗺 지도에서 보기", closeAI);
const STEP_LABEL = { find_place: "📍 장소 찾는 중", navigate: "🧭 경로 계산 중", get_schedule: "🗓 시간표 확인", add_classes: "🗓 시간표에 등록", remove_class: "🗓 시간표 수정", get_bus: "🚌 버스 시간 확인", get_weather: "🌤 날씨 확인", search_school_info: "📢 학교 공지·학사일정 검색", campus_status: "📊 현황 확인", report_status: "📝 제보 저장", community: "💬 커뮤니티", get_meals: "🍚 학식·식당 확인" };

function md(text) {
  return esc(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[^"])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">원문</a>')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "· ").replace(/\n{3,}/g, "\n\n").replace(/\n/g, "<br>");
}
function addUser(text, img) {
  const div = document.createElement("div");
  div.className = "msg me";
  div.innerHTML = (img ? `<img class="msg-img" src="${img}" alt="첨부 이미지"><br>` : "") + esc(text);
  $("#msgs").appendChild(div); scrollChat();
}
function botShell() {
  const div = document.createElement("div");
  div.className = "msg bot";
  div.innerHTML = `<div class="steps"></div><div class="txt"><span class="dots"><i></i><i></i><i></i></span></div>`;
  $("#msgs").appendChild(div); scrollChat();
  return div;
}
function addStep(div, name, args) {
  const s = document.createElement("span");
  s.className = "step";
  const hint = args?.destination || args?.query || args?.place || args?.day || "";
  s.textContent = `${STEP_LABEL[name] || "🔧 " + name}${hint ? ` · ${String(hint).slice(0, 18)}` : ""}`;
  div.querySelector(".steps").appendChild(s); scrollChat();
}
function finishBot(div, text) {
  // 예전 규칙 기반 답변의 태그도 처리 ([[MAP:id]] 등)
  const pins = [];
  text = String(text || "").replace(/\[\[MAP:([\w-]+)\]\]/g, (_, id) => { pins.push(id); return ""; }).replace(/\[\[ROUTE:([\w-]+)\]\]/g, (_, id) => { A.routeTo(id); return ""; })
    .replace(/\[\[PINLABEL:[^\]]*\]\]|\[\[WX\]\]|\[\[FLOOR:[^\]]*\]\]/g, "").replace(/\[\[BUS\]\]/g, () => { act("🚌 버스 시간표", () => { closeAI(); A.switchTab("bus"); }); return ""; }).trim();
  if (pins.length) { A.showPins(pins); pins.forEach((id) => { const b = A.S.buildings.find((x) => x.id === id); if (b) act(`📍 ${b.name}`, () => { closeAI(); A.select(id); }); }); }
  div.querySelector(".txt").innerHTML = md(text || "답을 만들지 못했어요. 다시 물어봐 주세요.");
  if (ACTS.length) {
    const row = document.createElement("div"); row.className = "acts";
    for (const a of ACTS) { const b = document.createElement("button"); b.className = "act"; b.textContent = a.label; b.onclick = a.fn; row.appendChild(b); }
    div.appendChild(row);
  }
  if (!div.querySelector(".steps").children.length) div.querySelector(".steps").remove();
  scrollChat();
}
const scrollChat = () => { const m = $("#msgs"); m.scrollTop = m.scrollHeight; };

/* ================= 에이전트 루프 ================= */
function profile() {
  return {
    now: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    role: store.get("cg_role", "재학생"), hasTimetable: D.tt.length > 0,
    location: A.S.manualPos ? "직접 지정한 캠퍼스 위치" : A.S.lastFix ? "GPS 위치 있음" : "",
  };
}
// 오래된 기록은 '사용자 텍스트로 시작하는 턴' 경계에서 자름 (도구 호출/결과 짝이 깨지지 않게)
function trimConvo() {
  const starts = D.convo.map((c, i) => (c.role === "user" && c.parts.some((p) => p.text || p.inlineData) ? i : -1)).filter((i) => i >= 0);
  if (starts.length > 8) D.convo = D.convo.slice(starts[starts.length - 8]);
  // 이미지 데이터는 마지막 턴에만 유지
  D.convo.forEach((c, i) => { if (i < D.convo.length - 1) c.parts = c.parts.map((p) => (p.inlineData ? { text: "(첨부했던 이미지)" } : p)); });
}
async function callAgent() {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch("api/agent", { signal: ctl.signal, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: D.convo, profile: profile() }) });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error || r.status), { code: j.code });
    return j;
  } finally { clearTimeout(t); }
}

export async function ask(text, image) {
  if (!$("#msgs")) return A?.askAI3D?.(text); // AI 대화는 3D AI 요정으로
  text = String(text || "").trim();
  if ((!text && !image) || D.busy) return;
  D.busy = true; ACTS = [];
  openAI(isMobile() ? "chat" : null);
  addUser(text || "(사진)", image?.url);
  const div = botShell();
  const parts = [];
  if (image) parts.push({ inlineData: { mimeType: image.mime, data: image.b64 } });
  parts.push({ text: text || "이 이미지를 보고 도와줘. 시간표라면 시간표에 등록해 줘." });
  const mark = D.convo.length;
  D.convo.push({ role: "user", parts });
  trimConvo();
  let answer = "";
  try {
    for (let step = 0; step < 7; step++) {
      const j = await callAgent();
      const content = { role: "model", parts: j.content.parts };
      D.convo.push(content);
      const calls = content.parts.filter((p) => p.functionCall);
      const said = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      if (!calls.length) { answer = said; break; }
      const responses = [];
      for (const p of calls) {
        const { name, args } = p.functionCall;
        addStep(div, name, args);
        let result;
        try { result = TOOLS[name] ? await TOOLS[name](args || {}) : { error: "없는 도구" }; } catch (e) { result = { error: String(e.message || e) }; }
        responses.push({ functionResponse: { name, response: { result } } });
      }
      D.convo.push({ role: "user", parts: responses });
    }
    D.mode = "gemini";
    if (!answer) answer = "필요한 정보를 모았어요. 위 버튼으로 확인해 보세요.";
  } catch (e) {
    // AI 서버가 안 되면: 같은 도구를 쓰는 규칙 기반 비서
    D.convo = D.convo.slice(0, mark);
    D.mode = "local";
    if (image) answer = "사진 인식은 AI 서버 연결이 필요해요. 지금은 연결이 안 돼서, '월 9시 자료구조 5공학관 301호 추가해줘'처럼 글로 알려 주세요.";
    else answer = await localAgent(text, div);
    D.convo.push({ role: "user", parts: [{ text }] }, { role: "model", parts: [{ text: answer }] });
  }
  finishBot(div, answer);
  $("#aiMode").textContent = D.mode === "gemini" ? "AI 에이전트(Gemini)가 도구로 실제 데이터를 확인해 답해요." : "기본 비서 모드 (AI 서버 미연결) — 같은 데이터로 답해요.";
  D.busy = false;
  renderDash();
}

/* ================= 규칙 기반 비서 (오프라인 대비) ================= */
async function localAgent(q, div) {
  const t = q.toLowerCase();
  const run = async (name, args) => { addStep(div, name, args); return TOOLS[name](args); };
  // 1) 시간표 등록: "월 9시 자료구조 5공학관 301호, 수 13:00~14:15 운영체제 5공 402호 추가해줘"
  if (/추가|등록|넣어/.test(q) && /[월화수목금토일]/.test(q) && /\d/.test(q)) {
    const classes = []; let lastDay = "";
    for (const seg of q.replace(/(시간표에?|추가해?줘?|등록해?줘?|넣어줘?)/g, " ").split(/[,，]|그리고|\n/)) {
      const dm = seg.match(/([월화수목금토일])(?:요일)?/);
      const day = dm ? dm[1] : lastDay;
      const T = "(오전|오후)?\\s*(\\d{1,2}(?::\\d{2}|\\s*시(?:\\s*\\d{1,2}\\s*분|\\s*반)?))";
      const tm = seg.match(new RegExp(T + "(?:\\s*[-~부터]+\\s*" + T + ")?"));
      if (!day || !tm) continue;
      lastDay = day;
      let rest = seg.replace(dm?.[0] || "", " ").replace(tm[0], " ").replace(/까지/g, " ").trim();
      const placeM = rest.match(/(\S*(?:관|동|센터|도서관)\S*|\d공)\s*(\d{3,4})?\s*호?|(\d{3,4})\s*호/);
      const name = (placeM ? rest.replace(placeM[0], " ") : rest).replace(/\s+/g, " ").trim() || "수업";
      classes.push({ name, day, start: (tm[1] || "") + tm[2], end: tm[4] ? (tm[3] || (tm[1] === "오후" ? "오후" : "")) + tm[4] : "", place: placeM?.[0] || "" });
    }
    if (classes.length) {
      const r = await run("add_classes", { classes });
      if (r.count) return `시간표에 ${r.count}개 등록했어요.\n· ${r.added.join("\n· ")}\n이제 "다음 수업 어디야?"라고 물어보면 길과 남은 시간을 알려 드려요.`;
    }
    return "형식을 이해하지 못했어요. 예: '월 9시 자료구조 5공학관 301호 추가해줘'";
  }
  // 2) 공강
  if (/공강|비는\s*시간|뭐\s*하지|시간\s*남/.test(t)) {
    const s = await run("get_schedule", {});
    const m = (q.match(/(\d+)\s*시간/) || [])[1];
    const ev = (await run("search_school_info", { query: "", category: "event" })).notices.slice(0, 1);
    const ideas = [
      "📚 도서관 1층 열람실·PC에서 과제 정리 (도서관)",
      "🍚 붐비기 전에 제5공학관 1층 학생식당에서 식사",
      "☕ 그린에너지 연구관 10층 바다가 보이는 카페에서 휴식",
      "💪 복합 스포츠센터 헬스장·실내 트랙",
    ];
    const g = s.freeTime?.[0];
    return `${g ? `오늘 공강은 ${g.from}~${g.to} (${g.minutes}분)이에요.` : m ? `${m}시간 공강이네요.` : "공강 시간을 알려면 시간표를 등록해 주세요."}\n이렇게 써 보세요:\n· ${ideas.join("\n· ")}${ev[0] ? `\n· 📢 학교 행사: ${ev[0].title}` : ""}\n식당 혼잡도: ${estimate("식당").level} [시간대 추정]`;
  }
  // 3) 수업·강의실 길안내
  const roomM = q.match(/(\d{3,4})\s*호/);
  if (roomM || /다음\s*수업|수업.*(어디|가야)|강의실/.test(t)) {
    let dest = q, s = null;
    if (!roomM || !resolvePlace(q).b) { s = await run("get_schedule", {}); if (s.next) dest = s.next.place || q; }
    const nav = await run("navigate", { destination: dest });
    if (nav.error) return s && !s.next ? (s.note || "오늘 남은 수업이 없어요.") : `${nav.error}${D.tt.length ? "" : "\n시간표를 등록하면 강의실 건물을 자동으로 찾아 드려요."}`;
    const left = (q.match(/(\d+)\s*분\s*뒤/) || [])[1] ?? s?.next?.minutesLeft;
    const lines = [`${nav.to}까지 걸어서 약 ${nav.walkMinutes}분(${nav.distanceM}m)이에요. 지도에 경로를 그렸어요.`];
    if (nav.floorGuide) lines.push(nav.floorGuide);
    if (left != null) lines.push(+left >= nav.walkMinutes ? `수업까지 ${left}분 남아서 여유 있게 도착해요 (도착 예상 ${nav.arriveAt}).` : `수업까지 ${left}분이라 ${nav.walkMinutes - left}분쯤 늦을 수 있어요. 서두르세요!`);
    if (nav.note) lines.push(nav.note);
    return lines.join("\n");
  }
  // 4) 장학금 / 학사 / 졸업 / 공지 / 행사
  if (/장학/.test(t)) {
    const r = await run("search_school_info", { query: q.replace(/장학금?/g, " 장학"), category: "scholarship" });
    const ns = r.notices.slice(0, 4);
    return ns.length ? `삼척·전체 캠퍼스 대상 장학 공지예요 [학교 공지]\n${ns.map((n) => `· ${n.title}${n.deadline ? ` — 마감 ${n.deadline}` : ""}`).join("\n")}\n성적·소득분위 같은 조건을 알려 주시면 맞는지 같이 볼게요. 최종 확인은 공지 원문·삼척학생지원과(033-570-6220)에서 해 주세요.` : "지금 찾은 장학 공지가 없어요.";
  }
  if (/졸업\s*요건|졸업\s*학점|졸업\s*조건/.test(t)) return "졸업 요건은 학과·입학년도마다 달라서 앱에 공식 데이터가 없어요.\n· K-Cloud > 학부생서비스 > 졸업(졸업사정 조회)에서 본인 이수 현황 확인\n· 학과 사무실에 졸업요건표 요청\n관련 학사공지가 있으면 '졸업 공지 찾아줘'라고 물어보세요.";
  if (/수강|계절|학점\s*교류|전과|복수|부전공|휴학|복학|학사|개강|종강|시험|성적|등록금/.test(t)) {
    const r = await run("search_school_info", { query: q, category: "academic" });
    const cal = r.calendar.slice(0, 3), ns = r.notices.slice(0, 3);
    return `${cal.length ? `[학사일정]\n${cal.map((c) => `· ${c.title}: ${c.period} (${c.dday})`).join("\n")}\n` : ""}${ns.length ? `[학교 공지]\n${ns.map((n) => `· ${n.title}${n.deadline ? ` — 마감 ${n.deadline}` : ""}`).join("\n")}` : ""}`.trim() || "관련 학사 정보를 찾지 못했어요.";
  }
  if (/행사|이벤트|동아리|축제|특강/.test(t) && !/올려|써줘|등록/.test(t)) {
    const r = await run("community", { action: "list", type: "동아리·행사" });
    const s = await run("search_school_info", { query: "", category: "event" });
    return `[학교 행사 공지]\n${s.notices.slice(0, 3).map((n) => `· ${n.title} (${n.posted})`).join("\n") || "· 없음"}\n[커뮤니티]\n${r.posts.slice(0, 3).map((p) => `· ${p.title}`).join("\n") || "· 아직 글이 없어요"}`;
  }
  if (/공지|소식|요약|새\s*글/.test(t)) {
    const r = await run("search_school_info", { query: q, category: "notice" });
    return `최근 삼척·전체 공지예요 [학교 공지]\n${r.notices.slice(0, 5).map((n) => `· ${n.title} (${n.posted})${n.deadline ? ` — 마감 ${n.deadline}` : ""}`).join("\n")}`;
  }
  // 5) 커뮤니티
  if (/분실|잃어|주웠|중고|팔아|팀원|모집|주변|맛집/.test(t)) {
    if (/올려|써줘|등록|글\s*써|게시/.test(t)) {
      const r = await run("community", { action: "post", type: q, title: q.replace(/(올려|써|등록|게시)\S*/g, "").trim().slice(0, 50), body: q });
      return `커뮤니티 '${r.type}'에 올렸어요. 연락은 전화번호 대신 커뮤니티 댓글이나 학과 단톡을 이용하세요.`;
    }
    const r = await run("community", { action: "list", type: q });
    return r.posts.length ? `${r.posts.map((p) => `· [${p.type}] ${p.title} (${p.ago})`).join("\n")}` : "아직 관련 글이 없어요. '분실물 올려줘: 도서관에서 검은 지갑 잃어버렸어요'처럼 말하면 대신 올려 드려요.";
  }
  // 6) 현황·학식·버스·날씨
  if (/혼잡|사람\s*많|붐비|좌석|자리\s*있|줄\s*길/.test(t)) {
    const r = await run("campus_status", { place: q.match(/식당|도서관|버스|카페|열람실/)?.[0] || "" });
    return `${r.reports.length ? `[제보]\n${r.reports.map((x) => `· ${x.place}: ${x.level} (${x.minutesAgo}분 전)${x.note ? " " + x.note : ""}`).join("\n")}\n` : ""}[시간대 추정]\n${r.estimates.map((x) => `· ${x.place}: ${x.level} — ${x.why}`).join("\n")}\n${r.libraryNote || r.note}`;
  }
  if (/학식|밥|메뉴|먹을|점심|저녁|식당|배고/.test(t)) {
    const r = await run("get_meals", {});
    return `먹을 곳이에요 (지도에 표시).\n${r.places.map((p) => `· ${p.building}: ${p.has}`).join("\n")}\n지금 식당: ${r.congestion.level} [시간대 추정 — ${r.congestion.why}]\n🍚 학식은 ${r.officialMenu.restaurant}이에요.${r.todayMenusFromUsers.length ? `\n오늘 메뉴 [제보]: ${r.todayMenusFromUsers.join(" / ")}` : ""}`;
  }
  if (/셔틀|통학|버스|bus/.test(t)) {
    const r = await run("get_bus", {});
    const ds = Object.values(r.directions).map((d) => `· ${d.label}: ${d.next.length ? d.next.map((x) => `${x.route}번 ${x.at}(${x.minutes}분 후)`).join(", ") : "오늘 남은 버스 없음"}`);
    const sp = r.shuttlePosition;
    return `${r.stop} [시간표 추정]\n${ds.join("\n")}\n통학버스: ${sp.running ? sp.buses.map((b) => `${b.line} ${b.from}→${b.to} 운행 중, ${b.minutesToArrive}분 후 도착 예상`).join(" / ") : sp.note}`;
  }
  if (/날씨|비\s*와|우산|추워|더워|미세먼지|기온/.test(t)) { addStep(div, "get_weather"); return A.weatherAnswer(); }
  // 7) 오늘 브리핑
  if (/추천.*일정|오늘.*(일정|뭐|브리핑)|하루/.test(t)) return briefing(div);
  // 8) 길·장소
  if (/가는\s*길|어떻게\s*가|길\s*알려|데려다/.test(t)) {
    const nav = await run("navigate", { destination: q.replace(/가는\s*길|어떻게\s*가\S*|길\s*알려\S*|데려다\S*/g, "") });
    if (!nav.error) return `${nav.to}까지 약 ${nav.walkMinutes}분(${nav.distanceM}m), ${nav.from}에서 출발하는 경로를 그렸어요.${nav.floorGuide ? "\n" + nav.floorGuide : ""}`;
  }
  const fp = await run("find_place", { query: q });
  if (fp.places?.length) return fp.facility ? `${fp.facility} 있는 곳이에요 (지도에 표시).\n${fp.places.map((p) => `· ${p.building}: ${p.where}`).join("\n")}` : fp.places.map((p) => `${p.building}${p.floors ? ` (${p.floors})` : ""}\n${p.inside.map((x) => "· " + x).join("\n")}`).join("\n");
  if (fp.note && /화장실/.test(q)) return fp.note;
  return A.localAnswer(q);
}

async function briefing(div) {
  const run = async (name, args) => { addStep(div, name, args); return TOOLS[name](args); };
  const s = await run("get_schedule", {});
  const w = A.weatherSnapshot();
  const sch = await run("search_school_info", { query: "", category: "all" });
  const lines = ["오늘 추천 일정이에요."];
  if (s.classes?.length) {
    lines.push(`🗓 수업: ${s.classes.map((c) => `${c.time.split("~")[0]} ${c.name}`).join(", ")}`);
    if (s.next) lines.push(`⏰ 다음: ${s.next.name} ${s.next.start}${s.next.leaveBy ? ` — ${s.next.leaveBy}엔 출발하세요(도보 ${s.next.walkMinutes}분)` : ""}`);
    if (s.freeTime?.length) lines.push(`☕ 공강 ${s.freeTime.map((g) => `${g.from}~${g.to}`).join(", ")}: 도서관에서 과제나 학식 먼저 먹기 추천`);
  } else lines.push("🗓 등록된 시간표가 없어요. 시간표 사진을 올리면 자동 등록해 드려요.");
  const soon = (D.cal?.events || []).filter((e) => dday(e.start) >= 0 && dday(e.start) <= 10).slice(0, 2);
  if (soon.length) lines.push(`📅 다가오는 학사일정: ${soon.map((e) => `${e.title}(${ddayText(dday(e.start))})`).join(", ")}`);
  const due = allNotices().map((n) => ({ n, d: deadlineOf(n) })).filter((x) => x.d && dday(x.d) >= 0 && dday(x.d) <= 7).slice(0, 2);
  if (due.length) lines.push(`📢 마감 임박: ${due.map((x) => `${x.n.title.slice(0, 26)}(${ddayText(dday(x.d))})`).join(", ")}`);
  if (w?.now) lines.push(`🌤 ${w.now.desc} ${Math.round(w.now.temp)}°C${A.rainSoon() ? " · ☂️ 비 예보, 우산 챙기세요" : ""}`);
  const meal = estimate("식당"); lines.push(`🍚 식당 지금 ${meal.level} [추정] — 점심은 11:30 전이나 13:00 이후가 덜 붐벼요.`);
  void sch;
  return lines.join("\n");
}

/* ================= 대시보드 ================= */
function card(title, body, cls = "") { return `<section class="dcard ${cls}"><h4>${title}</h4>${body}</section>`; }
export function renderDash() {
  const el = $("#dash"); if (!el || !A) return;
  const w = A.S.wx?.wx?.current;
  const wx = w ? `<div class="big">${A.wmo(w.weather_code)[0]} ${Math.round(w.temperature_2m)}°</div><div class="muted">${esc(A.wmo(w.weather_code)[1])} · 체감 ${Math.round(w.apparent_temperature ?? w.temperature_2m)}°${A.rainSoon() ? " · ☂️ 비 예보" : ""}</div>` : `<div class="muted">불러오는 중…</div>`;
  const n = nextClass();
  let cls = `<div class="muted">시간표가 없어요</div><button class="link" data-ask="시간표 등록하는 법 알려줘">＋ 시간표 등록</button>`;
  if (n) { const e = n.c.bid ? A.routeEstimate(n.c.bid) : null; cls = `<div class="big sm">${esc(n.c.name)}</div><div class="muted">${n.c.start} · ${esc(n.c.place || "")}</div><div class="pill ${n.left <= 15 ? "warn" : ""}">${n.left > 0 ? `${n.left >= 60 ? `${Math.floor(n.left / 60)}시간 ${n.left % 60}분` : `${n.left}분`} 남음` : "수업 중"}${e ? ` · 도보 ${e.mins}분` : ""}</div>${n.c.bid ? `<button class="link" data-ask="다음 수업 강의실 가는 길 알려줘">🧭 길 안내</button>` : ""}`; }
  else if (D.tt.length) cls = `<div class="muted">오늘 남은 수업 없음 🎉</div>`;
  const nb = A.S.bus ? A.upcoming("donghae", 1)[0] : null, ns = A.S.bus ? A.upcoming("samcheok", 1)[0] : null;
  const bus = `<div class="busrow"><span>동해</span><b>${nb ? `${nb.route} ${nb.at}` : "없음"}</b><em>${nb ? A.waitText(nb.wait) : ""}</em></div><div class="busrow"><span>삼척</span><b>${ns ? `${ns.route} ${ns.at}` : "없음"}</b><em>${ns ? A.waitText(ns.wait) : ""}</em></div><div class="muted xs">시간표 추정 · ${esc(shuttlePos().running ? "통학버스 운행 중" : "통학버스 운행 없음")}</div>`;
  const ns3 = allNotices().filter((x) => /삼척/.test(x.campus) || x.board === "scholarship").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const notices = D.school ? ns3.map((x) => { const dl = deadlineOf(x); return `<a class="nrow" href="${esc(x.url)}" target="_blank" rel="noopener"><span class="tag">${esc((D.school.labels || {})[x.board] || "")}</span>${esc(x.title)}${dl && dday(dl) >= 0 ? ` <em class="dd">${ddayText(dday(dl))}</em>` : ""}</a>`; }).join("") + `<div class="muted xs">${D.schoolLive ? "학교 홈페이지 실시간" : "학교 공지 저장본"}</div>` : `<div class="muted">공지를 불러오는 중…</div>`;
  const cal = (D.cal?.events || []).filter((e) => dday(e.end) >= 0).slice(0, 3).map((e) => `<div class="crow"><b>${ddayText(Math.max(0, dday(e.start)))}</b> ${esc(e.title)}</div>`).join("");
  const meal = estimate("식당"), lib = estimate("도서관");
  const recent = D.reports.filter((r) => Date.now() - r.at < 90 * 60000).slice(-2).reverse();
  const live = `<div class="lrow"><span>🍚 식당</span><b class="lv ${meal.level}">${meal.level}</b><em>추정</em></div><div class="lrow"><span>📚 도서관</span><b class="lv ${lib.level}">${lib.level}</b><em>추정</em></div>${recent.map((r) => `<div class="lrow"><span>📝 ${esc(r.place)}</span><b class="lv ${r.level}">${r.level}</b><em>제보 ${agoText(r.at)}</em></div>`).join("")}<button class="link" data-report>＋ 지금 상황 제보</button>`;
  const d = new Date().getDay();
  const today = D.tt.filter((c) => c.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
  const ttCard = today.length ? today.map((c) => `<div class="crow ${toMin(c.end) < nowMin() ? "past" : ""}"><b>${c.start}</b> ${esc(c.name)} <span class="muted">${esc(c.place || "")}</span></div>`).join("") : `<div class="muted">오늘 수업이 없어요</div>`;
  const posts = D.posts.filter((p) => !p.done).slice(0, 3).map((p) => `<div class="crow"><span class="tag">${esc(p.type)}</span>${esc(p.title)} <span class="muted">${agoText(p.at)}</span></div>`).join("") || `<div class="muted">아직 글이 없어요</div>`;
  $("#avGreet").textContent = `${greet()} · ${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}`;
  el.innerHTML = `
      ${card("🌤 오늘 날씨", wx, "c-wx")}
      ${card("⏰ 다음 수업", cls, "c-next")}
      ${card("🚌 후문 버스", bus, "click c-bus").replace("<section", '<section data-go="bus"')}
      ${card("📊 실시간 현황", live, "c-live")}
      ${card("📢 학교 공지", notices, "wide c-notice")}
      ${card("📅 학사일정", cal || '<div class="muted">예정 없음</div>', "c-cal")}
      ${card(`🗓 오늘 시간표 <button class="link inline" data-page-go="tt">전체 ›</button>`, ttCard, "c-tt")}
      ${card(`👥 커뮤니티 <button class="link inline" data-page-go="comm">전체 ›</button>`, posts, "c-comm")}
      <section class="dcard c-rec"><h4>✨ AI 추천 일정</h4><p>시간표·공강·마감 공지·날씨·식당 혼잡도를 묶어서 오늘 하루 계획을 짜 드려요.</p><button class="rec" data-ask="오늘 일정 추천해줘">추천 받기</button></section>`;
}
const greet = () => { const h = new Date().getHours(); return h < 11 ? "좋은 아침이에요 ☀️" : h < 17 ? "좋은 오후예요 👋" : "오늘도 수고했어요 🌙"; };

/* ================= 시간표 탭 ================= */
function renderTT() {
  const el = $("#ttList"); if (!el) return;
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => d < 6 && d > 0 || D.tt.some((c) => c.day === d));
  el.innerHTML = D.tt.length ? days.map((d) => {
    const l = D.tt.filter((c) => c.day === d).sort((a, b) => toMin(a.start) - toMin(b.start));
    return `<div class="ttday ${d === new Date().getDay() ? "today" : ""}"><b>${DAYS[d]}</b><div>${l.map((c) => `<div class="ttc"><span>${c.start}~${c.end}</span><strong>${esc(c.name)}</strong><em>${esc(c.place || "")}</em><button data-del="${c.id}" aria-label="삭제">✕</button></div>`).join("") || '<span class="muted xs">수업 없음</span>'}</div></div>`;
  }).join("") : `<p class="muted">아직 시간표가 없어요. 아래에서 직접 넣거나, <b>AI에게 시간표 사진</b>을 보내면 자동으로 등록돼요.</p>`;
  const sel = $("#ttPlace");
  if (sel && !sel.options.length) sel.innerHTML = `<option value="">건물 선택</option>` + A.S.buildings.filter((b) => /강의|행정|기타|편의/.test(b.category) || /관|동|센터/.test(b.name)).map((b) => `<option>${esc(b.name)}</option>`).join("");
}
function initTT() {
  $("#ttList").addEventListener("click", (e) => { const id = e.target.dataset.del; if (!id) return; D.tt = D.tt.filter((c) => c.id !== id); save(); renderTT(); renderDash(); });
  $("#ttForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await TOOLS.add_classes({ classes: [{ name: f.name.value, day: f.day.value, start: f.start.value, end: f.end.value, place: `${f.place.value} ${f.room.value}`.trim() }] });
    if (r.count) { f.name.value = ""; f.room.value = ""; A.toast("시간표에 추가했어요"); } else A.toast("과목명·요일·시간을 확인해 주세요");
  });
  $("#ttPhoto").addEventListener("click", () => { if (isMobile()) aiPage("chat"); $("#aiFile").click(); });
  $("#ttClear").addEventListener("click", () => { if (D.tt.length && confirm("시간표를 모두 지울까요?")) { D.tt = []; save(); renderTT(); renderDash(); } });
}

/* ================= 커뮤니티 탭 ================= */
let commType = "";
function renderComm() {
  const el = $("#commList"); if (!el) return;
  $("#commTypes").innerHTML = ["", ...TYPES].map((t) => `<button class="chip ${t === commType ? "on" : ""}" data-t="${t}">${t || "전체"}</button>`).join("");
  const list = D.posts.filter((p) => !commType || p.type === commType);
  const ev = commType === "" || commType === "동아리·행사" ? allNotices().filter((n) => n.board === "events").slice(0, 3) : [];
  el.innerHTML = list.map((p) => `<li class="post ${p.done ? "done" : ""}"><span class="tag">${esc(p.type)}</span><b>${esc(p.title)}</b>${p.body && p.body !== p.title ? `<p>${esc(p.body)}</p>` : ""}<small>${agoText(p.at)} · ${D.shared ? (p.mine ? "내 글 · 모두에게 공개" : "모두에게 공개") : "이 기기에 저장됨"}${!D.shared || p.mine ? ` <button data-done="${p.id}">${p.done ? "다시 열기" : p.type === "분실물" ? "찾았어요" : "완료"}</button> <button data-rm="${p.id}">삭제</button>` : ""}</small></li>`).join("")
    + ev.map((n) => `<li class="post official"><span class="tag">학교 행사</span><a href="${esc(n.url)}" target="_blank" rel="noopener"><b>${esc(n.title)}</b></a><small>${esc(n.date)} · 학교 공지</small></li>`).join("")
    || `<li class="muted">아직 글이 없어요. 첫 글을 남겨 보세요. AI에게 "도서관에서 지갑 잃어버렸어 분실물 올려줘"라고 해도 돼요.</li>`;
  const rep = D.reports.filter((r) => Date.now() - r.at < 3 * 3600000).slice(-6).reverse();
  $("#repList").innerHTML = rep.map((r) => `<li><b>${esc(r.place)}</b> <span class="lv ${r.level}">${r.level}</span> ${esc(r.note || "")} <small>${agoText(r.at)}</small></li>`).join("") || `<li class="muted">최근 3시간 제보가 없어요</li>`;
}
function initComm() {
  $("#commTypes").addEventListener("click", (e) => { if (e.target.dataset.t === undefined) return; commType = e.target.dataset.t; renderComm(); });
  $("#commList").addEventListener("click", (e) => {
    const d = e.target.dataset.done, r = e.target.dataset.rm;
    if (d) { const p = D.posts.find((x) => x.id === d); if (p) { p.done = !p.done; if (D.shared) commApi({ kind: "done", id: d, done: p.done }).catch(() => A.toast("변경을 저장하지 못했어요")); } }
    if (r) { D.posts = D.posts.filter((x) => x.id !== r); if (D.shared) commApi({ kind: "rm", id: r }).catch(() => A.toast("삭제하지 못했어요")); }
    if (d || r) { save(); renderComm(); }
  });
  $("#commForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    const r = await TOOLS.community({ action: "post", type: f.type.value, title: f.title.value, body: f.body.value });
    if (r.posted) { f.title.value = ""; f.body.value = ""; A.toast(r.visibleTo === "모든 사용자" ? "올렸어요 · 모두에게 보여요" : "올렸어요 · 이 기기에만 저장됨"); }
  });
  $("#repForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target;
    await TOOLS.report_status({ place: f.place.value, level: f.level.value, note: f.note.value });
    f.note.value = ""; A.toast("제보 고마워요! 대시보드에 반영됐어요");
  });
}

/* ================= 이미지 첨부 (시간표 사진 등) ================= */
async function readImage(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/jpeg", 0.85);
  URL.revokeObjectURL(url);
  return { url: data, mime: "image/jpeg", b64: data.split(",")[1] };
}

/* ================= AI 전용 화면 ================= */
const isMobile = () => matchMedia("(max-width: 760px)").matches;
let PAGE = "home";
export function aiPage(page) {
  if (!$("#aiView")) return;
  PAGE = page;
  const map = { home: "avHome", tt: "avTT", comm: "avComm" };
  Object.values(map).forEach((id) => ($("#" + id).hidden = map[page] !== id));
  $("#aiView").dataset.page = page;
  $$(".av-nav [data-page]").forEach((b) => b.classList.toggle("on", b.dataset.page === page));
  if (page === "chat") setTimeout(() => { scrollChat(); $("#chatIn").focus(); }, 50);
  if (page === "home") renderDash();
  if (page === "tt") renderTT();
  if (page === "comm") renderComm();
  $(".av-main").scrollTop = 0;
}
export function openAI(page) {
  if (!$("#aiView")) return; // AI 화면 없음: AI는 3D 캠퍼스의 AI 요정에서만 사용
  $("#aiView").hidden = false;
  document.body.classList.add("ai-open");
  $("#aiBtn")?.classList.add("on");
  aiPage(page || (PAGE === "chat" && !isMobile() ? "home" : PAGE));
}
export function closeAI() {
  if (!$("#aiView")) return;
  $("#aiView").hidden = true;
  document.body.classList.remove("ai-open");
  $("#aiBtn")?.classList.remove("on");
  setTimeout(() => A?.S.map?.invalidateSize(), 50);
}
export const aiOpen = () => !!$("#aiView") && !$("#aiView").hidden;

/* ================= 시작 ================= */
export async function initAI(app) {
  A = app;
  D.tt = store.get("cg_tt", []);
  D.posts = store.get("cg_posts", []);
  D.reports = store.get("cg_reports", []);
  D.cal = await fetch("data/calendar.json").then((r) => r.json()).catch(() => null);
  if (!$("#aiView")) { // AI 화면이 없으면 데이터만 준비 (3D AI 요정이 같은 도구를 씀)
    syncComm();
    setInterval(() => { if (!document.hidden) syncComm(); }, 30000);
    loadSchool();
    return;
  }
  let pending = null;
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#chatIn").value; $("#chatIn").value = ""; const im = pending; pending = null; $("#attach").hidden = true; ask(v, im); });
  $("#aiFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { pending = await readImage(f); $("#attach").hidden = false; $("#attach img").src = pending.url; $("#chatIn").placeholder = "사진과 함께 보낼 말 (비워도 돼요)"; $("#chatIn").focus(); } catch { A.toast("이미지를 읽지 못했어요"); }
  });
  $("#attach button").addEventListener("click", () => { pending = null; $("#attach").hidden = true; });
  $("#attachBtn").addEventListener("click", () => $("#aiFile").click());
  document.addEventListener("click", (e) => {
    const q = e.target.closest("[data-ask]")?.dataset.ask;
    if (q) { e.preventDefault(); ask(q); return; }
    if (e.target.closest("[data-go]")) { closeAI(); A.openPanel(); A.switchTab(e.target.closest("[data-go]").dataset.go); }
    if (e.target.closest("[data-report]")) { aiPage("comm"); $("#repForm [name=place]").focus(); }
    const pg = e.target.closest("[data-page-go]")?.dataset.pageGo; if (pg) aiPage(pg);
  });
  $$(".av-nav [data-page]").forEach((b) => b.addEventListener("click", () => aiPage(b.dataset.page)));
  $("#avMap").addEventListener("click", closeAI);
  $("#heroForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#heroIn").value; $("#heroIn").value = ""; ask(v); });
  initTT(); initComm();
  renderTT(); renderComm(); renderDash();
  syncComm(); // 다른 사람 글·제보 불러오기
  setInterval(() => { if (!document.hidden) syncComm(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncComm(); });
  loadSchool();
  setInterval(() => { if (!document.hidden) renderDash(); }, 60000);
}
export const aiTools = TOOLS; // 테스트용
