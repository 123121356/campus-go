// 메신저 알림: 3D AI 요정에게 "텔레그램/디스코드로 보내줘" → 한 번 보내기 또는 주기적으로 보내기(구독)
//
// POST /api/notify  { kind:"link",   me, channel:"telegram" }                → 연결 링크(t.me/봇?start=코드) 또는 연결 상태
//                   { kind:"link",   me, channel:"discord", webhook:"https://discord.com/api/webhooks/..." }
//                   { kind:"unlink", me, channel }
//                   { kind:"send",   me, channel?, text }                    → 지금 한 번 보내기 (AI가 정리한 글)
//                   { kind:"subscribe", me, channel?, topics:[...], schedule:{...}, tt:[시간표], text?, filter? }
//                   { kind:"cancel", me, id | all:true }
//                   { kind:"tt",     me, tt:[시간표] }                          → 내 구독에 저장된 시간표 갱신
// GET  /api/notify?me=<토큰>                                                  → { links:{telegram,discord}, subs:[...] }
// POST /api/notify?run=1   (헤더 x-notify-secret: NOTIFY_SECRET)               → 때가 된 구독을 최신 정보로 만들어 보냄
//                                                                               (GitHub Actions가 15분마다 부름)
// 환경변수: KV_REST_API_URL/TOKEN(Upstash Redis), TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_NAME, NOTIFY_SECRET, APP_URL(선택)

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TG = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TG_NAME = (process.env.TELEGRAM_BOT_NAME || "").trim().replace(/^@/, "");
const SECRET = (process.env.NOTIFY_SECRET || "").trim();

const SUBS = "cg:subs", LINK = (me) => `cg:link:${me}`, CODE = (c) => `cg:tgcode:${c}`, TG_OFFSET = "cg:tgoffset";
const MAX_SUBS_PER_USER = 8, MAX_SENDS_PER_DAY = 40;
const TOPICS = ["weather", "class", "bus", "notices", "deadlines", "calendar", "community", "trends", "reminder"];
const TOPIC_KO = { weather: "날씨", class: "수업", bus: "버스", notices: "새 공지", deadlines: "마감 임박 공지", calendar: "학사일정", community: "커뮤니티 새 글", trends: "요즘 화제", reminder: "알림 메모" };
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const CENTER = [37.4527, 129.1655]; // 삼척캠퍼스
const CH_KO = { telegram: "텔레그램", discord: "디스코드" };

/* ---------------- 공통 ---------------- */
async function redis(cmds) {
  const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`DB ${r.status}`);
  const out = await r.json();
  const bad = out.find((x) => x && x.error);
  if (bad) throw new Error(bad.error);
  return out.map((x) => x.result);
}
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);
const tokenOk = (t) => typeof t === "string" && /^[a-z0-9]{8,40}$/i.test(t);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function send(res, code, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(code).send(JSON.stringify(obj));
}
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}

/* 한국 시간 */
const KST = 9 * 3600e3;
const kst = (ms = Date.now()) => new Date(ms + KST);            // getUTC* 로 한국 시각을 읽음
const kstDate = (ms) => kst(ms).toISOString().slice(0, 10);    // 2026-11-06
const kstMs = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+09:00`);
const toMin = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const dday = (date, now) => Math.round((Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${kstDate(now)}T00:00:00+09:00`)) / 86400e3);
const ddayText = (n) => (n === 0 ? "D-day" : n > 0 ? `D-${n}` : "마감됨");

