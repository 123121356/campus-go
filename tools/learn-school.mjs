// 매일 학습 파이프라인:  node tools/learn-school.mjs
//
// 1) 수집   강원대 홈페이지 게시판(일반·학사·장학·행사) 목록을 여러 쪽 읽고, 삼척/전체 캠퍼스 글만 고른다.
// 2) 읽기   처음 보는 글은 상세 페이지 본문·문의전화·첨부파일 이름까지 가져온다.
// 3) 정리   Gemini 가 새 글을 읽고 요약·마감일·대상·신청방법·키워드를 뽑는다. (키가 없으면 규칙 기반으로 대신)
// 4) 누적   data/knowledge.json 에 어제까지 배운 글과 합쳐 저장한다. (지워진 글도 기록은 남음)
// 5) 배포   data/school.json(앱 기본 스냅샷)도 오늘 기준으로 새로 쓴다. data/learn-log.json 에 학습 기록을 남긴다.
//
// 옵션:  --pages=3   게시판마다 읽을 쪽 수 (기본 3, 처음 한 번은 10 정도로 과거 글을 몰아 학습해도 됨)
//        --no-ai     Gemini 정리 없이 수집만
//        --redo-ai   이미 정리한 글도 다시 정리
// 환경변수(.env 자동으로 읽음): GEMINI_API_KEY, GEMINI_MODEL, LEARN_AI_MAX(한 번에 AI가 정리할 최대 글 수, 기본 250)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const KB_FILE = path.join(DATA, "knowledge.json");
const SNAP_FILE = path.join(DATA, "school.json");
const LOG_FILE = path.join(DATA, "learn-log.json");

// .env 읽기 (dev-server.js 와 같은 방식)
if (fs.existsSync(path.join(ROOT, ".env"))) {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const PAGES = Math.max(1, Math.min(20, Number(ARGS.pages) || 3));
const USE_AI = !ARGS["no-ai"] && !!process.env.GEMINI_API_KEY;
const AI_MAX = Number(process.env.LEARN_AI_MAX) || 250;
const KEEP_DAYS = 400; // 이보다 오래된 글은 지식베이스에서 정리

const BASE = process.env.KNU_BASE || "https://www.kangwon.ac.kr";
const GEMINI_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
const BOARDS = { general: 504, academic: 720, scholarship: 721, events: 715 };
const LABEL = { general: "일반공지", academic: "학사공지", scholarship: "장학공지", events: "행사안내" };
const CAMPUS = /ALL|삼척/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
const log = (...a) => console.log(...a);

/* ---------------- 수집 (api/school.js 와 같은 파서) ---------------- */
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/<[^>]*$/, "")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

async function get(url, ms = 12000, tries = 2) {
  let err;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (CampusGO daily learner; KNU hackathon)", "Accept-Language": "ko" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { err = e; await sleep(1500 * (i + 1)); } finally { clearTimeout(t); }
  }
  throw err;
}

function parseList(html, board) {
  const out = [];
  const at = html.indexOf("<thead");
  if (at < 0) return out;
  for (const row of html.slice(at).split(/<tr[\s>]/).slice(1)) {
    const a = row.match(/href="(\/ko\/bbs\/\d+\/detail\.do\?pstSn=(\d+))[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
    const campus = (row.match(/photo-chip[^>]*>([^<]+)</g) || []).map((s) => s.replace(/.*>/, "").replace("<", "").trim()).join(" ") || tds[1] || "";
    const date = tds.find((x) => /^\d{4}\.\d\d\.\d\d$/.test(x)) || "";
    out.push({ board, id: a[2], campus, title: strip(a[3]), date, url: BASE + a[1], by: tds[3] && !/^\d{4}\./.test(tds[3]) ? tds[3] : "" });
  }
  return out;
}

function parseDetail(html) {
  const i = html.indexOf("editor-wrap");
  const fi = i > 0 ? html.indexOf("view-file", i) : -1;
  const body = i > 0 ? strip(html.slice(i, fi > 0 ? fi : i + 40000)).replace(/^[^>]*>/, "") : "";
  const tel = (strip(html).match(/문의전화\s*([\d-]{7,})/) || [])[1] || "";
  const fileZone = fi > 0 ? html.slice(html.indexOf(">", fi) + 1, fi + 8000) : "";
  const files = [...new Set([...strip(fileZone).matchAll(/([^\n]{1,80}?\.(?:hwpx?|pdf|docx?|xlsx?|pptx?|zip|jpe?g|png))/gi)].map((m) => m[1].trim()))].slice(0, 8);
  return { body: body.replace(/\s+/g, " ").trim().slice(0, 5000), tel, files };
}

async function crawlLists() {
  const found = []; const errors = [];
  for (const [board, id] of Object.entries(BOARDS)) {
    for (let p = 1; p <= PAGES; p++) {
      try {
        const rows = parseList(await get(`${BASE}/ko/bbs/${id}/list.do?pageIndex=${p}`), board);
        found.push(...rows.filter((x) => CAMPUS.test(x.campus)));
        if (!rows.length) break;
      } catch (e) { errors.push(`${LABEL[board]} ${p}쪽: ${e.message}`); break; }
      await sleep(400); // 학교 서버에 부담 주지 않게 천천히
    }
  }
  const seen = new Set();
  return { found: found.filter((x) => !seen.has(x.url) && seen.add(x.url)), errors };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); } }));
}

