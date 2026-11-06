// 트렌드 학습 파이프라인:  node tools/learn-trends.mjs
// 3D 캠퍼스 NPC들이 "요즘 이런 얘기가 많대요"라고 말할 수 있도록, 공개 커뮤니티·검색 트렌드를 주기적으로 모아 AI가 정리한다.
//
// 1) 수집  · 디시인사이드 갤러리 목록의 '글 제목·조회·추천 수'만 (본문·글쓴이는 읽지 않음)
//            robots.txt 확인 → 허용된 경로만, 요청 사이 2~3.5초 쉬기, 403/429(차단 신호)가 오면 그 출처는 즉시 중단
//          · 구글 트렌드 일별 인기 검색어 RSS (키 불필요)
//          · 유튜브 인기 급상승 동영상 (YouTube Data API, YOUTUBE_API_KEY 있을 때)
//          · 네이버 데이터랩 검색어 트렌드 (NAVER_CLIENT_ID/SECRET 있을 때, 설정한 키워드 묶음의 지난주 대비 증감)
// 2) 거르기  욕설·혐오·성적·폭력·정치 단어가 들어간 제목은 AI에 보내기 전에 버린다.
// 3) 정리  Gemini 가 '주제' 단위로 묶어 요약하고, NPC가 말할 짧은 대사를 만든다. (원문 제목을 그대로 옮기지 않음)
//          키가 없으면 규칙 기반(검색어·취업 단어 빈도)으로 대사를 만든다.
// 4) 누적  data/trends.json — 지난번 주제와 합쳐 '며칠째 화제인지'를 기록. 원문 제목은 저장하지 않는다.
//
// 옵션: --no-ai (AI 정리 없이)  --only=dc,google,youtube,naver (일부만)  --dry (파일 저장 안 함)
// 환경변수(.env 자동): GEMINI_API_KEY, YOUTUBE_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, TRENDS_USER_AGENT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "trends.json");
const CONF = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "trends-config.json"), "utf8"));

if (fs.existsSync(path.join(ROOT, ".env"))) {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const ONLY = ARGS.only ? String(ARGS.only).split(",") : null;
const want = (k) => !ONLY || ONLY.includes(k);
const USE_AI = !ARGS["no-ai"] && !!process.env.GEMINI_API_KEY;
const UA = process.env.TRENDS_USER_AGENT || "Mozilla/5.0 (compatible; CampusGO-TrendBot/1.0; KNU hackathon student project)";
const GEMINI_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date();
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const log = (...a) => console.log(...a);
const ent = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

/* ---------------- 거르기: NPC가 절대 말하면 안 되는 것 ---------------- */
export const BLOCK = new RegExp([
  // 욕설·비하
  "씨발|시발|ㅅㅂ|ㅆㅂ|씹|좆|존나|졸라|ㅈㄴ|병신|ㅂㅅ|븅신|개새|새끼|ㅅㄲ|느금|니애미|애미|애비|지랄|ㅈㄹ|꺼져|닥쳐|미친놈|미친년|등신|찐따|장애인|애자|틀딱|급식충|맘충|한남|김치녀|된장녀|짱깨|쪽바리|짱개|흑형|깜둥|홍어|일베|메갈|워마드|창녀|걸레",
  // 성적
  "섹스|야동|보지|자지|젖|가슴|엉덩|따먹|강간|성폭|몰카|노출|19금|빨통|꼴리|ㅗㅜㅑ|av배우",
  // 폭력·죽음·범죄
  "자살|자해|극단적|목숨|사망|살인|살해|숨진|죽였|죽음|죽어|칼부림|폭행|학대|괴롭힘|마약|도박|토토|불법",
  // 정치·선거·종교·혐오 논쟁
  "정치|대통령|국회|의원|선거|정당|민주당|국민의힘|국힘|진보|보수|좌파|우파|빨갱이|수꼴|극우|극좌|탄핵|여당|야당|윤석열|이재명|한동훈|조국|문재인|박근혜|트럼프|북한|김정은|페미|종교|교회|이슬람",
  // 광고·도배
  "광고|홍보|대출|코인|리딩방|카톡방|텔레그램방|오픈채팅",
].join("|"), "i");
const safe = (s) => !!s && !BLOCK.test(String(s).replace(/\s+/g, ""));
const okOpt = (s) => !s || safe(s); // 비어 있어도 되는 칸

/* ---------------- HTTP (예의 바르게) ---------------- */
async function get(url, { headers = {}, ms = 15000, json = false, method = "GET", body } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method, body, signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", ...headers } });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return json ? r.json() : r.text();
  } finally { clearTimeout(t); }
}