/* ---------------- 메신저 ---------------- */
async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`텔레그램: ${j.description || r.status}`);
  return j.result;
}
const DISCORD_RE = /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
async function deliver(link, channel, text) {
  text = String(text).slice(0, channel === "discord" ? 1990 : 3900);
  if (channel === "telegram") {
    if (!TG) throw new Error("서버에 TELEGRAM_BOT_TOKEN 이 없어요");
    await tgApi("sendMessage", { chat_id: link.telegram, text, disable_web_page_preview: true });
  } else if (channel === "discord") {
    const r = await fetch(link.discord, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "캠퍼스GO AI 요정", content: text, allowed_mentions: { parse: [] } }) });
    if (!r.ok) throw new Error(`디스코드: ${r.status === 404 ? "웹훅이 삭제됐어요. 다시 연결해 주세요" : r.status}`);
  } else throw new Error("알 수 없는 메신저");
}
async function getLink(me) {
  const [h] = await redis([["HGETALL", LINK(me)]]);
  const o = {}; for (let i = 0; i < (h || []).length; i += 2) o[h[i]] = h[i + 1];
  return o;
}
const pickChannel = (want, link) => (want && link[want] ? want : !want ? (link.telegram ? "telegram" : link.discord ? "discord" : "") : "");
const linkedInfo = (link) => ({ telegram: !!link.telegram, discord: !!link.discord });

// 텔레그램 봇에 온 메시지 확인: "/start 코드" 를 보낸 사람을 그 코드의 사용자와 연결 (웹훅 없이 동작)
async function pollTelegram() {
  if (!TG) return 0;
  const [off] = await redis([["GET", TG_OFFSET]]);
  const ups = await tgApi("getUpdates", { offset: off ? +off + 1 : undefined, timeout: 0, allowed_updates: ["message"] });
  if (!ups.length) return 0;
  let linked = 0;
  for (const u of ups) {
    const m = u.message; if (!m?.chat?.id || !m.text) continue;
    const code = (m.text.match(/^\/start\s+([A-Za-z0-9]{6,12})/) || m.text.trim().match(/^([A-Z0-9]{6})$/) || [])[1];
    if (code) {
      const [me] = await redis([["GET", CODE(code.toUpperCase())]]);
      if (me) {
        await redis([["HSET", LINK(me), "telegram", String(m.chat.id)], ["DEL", CODE(code.toUpperCase())]]);
        linked++;
        await tgApi("sendMessage", { chat_id: m.chat.id, text: "✅ 캠퍼스GO와 연결됐어요!\n이제 3D 캠퍼스의 AI 요정에게 \"내일 아침 날씨 보내줘\"처럼 부탁해 보세요." }).catch(() => {});
        continue;
      }
    }
    if (/^\/start/.test(m.text)) await tgApi("sendMessage", { chat_id: m.chat.id, text: "연결 코드가 없거나 만료됐어요. 캠퍼스GO 3D 캠퍼스에서 AI 요정에게 \"텔레그램 연결해줘\"라고 말하면 새 링크를 드려요." }).catch(() => {});
  }
  await redis([["SET", TG_OFFSET, String(ups[ups.length - 1].update_id)]]);
  return linked;
}

/* ---------------- 보낼 내용 만들기 (서버에서 최신 데이터로) ---------------- */
function makeCtx(origin) {
  const cache = {};
  const once = (k, f) => (cache[k] ||= f().catch(() => null));
  return {
    weather: () => once("wx", async () => {
      const [lat, lng] = CENTER;
      const [wx, aq] = await Promise.all([
        getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=2`),
        getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5&timezone=Asia%2FSeoul`).catch(() => null),
      ]);
      return { wx, aq };
    }),
    bus: () => once("bus", () => getJSON(`${origin}/data/bus.json`)),
    calendar: () => once("cal", () => getJSON(`${origin}/data/calendar.json`)),
    school: () => once("school", async () => {
      try { const j = await getJSON(`${origin}/api/school`, 15000); if (j?.notices) return j; } catch {}
      return getJSON(`${origin}/data/school.json`);
    }),
    trends: () => once("trends", () => getJSON(`${origin}/data/trends.json`)),
    posts: () => once("posts", async () => { const [h] = await redis([["HVALS", "cg:posts"]]); return (h || []).map(json).filter(Boolean); }),
  };
}
const WMO = (c) => (c === 0 ? "☀️ 맑음" : c <= 3 ? "⛅ 구름" : c <= 48 ? "🌫 안개" : c <= 67 ? "🌧 비" : c <= 77 ? "🌨 눈" : c <= 82 ? "🌦 소나기" : "⛈ 뇌우");
const pmText = (v, cut) => (v == null ? "–" : v <= cut[0] ? "좋음" : v <= cut[1] ? "보통" : v <= cut[2] ? "나쁨" : "매우 나쁨");
const allNotices = (s) => { // 삼척·전체 캠퍼스 글만, 같은 제목(여러 게시판에 올라온 글)은 하나로
  const seen = new Set();
  return Object.values(s?.notices || {}).flat().filter((n) => n && (/삼척|ALL|전체/.test(n.campus || "ALL") || !n.campus) && !seen.has(n.title) && seen.add(n.title));
};