/* ---------------- 정리 (AI) ---------------- */
const MODELS = [...new Set(["gemini-3.8-flash", process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest"].filter(Boolean))];
let okModel = null;

async function gemini(prompt) {
  let lastErr;
  for (const model of okModel ? [okModel, ...MODELS.filter((m) => m !== okModel)] : MODELS) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
        signal: ctl.signal, method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY.trim() },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      okModel = model;
      return JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    } catch (e) { lastErr = e; } finally { clearTimeout(t); }
  }
  throw lastErr;
}

const DIGEST_PROMPT = (posts) => `너는 강원대학교 공지를 학생용 지식으로 정리하는 도우미다. 오늘은 ${today()} 이다.
아래 공지 각각을 읽고 JSON 배열만 출력하라. 원문에 없는 내용은 지어내지 말고 null 로 둔다.
각 원소 형식:
{"i": 번호, "summary": "학생이 알아야 할 핵심 1~2문장", "deadline": "신청·제출 마감일 YYYY-MM-DD 또는 null", "period": "행사·운영 기간을 짧게 또는 null", "target": "대상(학년·학과·캠퍼스 등) 짧게 또는 null", "how": "신청·문의 방법 한 줄 또는 null", "keywords": ["검색용 키워드 3~6개"]}
연도가 생략된 날짜는 게시일 기준으로 가장 가까운 미래 날짜로 해석한다.

${JSON.stringify(posts)}`;