// robots.txt: User-agent: * (와 우리 봇 이름) 그룹의 Disallow/Allow 를 보고 경로 허용 여부 판단
export function robotsAllows(txt, pathname, bot = "campusgo") {
  const groups = []; let cur = null, lastWasUA = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!lastWasUA) groups.push((cur = { agents: [], rules: [] })); cur.agents.push(v.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (!cur) continue;
    if (k === "disallow" || k === "allow") cur.rules.push({ allow: k === "allow", path: v });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && bot.includes(a.replace(/\*/g, ""))));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // "Disallow:" (빈 값) = 모두 허용
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/* ---------------- 1-a. 디시인사이드 ---------------- */
const DC_PATH = { major: "/board/lists/", minor: "/mgallery/board/lists/", mini: "/mini/board/lists/" };
export function parseDcList(html) {
  const out = [];
  for (const chunk of String(html).split(/<tr\s+class="ub-content/).slice(1)) {
    const row = chunk.slice(0, chunk.indexOf("</tr>") > 0 ? chunk.indexOf("</tr>") : undefined);
    const num = ent((row.match(/class="gall_num"[^>]*>([\s\S]*?)<\/td>/) || [])[1]);
    if (!/^\d+$/.test(num)) continue;                                  // 공지·설문·AD 제외
    const tit = (row.match(/class="gall_tit[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || "";
    const a = (tit.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "";
    const title = ent(a.replace(/<em[\s\S]*?<\/em>/g, ""));
    const reply = +((tit.match(/reply_num[^>]*>\s*\[(\d+)/) || [])[1] || 0);
    const views = +ent((row.match(/class="gall_count"[^>]*>([\s\S]*?)<\/td>/) || [])[1]).replace(/\D/g, "") || 0;
    const rec = +ent((row.match(/class="gall_recommend"[^>]*>([\s\S]*?)<\/td>/) || [])[1]).replace(/\D/g, "") || 0;
    const date = (row.match(/class="gall_date"[^>]*title="([^"]+)"/) || [])[1] || "";
    if (title) out.push({ title, views, rec, reply, date });
  }
  return out;
}
async function collectDc() {
  const c = CONF.dc || {}; if (!c.enabled || !c.galleries?.length) return { ok: false, note: "설정에서 꺼짐", items: [] };
  const host = "https://gall.dcinside.com";
  let robots = "";
  try { robots = await get(`${host}/robots.txt`); } catch (e) { if (e.status === 403 || e.status === 429) return { ok: false, note: `robots.txt ${e.status} — 차단 신호라 중단`, items: [] }; }
  const [lo, hi] = c.delaySec || [2, 3.5];
  const items = [], notes = [];
  for (const g of c.galleries) {
    const base = DC_PATH[g.type || "major"] || DC_PATH.major;
    if (!robotsAllows(robots, base)) { notes.push(`${g.name}: robots.txt 에서 금지된 경로라 건너뜀`); continue; }
    for (let p = 1; p <= Math.min(3, c.pagesPerGallery || 1); p++) {
      const url = `${host}${base}?id=${encodeURIComponent(g.id)}&page=${p}${g.recommendOnly ? "&exception_mode=recommend" : ""}`;
      try {
        const rows = parseDcList(await get(url, { headers: { Referer: host + "/" } }));
        const kept = rows.filter((r) => safe(r.title));
        items.push(...kept.map((r) => ({ ...r, source: "dc", gallery: g.name, topic: g.topic || "community" })));
        notes.push(`${g.name} p${p}: ${rows.length}개 중 ${kept.length}개 사용`);
      } catch (e) {
        notes.push(`${g.name}: ${e.message}`);
        if (e.status === 403 || e.status === 429) { notes.push("차단 신호(403/429) — 디시 수집을 이번 회차에서 중단"); return { ok: items.length > 0, note: notes.join(" · "), items }; }
      }
      await sleep((lo + Math.random() * (hi - lo)) * 1000);   // 요청 사이 쉬기
    }
  }
  return { ok: items.length > 0, note: notes.join(" · "), items };
}

/* ---------------- 1-b. 구글 트렌드 (RSS) ---------------- */
export function parseTrendsRss(xml) {
  return String(xml).split(/<item>/).slice(1).map((it) => ({
    title: ent((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
    traffic: ent((it.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1]),
    news: ent((it.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [])[1]),
  })).filter((x) => x.title);
}
async function collectGoogle() {
  const c = CONF.googleTrends || {}; if (!c.enabled) return { ok: false, note: "설정에서 꺼짐", items: [] };
  try {
    const rows = parseTrendsRss(await get(`https://trends.google.com/trending/rss?geo=${c.geo || "KR"}`));
    const items = rows.filter((r) => safe(r.title) && okOpt(r.news)).slice(0, c.max || 20).map((r) => ({ ...r, source: "google", topic: "trend" }));
    return { ok: items.length > 0, note: `${rows.length}개 중 ${items.length}개 사용`, items };
  } catch (e) { return { ok: false, note: e.message, items: [] }; }
}

/* ---------------- 1-c. 유튜브 인기 급상승 (공식 API) ---------------- */
const YT_CAT = { 1: "영화·애니", 2: "자동차", 10: "음악", 15: "동물", 17: "스포츠", 19: "여행", 20: "게임", 22: "일상", 23: "코미디", 24: "엔터", 25: "뉴스", 26: "노하우", 27: "교육", 28: "과학기술" };
async function collectYoutube() {
  const c = CONF.youtube || {}; const key = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!c.enabled) return { ok: false, note: "설정에서 꺼짐", items: [] };
  if (!key) return { ok: false, note: "YOUTUBE_API_KEY 없음 — 건너뜀", items: [] };
  try {
    const j = await get(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${c.regionCode || "KR"}&maxResults=${Math.min(50, c.max || 30)}&key=${key}`, { json: true });
    const rows = (j.items || []).map((v) => ({ title: v.snippet?.title || "", channel: v.snippet?.channelTitle || "", tags: (v.snippet?.tags || []).slice(0, 5), cat: YT_CAT[v.snippet?.categoryId] || "기타", views: +v.statistics?.viewCount || 0 }));
    const items = rows.filter((r) => r.cat !== "뉴스" && safe(r.title) && okOpt(r.tags.join(" "))).map((r) => ({ ...r, source: "youtube", topic: "youtube" }));
    return { ok: items.length > 0, note: `${rows.length}개 중 ${items.length}개 사용 (뉴스 분류 제외)`, items };
  } catch (e) { return { ok: false, note: e.message, items: [] }; }
}

/* ---------------- 1-d. 네이버 데이터랩 (공식 API) ---------------- */
async function collectNaver() {
  const c = CONF.naverDatalab || {}; const id = (process.env.NAVER_CLIENT_ID || "").trim(), sec = (process.env.NAVER_CLIENT_SECRET || "").trim();
  if (!c.enabled) return { ok: false, note: "설정에서 꺼짐", items: [] };
  if (!id || !sec) return { ok: false, note: "NAVER_CLIENT_ID/SECRET 없음 — 건너뜀", items: [] };
  const end = today(), start = new Date(Date.now() + 9 * 3600e3 - 27 * 86400e3).toISOString().slice(0, 10);
  const groups = c.keywordGroups || [], items = [];
  try {
    for (let i = 0; i < groups.length; i += 5) { // 한 번에 5묶음까지
      const j = await get("https://openapi.naver.com/v1/datalab/search", {
        json: true, method: "POST", headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": sec, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, timeUnit: "date", keywordGroups: groups.slice(i, i + 5) }),
      });
      for (const r of j.results || []) {
        const d = r.data || []; const avg = (a) => (a.length ? a.reduce((s, x) => s + x.ratio, 0) / a.length : 0);
        const last = avg(d.slice(-7)), prev = avg(d.slice(-14, -7));
        const change = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
        items.push({ title: r.title, keywords: r.keywords, change, level: Math.round(last), source: "naver", topic: "search" });
      }
      await sleep(500);
    }
    return { ok: items.length > 0, note: `키워드 묶음 ${items.length}개`, items };
  } catch (e) { return { ok: false, note: e.message, items }; }
}

/* ---------------- 3. AI 정리 ---------------- */
const MODELS = [...new Set(["gemini-3.8-flash", process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"].filter(Boolean))];
async function gemini(prompt) {
  let lastErr;
  for (const model of MODELS) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
        signal: ctl.signal, method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY.trim() },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 6000, responseMimeType: "application/json" } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    } catch (e) { lastErr = e; } finally { clearTimeout(t); }
  }
  throw lastErr;
}
const PROMPT = (input, prev) => `너는 강원대학교 삼척캠퍼스 3D 캠퍼스 앱의 NPC 대사 작가다. 오늘은 ${today()}.
아래는 공개 커뮤니티 글 제목(디시인사이드), 구글 인기 검색어, 유튜브 인기 급상승, 네이버 검색량 변화다.
대학생이 관심 가질 '요즘 화제'를 주제 단위로 묶어 JSON만 출력하라.

[반드시 지킬 것]
- 원문 제목을 그대로 옮기지 말고 주제로 요약한다. 특정 개인(일반인·작성자)의 이름·닉네임은 쓰지 않는다. 연예인·유튜버는 이름 대신 "한 가수", "한 유튜버"처럼 쓴다.
- 욕설·비하·혐오·성적 내용·폭력·죽음·범죄·정치·선거·종교·지역/성별 갈등·투자 권유 주제는 통째로 버린다. 애매하면 버린다.
- 커뮤니티 글은 사실이 아니라 '분위기'다. 단정하지 말고 "~라는 얘기가 많아요", "~가 화제래요"처럼 말한다. 숫자·사실을 지어내지 않는다.
- 취업·진로(job) 주제는 대학생에게 도움이 되는 방향(자소서, 면접, 채용 시기, 일경험 등)으로 정리한다. 비관·조롱 분위기는 순화한다.
- 대사(lines)는 존댓말, 친근하게, 한 줄 60자 이내, 2~3개. 이모지는 대사당 최대 1개.

[출력 형식]
{"topics":[{"title":"짧은 주제명(15자 이내)","category":"job|campus|trend|youtube|meme|search","summary":"1~2문장 중립 요약","sources":["dc"|"google"|"youtube"|"naver"],"heat":1~5,"lines":["대사1","대사2"]}]}
주제는 최대 ${CONF.maxTopics || 30}개, 중요한 것부터.
지난번 주제(이어지는 화제면 같은 title을 그대로 써라): ${JSON.stringify(prev.slice(0, 30))}

[입력]
${JSON.stringify(input)}`;

// AI 없이: 안전한 신호만으로 대사 만들기 (커뮤니티 원문은 단어 빈도로만 사용)
const JOB_WORDS = ["자소서", "자기소개서", "면접", "인적성", "코테", "코딩테스트", "공채", "채용", "서류", "합격", "탈락", "연봉", "중소기업", "대기업", "공기업", "공무원", "NCS", "인턴", "일경험", "토익", "자격증", "포트폴리오", "이직", "신입", "경력", "취준", "졸업", "학점", "개발자", "백엔드", "프론트", "AI"];
function ruleTopics(src) {
  const out = [];
  for (const g of src.google.items.slice(0, 8)) out.push({ title: g.title.slice(0, 15), category: "trend", summary: `구글 인기 검색어${g.traffic ? ` (검색 ${g.traffic})` : ""}`, sources: ["google"], heat: 3, lines: [`요즘 '${g.title}' 검색이 많이 늘었대요 🔎`] });
  for (const n of src.naver.items.filter((x) => x.change != null).sort((a, b) => b.change - a.change).slice(0, 4))
    out.push({ title: n.title, category: "search", summary: `네이버 검색량 지난주 대비 ${n.change > 0 ? "+" : ""}${n.change}%`, sources: ["naver"], heat: n.change > 20 ? 4 : 2, lines: [n.change >= 0 ? `'${n.title}' 검색이 지난주보다 ${n.change}% 늘었대요.` : `'${n.title}' 검색은 지난주보다 조금 줄었대요.`] });
  const cnt = {};
  for (const d of src.dc.items) for (const w of JOB_WORDS) if (d.title.includes(w)) cnt[w] = (cnt[w] || 0) + 1 + Math.min(3, Math.floor((d.rec || 0) / 10));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) out.push({ title: "취업 커뮤니티 화제", category: "job", summary: `자주 나온 단어: ${top.map(([w]) => w).join(", ")}`, sources: ["dc"], heat: 3, lines: top.slice(0, 3).map(([w]) => `취업 커뮤니티에서 요즘 '${w}' 얘기가 많아요.`) });
  for (const y of src.youtube.items.slice(0, 5)) out.push({ title: (y.tags[0] || y.cat).slice(0, 15), category: "youtube", summary: `유튜브 인기 급상승 · ${y.cat}`, sources: ["youtube"], heat: 2, lines: [`유튜브 인기 급상승에 ${y.cat} 영상이 올라와 있어요 ▶`] });
  return out;
}

/* ---------------- 4. 누적 ---------------- */
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
export function mergeTopics(prev, fresh, keepDays = 4) {
  const day = today(), byKey = new Map(prev.map((t) => [norm(t.title), t]));
  const out = [];
  for (const t of fresh) {
    const old = byKey.get(norm(t.title)); byKey.delete(norm(t.title));
    const days = old ? (old.lastSeen === day ? old.days : (old.days || 1) + 1) : 1;
    out.push({ ...t, firstSeen: old?.firstSeen || day, lastSeen: day, days });
  }
  // 이번에 안 보인 주제는 keepDays 동안만 남김 (점점 식는 화제)
  for (const t of byKey.values()) {
    const age = (Date.parse(day) - Date.parse(t.lastSeen)) / 86400e3;
    if (age < keepDays) out.push({ ...t, heat: Math.max(1, (t.heat || 1) - 1), cooling: true });
  }
  return out.sort((a, b) => (b.cooling ? 0 : 1) - (a.cooling ? 0 : 1) || b.heat - a.heat);
}
export function cleanTopic(t) {
  const lines = (Array.isArray(t.lines) ? t.lines : []).map((l) => String(l).trim().slice(0, 80)).filter((l) => l && safe(l)).slice(0, 3);
  const title = String(t.title || "").trim().slice(0, 20), summary = String(t.summary || "").trim().slice(0, 160);
  if (!title || !lines.length || !safe(title) || !safe(summary)) return null;
  const cat = ["job", "campus", "trend", "youtube", "meme", "search"].includes(t.category) ? t.category : "trend";
  const sources = (Array.isArray(t.sources) ? t.sources : []).filter((s) => ["dc", "google", "youtube", "naver"].includes(s));
  return { title, category: cat, summary, sources, heat: Math.min(5, Math.max(1, Math.round(+t.heat || 2))), lines };
}

/* ---------------- 실행 ---------------- */
async function main() {
  const started = now();
  log(`[트렌드 학습] ${started.toISOString()} 시작 (AI ${USE_AI ? "사용" : "없음"})`);
  const empty = { ok: false, note: "건너뜀", items: [] };
  const [google, youtube, naver] = await Promise.all([want("google") ? collectGoogle() : empty, want("youtube") ? collectYoutube() : empty, want("naver") ? collectNaver() : empty]);
  const dc = want("dc") ? await collectDc() : empty;   // 디시는 순서대로 천천히
  const src = { dc, google, youtube, naver };
  for (const [k, v] of Object.entries(src)) log(`  ${k}: ${v.ok ? "✔" : "✖"} ${v.note}`);
  if (!Object.values(src).some((s) => s.ok)) { log("모든 출처 실패 — 기존 data/trends.json 을 그대로 둡니다."); process.exitCode = 1; return; }

  const prevFile = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const prev = prevFile.topics || [];
  let fresh = [], mode = "rule";
  if (USE_AI) {
    const input = {
      dc: dc.items.sort((a, b) => b.rec * 5 + b.views / 50 + b.reply - (a.rec * 5 + a.views / 50 + a.reply)).slice(0, 120).map((d) => ({ g: d.gallery, t: d.title, rec: d.rec, views: d.views })),
      google: google.items.map((g) => ({ q: g.title, traffic: g.traffic, news: g.news })),
      youtube: youtube.items.slice(0, 30).map((y) => ({ t: y.title, cat: y.cat, tags: y.tags })),
      naver: naver.items.map((n) => ({ group: n.title, changePct: n.change })),
    };
    try { const j = await gemini(PROMPT(input, prev.map((t) => t.title))); fresh = j.topics || []; mode = "ai"; }
    catch (e) { log(`  AI 정리 실패(${e.message}) → 규칙 기반으로 대신`); }
  }
  if (mode === "rule") fresh = ruleTopics(src);
  const cleaned = fresh.map(cleanTopic).filter(Boolean);
  log(`  주제 ${fresh.length}개 → 거른 뒤 ${cleaned.length}개 (${mode})`);
  const topics = mergeTopics(prev, cleaned, CONF.keepDays || 4).slice(0, CONF.maxTopics || 30)
    .map((t, i) => ({ id: `t${i + 1}`, ...t }));

  const out = {
    _note: "tools/learn-trends.mjs 가 만든 파일. 3D NPC 대사·AI 요정(get_trends)이 씁니다. 원문 글 제목은 저장하지 않고 AI가 요약한 주제만 담습니다.",
    updatedAt: started.toISOString(), mode,
    sources: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { ok: v.ok, used: v.items.length, note: v.note.slice(0, 300) }])),
    sourceLabels: { dc: "디시인사이드 커뮤니티", google: "구글 트렌드", youtube: "유튜브 인기 급상승", naver: "네이버 데이터랩" },
    topics,
    runs: [{ at: started.toISOString(), mode, topics: cleaned.length, ok: Object.entries(src).filter(([, v]) => v.ok).map(([k]) => k) }, ...(prevFile.runs || [])].slice(0, 40),
  };
  if (ARGS.dry) { log(JSON.stringify(out.topics.slice(0, 5), null, 1)); return; }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  log(`  저장: data/trends.json (주제 ${topics.length}개)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exitCode = 1; });