const SECTIONS = {
  async weather(ctx) {
    const d = await ctx.weather(); const c = d?.wx?.current, dl = d?.wx?.daily;
    if (!c) return "🌤 날씨: 지금은 날씨를 받아오지 못했어요";
    const rain = dl?.precipitation_probability_max?.[0];
    const pm = d.aq?.current;
    return `🌤 날씨 ${WMO(c.weather_code)} ${Math.round(c.temperature_2m)}° (체감 ${Math.round(c.apparent_temperature)}°) · 오늘 ${Math.round(dl.temperature_2m_min[0])}~${Math.round(dl.temperature_2m_max[0])}°`
      + `\n   비 올 확률 ${rain ?? "–"}%${rain >= 50 ? " → ☂️ 우산 챙기세요" : ""} · 미세먼지 ${pmText(pm?.pm10, [30, 80, 150])} / 초미세 ${pmText(pm?.pm2_5, [15, 35, 75])}`;
  },
  async class(ctx, sub, now, extra) {
    const tt = sub.tt || [];
    if (!tt.length) return "🗓 수업: 저장된 시간표가 없어요 (3D에서 요정에게 시간표를 알려 주세요)";
    if (extra?.cls) { const c = extra.cls; const left = Math.round((kstMs(kstDate(now), c.start) - now) / 60000); return `🔔 ${left}분 뒤 수업: ${c.name} (${c.start}~${c.end || ""})${c.place ? `\n   📍 ${c.place}` : ""}`; }
    const dow = kst(now).getUTCDay(), nm = kst(now).getUTCHours() * 60 + kst(now).getUTCMinutes();
    const today = tt.filter((c) => c.day === dow).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (!today.length) return `🗓 오늘(${DAYS[dow]}) 수업 없음 🎉`;
    const next = today.find((c) => toMin(c.start) > nm);
    return `🗓 오늘 수업 ${today.length}개` + today.map((c) => `\n   ${toMin(c.end) < nm ? "✔" : c === next ? "▶" : "·"} ${c.start} ${c.name}${c.place ? ` (${c.place})` : ""}`).join("")
      + (next ? `\n   다음 수업까지 ${toMin(next.start) - nm}분` : "");
  },
  async bus(ctx, sub, now) {
    const b = await ctx.bus(); if (!b?.routes) return "🚌 버스: 시간표를 불러오지 못했어요";
    const k = kst(now), nm = k.getUTCHours() * 60 + k.getUTCMinutes(), weekend = [0, 6].includes(k.getUTCDay());
    const line = (dir) => {
      const off = b.directions?.[dir]?.offsetMin || 0;
      const list = b.routes.flatMap((r) => (r.times?.[dir] || []).filter((t) => !(weekend && t.weekdayOnly)).map((t) => ({ no: r.no, at: toMin(t.t) + off })))
        .filter((x) => x.at >= nm).sort((a, c) => a.at - c.at).slice(0, 2);
      return `   ${b.directions?.[dir]?.label || dir}: ${list.length ? list.map((x) => `${x.no} ${hhmm(x.at)}(${x.at - nm}분 뒤)`).join(", ") : "오늘 남은 버스 없음"}`;
    };
    return `🚌 후문 정류장 (시간표 추정, 몇 분 차이 날 수 있어요)\n${line("donghae")}\n${line("samcheok")}`;
  },
  async notices(ctx, sub, now, extra, state) {
    const s = await ctx.school(); if (!s) return null;
    const seen = new Set(sub.seen || []);
    const list = allNotices(s);
    const fresh = list.filter((n) => !seen.has(`${n.board}:${n.id}`));
    state.seen = [...new Set([...list.map((n) => `${n.board}:${n.id}`), ...(sub.seen || [])])].slice(0, 400);
    const kw = (sub.filter || "").split(/[\s,]+/).filter((w) => w.length >= 2);
    const hits = fresh.filter((n) => !kw.length || kw.some((w) => `${n.title} ${n.summary || ""} ${(n.keywords || []).join(" ")}`.includes(w))).slice(0, 5);
    if (!hits.length) return sub.schedule.type === "on_new" ? null : "📢 새 공지 없음";
    const lab = s.labels || {};
    return `📢 새 공지 ${hits.length}건${kw.length ? ` (${kw.join(", ")})` : ""}` + hits.map((n) => `\n· [${lab[n.board] || n.board}] ${n.title}${n.deadline ? ` · 마감 ${n.deadline} ${ddayText(dday(n.deadline, now))}` : ""}\n  ${n.url}`).join("");
  },
  async deadlines(ctx, sub, now, extra, state) {
    const s = await ctx.school(); if (!s) return null;
    const hits = allNotices(s).filter((n) => n.deadline && dday(n.deadline, now) >= 0 && dday(n.deadline, now) <= 7)
      .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6);
    if (sub.schedule.type === "on_new") { // 새로 '7일 안'에 들어온 것만
      const seen = new Set(sub.seen || []); const f = hits.filter((n) => !seen.has(`dl:${n.board}:${n.id}`));
      state.seen = [...new Set([...hits.map((n) => `dl:${n.board}:${n.id}`), ...(sub.seen || [])])].slice(0, 400);
      if (!f.length) return null;
      return `⏰ 마감 임박 공지` + f.map((n) => `\n· ${ddayText(dday(n.deadline, now))} ${n.title}\n  ${n.url}`).join("");
    }
    return hits.length ? `⏰ 7일 안에 마감되는 공지` + hits.map((n) => `\n· ${ddayText(dday(n.deadline, now))} ${n.title}`).join("") : "⏰ 7일 안에 마감되는 공지 없음";
  },
  async calendar(ctx, sub, now) {
    const c = await ctx.calendar(); if (!c?.events) return null;
    const ev = c.events.filter((e) => dday(e.end || e.start, now) >= 0 && dday(e.start, now) <= 7).slice(0, 5);
    return ev.length ? `📅 학사일정 (7일 안)` + ev.map((e) => `\n· ${dday(e.start, now) <= 0 ? "진행 중" : ddayText(dday(e.start, now))} ${e.title}${e.end && e.end !== e.start ? ` (~${e.end.slice(5)})` : ""}`).join("") : "📅 7일 안 학사일정 없음";
  },
  async community(ctx, sub, now, extra, state) {
    const posts = await ctx.posts(); if (!posts) return null;
    const since = sub.lastAt || sub.createdAt;
    const kw = (sub.filter || "").split(/[\s,]+/).filter(Boolean);
    const hits = posts.filter((p) => p.at > since && !p.done && p.owner !== sub.owner && (!kw.length || kw.some((w) => `${p.type} ${p.title} ${p.body}`.includes(w))))
      .sort((a, b) => b.at - a.at).slice(0, 5);
    state.lastAt = now;
    if (!hits.length) return sub.schedule.type === "on_new" ? null : "💬 커뮤니티 새 글 없음";
    return `💬 커뮤니티 새 글${kw.length ? ` (${kw.join(", ")})` : ""}` + hits.map((p) => `\n· [${p.type}] ${p.title}${p.body && p.body !== p.title ? ` — ${p.body.slice(0, 60)}` : ""}`).join("");
  },
  async trends(ctx) {
    const j = await ctx.trends(); const list = (j?.topics || []).filter((t) => !t.cooling).slice(0, 5);
    if (!list.length) return null;
    return `📰 요즘 화제 (커뮤니티·검색 트렌드 AI 요약, 분위기 참고용)` + list.map((t) => `\n· ${t.title} — ${t.summary}`).join("");
  },
  async reminder(ctx, sub) { return sub.text ? `📝 ${sub.text}` : null; },
};