// AI 없이도 쓸 수 있는 규칙 기반 정리
function ruleDigest(p) {
  const txt = `${p.title} ${p.body || ""}`;
  const py = Number((p.date || today()).slice(0, 4)) || new Date().getFullYear();
  const pm = Number((p.date || "").slice(5, 7)) || 1;
  let deadline = null;
  let m = txt.match(/(?:마감|기한|까지|~)\s*[^0-9]{0,12}(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/) || null;
  if (m) deadline = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  else if ((m = txt.match(/~\s*(\d{1,2})\s*[./]\s*(\d{1,2})/) || txt.match(/(?:마감|기한|기간|까지)[^0-9]{0,12}(\d{1,2})\.\s*(\d{1,2})\./))) {
    const y = Number(m[1]) < pm - 6 ? py + 1 : py;
    deadline = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  if (deadline && isNaN(new Date(deadline))) deadline = null;
  const summary = (p.body || p.title).replace(/\s+/g, " ").trim().slice(0, 160);
  const keywords = [...new Set(p.title.replace(/[()[\]「」『』<>·,]/g, " ").split(/\s+/).filter((w) => w.length >= 2))].slice(0, 6);
  return { summary, deadline, period: null, target: null, how: p.tel ? `문의 ${p.tel}` : null, keywords, by: "rule" };
}

async function digest(posts) {
  let done = 0; const errors = [];
  for (let k = 0; k < posts.length; k += 8) {
    const batch = posts.slice(k, k + 8);
    try {
      const out = await gemini(DIGEST_PROMPT(batch.map((p, i) => ({ i, title: p.title, posted: p.date, campus: p.campus, body: (p.body || "").slice(0, 1800) }))));
      for (const o of Array.isArray(out) ? out : out?.items || []) {
        const p = batch[o.i]; if (!p) continue;
        p.ai = {
          summary: String(o.summary || "").slice(0, 300) || null,
          deadline: /^\d{4}-\d\d-\d\d$/.test(o.deadline || "") ? o.deadline : null,
          period: o.period || null, target: o.target || null, how: o.how || null,
          keywords: (Array.isArray(o.keywords) ? o.keywords : []).map(String).slice(0, 8),
          by: okModel, at: new Date().toISOString(),
        };
        done++;
      }
    } catch (e) { errors.push(`AI 정리 실패(${batch.length}건): ${e.message.slice(0, 120)}`); }
    await sleep(4000); // 무료 한도(분당 요청 수) 보호
  }
  return { done, errors };
}

/* ---------------- 실행 ---------------- */
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

async function main() {
  const started = Date.now();
  const kb = readJSON(KB_FILE, { posts: [] });
  const byUrl = new Map((kb.posts || []).map((p) => [p.url, p]));
  // 기존 school.json 스냅샷에 있던 글도 처음 한 번 지식으로 흡수
  if (!kb.posts?.length) for (const [b, l] of Object.entries(readJSON(SNAP_FILE, {}).notices || {})) for (const x of l) byUrl.set(x.url, { ...x, board: b, firstSeen: today() });

  // --from=파일.json : 브라우저(로그인 세션)로 미리 수집한 글 목록을 그대로 학습
  const { found, errors } = ARGS.from ? { found: JSON.parse(fs.readFileSync(ARGS.from, "utf8")), errors: [] } : (log(`📥 수집 시작: 게시판 4개 × ${PAGES}쪽 (${BASE})`), await crawlLists());
  if (!found.length) {
    console.error("❌ 학교 사이트에서 글을 하나도 못 읽었어요. 지식베이스는 그대로 둡니다.", errors.join(" / "));
    process.exit(1);
  }

  const fresh = [];
  for (const x of found) {
    const old = byUrl.get(x.url);
    if (old) Object.assign(old, { title: x.title, date: x.date || old.date, campus: x.campus, by: x.by || old.by, lastSeen: today() });
    else { const p = { ...x, firstSeen: today(), lastSeen: today() }; byUrl.set(x.url, p); fresh.push(p); }
    if (x.body && x.body.length > (byUrl.get(x.url).body || "").length) Object.assign(byUrl.get(x.url), { body: x.body, tel: x.tel, files: x.files });
  }
  const needBody = [...byUrl.values()].filter((p) => (!p.body || p.body.length < 20) && (p.tries || 0) < 3); // 3번 실패한 글은 포기
  log(`🆕 새 글 ${fresh.length}건 · 본문 읽을 글 ${needBody.length}건`);
  await pool(needBody, 4, async (p) => { try { Object.assign(p, parseDetail(await get(p.url))); } catch (e) { p.tries = (p.tries || 0) + 1; errors.push(`본문 ${p.id}: ${e.message}`); } await sleep(250); });

  // AI 정리
  const todo = [...byUrl.values()].filter((p) => ARGS["redo-ai"] || !p.ai || p.ai.by === "rule").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let aiDone = 0;
  if (USE_AI && todo.length) {
    log(`🧠 Gemini 가 ${Math.min(todo.length, AI_MAX)}건을 읽고 정리하는 중...`);
    const r = await digest(todo.slice(0, AI_MAX));
    aiDone = r.done; errors.push(...r.errors);
  } else if (!USE_AI) log("ℹ️  GEMINI_API_KEY 가 없거나 --no-ai: 규칙 기반으로 정리합니다.");
  for (const p of byUrl.values()) if (!p.ai || p.ai.by === "rule") p.ai = ruleDigest(p);

  // 오래된 글 정리 + 정렬
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10).replace(/-/g, ".");
  const posts = [...byUrl.values()].filter((p) => !p.date || p.date >= cutoff).sort((a, b) => (b.date || "").localeCompare(a.date || "") || Number(b.id) - Number(a.id));
  const byBoard = Object.fromEntries(Object.keys(BOARDS).map((b) => [b, posts.filter((p) => p.board === b).length]));

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(KB_FILE, JSON.stringify({
    source: "강원대학교 홈페이지 공지사항 (www.kangwon.ac.kr) · 캠퍼스GO 매일 학습",
    updatedAt: new Date().toISOString(), labels: LABEL,
    stats: { total: posts.length, byBoard, aiDigested: posts.filter((p) => p.ai?.by && p.ai.by !== "rule").length, since: posts.reduce((m, p) => (p.firstSeen && p.firstSeen < m ? p.firstSeen : m), today()) },
    posts,
  }, null, 1));

  // 앱 기본 스냅샷(school.json)도 오늘 기준으로 갱신 — 기존 형식 그대로 + AI 필드
  const notices = Object.fromEntries(Object.keys(BOARDS).map((b) => [b, posts.filter((p) => p.board === b).slice(0, 20).map((p) => ({
    board: p.board, id: p.id, campus: p.campus, title: p.title, date: p.date, url: p.url, by: p.by || "", body: (p.body || "").slice(0, 700), tel: p.tel || "",
    summary: p.ai?.summary || null, deadline: p.ai?.deadline || null, target: p.ai?.target || null, keywords: p.ai?.keywords || [],
  }))]));
  fs.writeFileSync(SNAP_FILE, JSON.stringify({ source: "강원대학교 홈페이지 공지사항 (www.kangwon.ac.kr)", fetchedAt: new Date().toISOString(), labels: LABEL, notices }, null, 1));

  const entry = { at: new Date().toISOString(), date: today(), listed: found.length, new: fresh.length, newTitles: fresh.slice(0, 10).map((p) => p.title), aiDigested: aiDone, total: posts.length, seconds: Math.round((Date.now() - started) / 1000), errors: errors.slice(0, 10) };
  const hist = readJSON(LOG_FILE, []);
  fs.writeFileSync(LOG_FILE, JSON.stringify([entry, ...(Array.isArray(hist) ? hist : [])].slice(0, 90), null, 1));

  log(`✅ 학습 완료: 목록 ${found.length}건 확인 · 새 글 ${fresh.length}건 · AI 정리 ${aiDone}건 · 누적 ${posts.length}건 (${entry.seconds}초)`);
  for (const t of entry.newTitles) log(`   + ${t}`);
  if (errors.length) log(`⚠️  경고 ${errors.length}건:\n   ${errors.slice(0, 5).join("\n   ")}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