async function compose(ctx, sub, now, extra) {
  const state = {};
  const parts = [];
  for (const t of sub.topics) {
    try { const s = await SECTIONS[t]?.(ctx, sub, now, extra, state); if (s) parts.push(s); }
    catch (e) { parts.push(`(${TOPIC_KO[t]}: 불러오지 못했어요)`); }
  }
  if (!parts.length) return { text: "", state };
  const k = kst(now);
  const head = `🤖 캠퍼스GO AI 요정 · ${k.getUTCMonth() + 1}/${k.getUTCDate()}(${DAYS[k.getUTCDay()]}) ${hhmm(k.getUTCHours() * 60 + k.getUTCMinutes())}${sub.title ? `\n「${sub.title}」` : ""}`;
  const foot = sub.schedule.type === "once" ? "" : `\n\n그만 받으려면 3D 캠퍼스에서 AI 요정에게 "알림 그만"이라고 말해 주세요.`;
  return { text: `${head}\n\n${parts.join("\n\n")}${foot}`, state };
}

/* ---------------- 일정 ---------------- */
function normSchedule(s = {}) {
  const type = String(s.type || "").toLowerCase();
  if (type === "daily") {
    const time = String(s.time || "").match(/^(\d{1,2}):(\d{2})$/) ? s.time.padStart(5, "0") : null;
    if (!time || toMin(time) >= 1440) throw new Error("매일 보낼 시각(HH:MM)이 필요해요");
    let days = Array.isArray(s.days) ? s.days.map(Number).filter((d) => d >= 0 && d <= 6) : String(s.days || "").split("").map((c) => DAYS.indexOf(c)).filter((d) => d >= 0);
    if (/평일/.test(String(s.days))) days = [1, 2, 3, 4, 5];
    if (/주말/.test(String(s.days))) days = [0, 6];
    return { type, time, days: days.length ? [...new Set(days)].sort() : [0, 1, 2, 3, 4, 5, 6] };
  }
  if (type === "before_class") { const m = Math.round(+s.minutes || 15); return { type, minutes: Math.min(120, Math.max(5, m)) }; }
  if (type === "interval") { const h = Math.round(+s.hours || 3); return { type, hours: Math.min(24, Math.max(1, h)) }; }
  if (type === "on_new") return { type };
  if (type === "once") {
    const at = Date.parse(/[+Z]/.test(String(s.at).slice(10)) ? s.at : `${String(s.at).replace(" ", "T").slice(0, 16)}:00+09:00`);
    if (!at || at < Date.now() - 10 * 60e3) throw new Error("한 번 보낼 시각(YYYY-MM-DDTHH:MM, 한국 시간)이 필요해요");
    return { type, at };
  }
  throw new Error("schedule.type 은 daily, before_class, interval, on_new, once 중 하나예요");
}
function describe(sub) {
  const s = sub.schedule;
  const days = s.days?.length === 7 ? "매일" : s.days?.join() === "1,2,3,4,5" ? "평일" : s.days?.join() === "0,6" ? "주말" : (s.days || []).map((d) => DAYS[d]).join("·");
  const when = s.type === "daily" ? `${days} ${s.time}` : s.type === "before_class" ? `수업 ${s.minutes}분 전` : s.type === "interval" ? `${s.hours}시간마다` : s.type === "on_new" ? "새 소식이 생길 때 (15분마다 확인)" : `${kstDate(s.at)} ${hhmm(kst(s.at).getUTCHours() * 60 + kst(s.at).getUTCMinutes())} 한 번`;
  return { id: sub.id, title: sub.title || "", channel: CH_KO[sub.channel], when, topics: sub.topics.map((t) => TOPIC_KO[t]), filter: sub.filter || "" };
}
// 지금 보낼 때가 됐나? → { due, extra, key }
function dueCheck(sub, now) {
  const s = sub.schedule;
  if (s.type === "once") return { due: now >= s.at, late: now - s.at > 6 * 3600e3 };
  if (s.type === "interval") return { due: now - (sub.lastAt || sub.createdAt) >= s.hours * 3600e3 - 60e3 };
  if (s.type === "on_new") return { due: true, quiet: true };
  const date = kstDate(now), dow = kst(now).getUTCDay();
  if (s.type === "daily") {
    const at = kstMs(date, s.time);
    return { due: s.days.includes(dow) && now >= at && now - at < 2 * 3600e3 && (sub.lastAt || 0) < at };
  }
  if (s.type === "before_class") {
    for (const c of (sub.tt || []).filter((c) => c.day === dow).sort((a, b) => toMin(a.start) - toMin(b.start))) {
      const start = kstMs(date, c.start), key = `${date}:${c.start}:${c.name}`;
      if (now >= start - s.minutes * 60e3 && now < start && !(sub.sent || []).includes(key)) return { due: true, extra: { cls: c }, key };
    }
  }
  return { due: false };
}

/* ---------------- 주기 실행 ---------------- */
async function run(origin) {
  const now = Date.now();
  const linkedTg = await pollTelegram().catch(() => 0);
  const [h] = await redis([["HVALS", SUBS]]);
  const subs = (h || []).map(json).filter(Boolean);
  const ctx = makeCtx(origin);
  const links = {}, writes = [], log = [];
  for (const sub of subs) {
    const d = dueCheck(sub, now);
    if (!d.due) continue;
    if (d.late) { writes.push(["HDEL", SUBS, sub.id]); log.push({ id: sub.id, skipped: "늦어서 취소" }); continue; }
    const link = (links[sub.owner] ||= await getLink(sub.owner));
    if (!link[sub.channel]) { log.push({ id: sub.id, skipped: "메신저 연결 안 됨" }); continue; }
    const { text, state } = await compose(ctx, sub, now, d.extra);
    if (state.seen) sub.seen = state.seen;
    if (!text) { if (state.seen || state.lastAt) { if (state.lastAt) sub.lastAt = state.lastAt; writes.push(["HSET", SUBS, sub.id, JSON.stringify(sub)]); } continue; }
    try {
      await deliver(link, sub.channel, text);
      sub.lastAt = now; sub.fails = 0;
      if (d.key) sub.sent = [...(sub.sent || []), d.key].slice(-30);
      log.push({ id: sub.id, sent: true });
    } catch (e) {
      sub.fails = (sub.fails || 0) + 1; log.push({ id: sub.id, error: e.message });
      if (sub.fails >= 5) { writes.push(["HDEL", SUBS, sub.id]); continue; }
    }
    writes.push(sub.schedule.type === "once" && sub.lastAt === now ? ["HDEL", SUBS, sub.id] : ["HSET", SUBS, sub.id, JSON.stringify(sub)]);
  }
  if (writes.length) await redis(writes);
  return { ok: true, at: new Date(now).toISOString(), subs: subs.length, telegramLinked: linkedTg, results: log };
}

/* ---------------- 핸들러 ---------------- */
export default async function handler(req, res) {
  if (!URL_ || !TOKEN) return send(res, 503, { code: "NO_DB", error: "메신저 알림은 공유 저장소(Upstash Redis)가 있어야 동작해요. .env 의 KV_REST_API_URL·KV_REST_API_TOKEN 을 채워 주세요." });
  const proto = req.headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(req.headers.host || "") ? "http" : "https");
  const origin = (process.env.APP_URL || `${proto}://${req.headers.host}`).replace(/\/$/, "");
  try {
    if (req.query?.run) {
      if (!SECRET) return send(res, 503, { error: "서버에 NOTIFY_SECRET 이 없어요" });
      if (req.headers["x-notify-secret"] !== SECRET && req.query.secret !== SECRET) return send(res, 401, { error: "비밀값이 달라요" });
      return send(res, 200, await run(origin));
    }

    if (req.method === "GET") {
      const me = tokenOk(req.query?.me) ? req.query.me : "";
      if (!me) return send(res, 400, { error: "사용자 토큰이 없어요" });
      if (TG) await pollTelegram().catch(() => {});
      const [link, [h]] = await Promise.all([getLink(me), redis([["HVALS", SUBS]])]);
      const subs = (h || []).map(json).filter((s) => s?.owner === me).map(describe);
      return send(res, 200, { links: linkedInfo(link), subs, telegramReady: !!(TG && TG_NAME) });
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET 또는 POST만 돼요" });

    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const me = tokenOk(b.me) ? b.me : "";
    if (!me) return send(res, 400, { error: "사용자 토큰이 없어요" });
    const channel = ["telegram", "discord"].includes(b.channel) ? b.channel : "";

    if (b.kind === "link") {
      if (channel === "discord") {
        const link = await getLink(me);
        const wh = clip(b.webhook, 300);
        if (!wh) return send(res, 200, { channel, linked: !!link.discord, how: "디스코드 채널 설정(⚙) › 연동 › 웹후크 › 새 웹후크 › '웹후크 URL 복사' 후 그 주소를 요정에게 붙여 넣어 주세요. (https://discord.com/api/webhooks/... 형식)" });
        if (!DISCORD_RE.test(wh)) return send(res, 400, { error: "디스코드 웹후크 주소 형식이 아니에요 (https://discord.com/api/webhooks/숫자/토큰)" });
        await deliver({ discord: wh }, "discord", "✅ 캠퍼스GO AI 요정과 연결됐어요! 이 채널로 알림을 보내 드릴게요.");
        await redis([["HSET", LINK(me), "discord", wh]]);
        return send(res, 200, { channel, linked: true, message: "디스코드 연결 완료 (테스트 메시지를 보냈어요)" });
      }
      if (channel === "telegram") {
        if (!TG || !TG_NAME) return send(res, 503, { error: "서버에 TELEGRAM_BOT_TOKEN·TELEGRAM_BOT_NAME 이 설정되지 않았어요" });
        await pollTelegram().catch(() => {});
        const link = await getLink(me);
        if (link.telegram) return send(res, 200, { channel, linked: true });
        let code = link.tgcode;
        const [alive] = code ? await redis([["GET", CODE(code)]]) : [null];
        if (!alive) {
          code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
          await redis([["SET", CODE(code), me, "EX", 1800], ["HSET", LINK(me), "tgcode", code]]);
        }
        return send(res, 200, { channel, linked: false, url: `https://t.me/${TG_NAME}?start=${code}`, code, how: "링크를 열고 텔레그램에서 '시작(Start)'을 누르면 연결돼요 (30분 안에). 누른 뒤 '연결했어'라고 말해 주세요." });
      }
      return send(res, 400, { error: "channel 은 telegram 또는 discord" });
    }

    if (b.kind === "unlink") {
      if (!channel) return send(res, 400, { error: "channel 이 필요해요" });
      await redis([["HDEL", LINK(me), channel]]);
      return send(res, 200, { ok: true, unlinked: channel });
    }

    if (b.kind === "send") {
      const link = await getLink(me);
      const ch = pickChannel(channel, link);
      if (!ch) return send(res, 409, { code: "NOT_LINKED", links: linkedInfo(link), error: `${channel ? CH_KO[channel] : "메신저"}가 아직 연결되지 않았어요` });
      const text = clip(b.text, 3500);
      if (!text) return send(res, 400, { error: "보낼 내용이 없어요" });
      const day = kstDate(Date.now());
      const [n] = await redis([["INCR", `cg:sendcnt:${me}:${day}`], ["EXPIRE", `cg:sendcnt:${me}:${day}`, 90000]]);
      if (n > MAX_SENDS_PER_DAY) return send(res, 429, { error: "오늘 보낼 수 있는 횟수를 넘었어요" });
      await deliver(link, ch, `🤖 캠퍼스GO AI 요정\n\n${text}`);
      return send(res, 200, { sent: true, channel: CH_KO[ch] });
    }

    if (b.kind === "subscribe") {
      const link = await getLink(me);
      const ch = pickChannel(channel, link);
      if (!ch) return send(res, 409, { code: "NOT_LINKED", links: linkedInfo(link), error: `${channel ? CH_KO[channel] : "메신저"}가 아직 연결되지 않았어요` });
      const topics = [...new Set((Array.isArray(b.topics) ? b.topics : String(b.topics || "").split(/[\s,]+/)).map((t) => String(t).toLowerCase()).filter((t) => TOPICS.includes(t)))];
      if (!topics.length) return send(res, 400, { error: `topics 가 필요해요: ${TOPICS.join(", ")}` });
      let schedule; try { schedule = normSchedule(b.schedule); } catch (e) { return send(res, 400, { error: e.message }); }
      if (topics.includes("reminder") && !clip(b.text, 300)) return send(res, 400, { error: "reminder 에는 보낼 메모(text)가 필요해요" });
      const [h] = await redis([["HVALS", SUBS]]);
      const mine = (h || []).map(json).filter((s) => s?.owner === me);
      if (mine.length >= MAX_SUBS_PER_USER) return send(res, 429, { error: `구독은 ${MAX_SUBS_PER_USER}개까지예요. 안 쓰는 구독을 먼저 해지해 주세요.`, subs: mine.map(describe) });
      const tt = (Array.isArray(b.tt) ? b.tt : []).slice(0, 60).map((c) => ({ name: clip(c.name, 40), day: +c.day, start: clip(c.start, 5), end: clip(c.end, 5), place: clip(c.place, 40) })).filter((c) => c.name && c.day >= 0 && c.day <= 6 && toMin(c.start) != null);
      if ((schedule.type === "before_class" || topics.includes("class")) && !tt.length) return send(res, 400, { error: "시간표가 비어 있어요. 먼저 시간표를 등록해 주세요." });
      const sub = { id: uid(), owner: me, channel: ch, topics, schedule, tt, text: clip(b.text, 300), filter: clip(b.filter, 60), title: clip(b.title, 40), createdAt: Date.now(), lastAt: 0 };
      // 새 공지·마감은 '지금까지 있던 것'을 본 것으로 처리 → 앞으로 새로 생긴 것만 보냄
      if (schedule.type === "on_new" || topics.includes("notices")) {
        const st = {}; const ctx = makeCtx(origin);
        for (const t of ["notices", "deadlines"]) if (topics.includes(t)) { await SECTIONS[t](ctx, { ...sub, schedule: { type: "on_new" } }, Date.now(), null, st).catch(() => {}); if (st.seen) sub.seen = [...new Set([...(sub.seen || []), ...st.seen])]; }
        if (topics.includes("community")) sub.lastAt = Date.now();
      }
      await redis([["HSET", SUBS, sub.id, JSON.stringify(sub)]]);
      let preview = "";
      if (b.preview) { try { const { text } = await compose(makeCtx(origin), { ...sub, schedule: { type: "daily" } }, Date.now()); if (text) { await deliver(link, ch, `👀 미리보기 (구독 확인용)\n\n${text}`); preview = "미리보기를 보냈어요"; } } catch {} }
      return send(res, 200, { ok: true, subscription: describe(sub), preview, note: "주기 알림은 서버가 15분마다 확인해서 보내요 (몇 분 늦을 수 있어요)" });
    }

    if (b.kind === "cancel") {
      const [h] = await redis([["HVALS", SUBS]]);
      const mine = (h || []).map(json).filter((s) => s?.owner === me);
      const del = b.all ? mine : mine.filter((s) => s.id === b.id);
      if (!del.length) return send(res, 404, { error: "해당 구독이 없어요", subs: mine.map(describe) });
      await redis([["HDEL", SUBS, ...del.map((s) => s.id)]]);
      return send(res, 200, { ok: true, cancelled: del.map(describe) });
    }

    if (b.kind === "tt") {
      const tt = (Array.isArray(b.tt) ? b.tt : []).slice(0, 60).map((c) => ({ name: clip(c.name, 40), day: +c.day, start: clip(c.start, 5), end: clip(c.end, 5), place: clip(c.place, 40) }));
      const [h] = await redis([["HVALS", SUBS]]);
      const mine = (h || []).map(json).filter((s) => s?.owner === me);
      if (mine.length) await redis(mine.map((s) => ["HSET", SUBS, s.id, JSON.stringify({ ...s, tt })]));
      return send(res, 200, { ok: true, updated: mine.length });
    }

    return send(res, 400, { error: "알 수 없는 요청" });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
}
