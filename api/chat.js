// POST /api/chat  { messages:[{role:'user'|'assistant', content}], context:{ buildings, bus, now } }
// GEMINI_API_KEY 가 있으면 Gemini, 없고 GROQ_API_KEY 가 있으면 Groq 를 씁니다.
// 키는 서버(환경변수)에만 있고 브라우저로 내려가지 않습니다.

const SYSTEM = `너는 "캠퍼스GO"의 안내 도우미다. 강원대학교 삼척캠퍼스에 처음 오는 신입생·방문객·외부인을 돕는다. 캠퍼스를 전혀 모르는 사람 기준으로 쉽고 짧게 말한다.
규칙:
- 아래 [캠퍼스 데이터]와 [버스 데이터]에 있는 사실만 근거로 답한다. 없는 정보는 지어내지 말고 "확인된 정보가 없어요"라고 말한 뒤 학교 대표번호나 학과 사무실 문의를 권한다.
- 답은 짧게(3~5문장). 질문이 영어면 영어로 답한다.
- 시설(ATM, 프린터, 식당 등)을 물으면 [캠퍼스 데이터]의 inside 항목에서 찾아, 해당 건물마다 [[MAP:건물id]] 를 모두 붙인다(지도에 핀이 찍힌다). 몇 층/어디인지 짧게 적는다.
- 길·가는 방법을 물으면 목적지 건물에 [[ROUTE:건물id]] 를 붙인다(앱이 현재 위치→목적지 경로를 그린다).
- 건물을 안내할 때는 문장 끝에 [[MAP:건물id]] 를 붙인다. 버스를 안내할 때는 [[BUS]] 를 붙인다. (앱이 버튼으로 바꿔 준다)
- 날씨·우산·미세먼지 질문은 [날씨 데이터]로 답하고 끝에 [[WX]] 를 붙인다. 예보이므로 바뀔 수 있다고 짧게 덧붙인다.
- 특정 층 내부를 안내할 때는 [[FLOOR:건물id:층]] 을 붙인다 (예: [[FLOOR:n120:2F]]). [층별 내부] 데이터에 있는 층만 쓴다.
- 버스 시각은 정류장 시간표로 계산한 '추정'이다. 실시간이 아니라 몇 분 차이가 날 수 있다고 덧붙인다. 21-n번은 후문 정류장에서 탄다. 주말·공휴일 미운행 편에 주의시킨다. 학교 통학버스(셔틀)는 재학생 전용이라 방문객·주민에게는 시내버스를 안내한다.
- 좌표(위도/경도) 숫자는 사용자에게 보여주지 않는다.
- 개인정보(학번, 전화번호 등)를 묻거나 받지 않는다.`;

function buildSystem(ctx = {}) {
  const b = (ctx.buildings || []).map((x) => ({
    id: x.id, no: x.no, name: x.name, aliases: x.aliases, category: x.category, inside: x.inside, keywords: x.keywords,
  }));
  return `${SYSTEM}

[현재 시각] ${ctx.now || new Date().toISOString()}
[캠퍼스 데이터]
${JSON.stringify(b)}
[버스 데이터]
${JSON.stringify(ctx.bus || {})}
[날씨 데이터]
${JSON.stringify(ctx.weather || {})}
[층별 내부] (건물id → 층별 설명과 사진 제목)
${JSON.stringify(ctx.floors || {})}`;
}

// 모델이 단종되면 다음 후보로 자동 전환
const GEMINI_MODELS = [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"].filter(Boolean))]; // .env 의 GEMINI_MODEL 우선, 그다음 최신 별칭
let geminiOk = null;
async function callGemini(system, messages) {
  let lastErr;
  for (const model of geminiOk ? [geminiOk] : GEMINI_MODELS) {
    try { const out = await callGeminiModel(model, system, messages); geminiOk = model; return out; }
    catch (e) { lastErr = e; if (!/no longer available|not found|not supported|404|high demand|overloaded|unavailable|503|abort|timeout/i.test(e.message)) throw e; }
  }
  throw lastErr;
}
async function callGeminiModel(model, system, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  const r = await fetch(url, {
    signal: ctl.signal,
    method: "POST",
    // 키는 URL 대신 헤더로 전달 (로그에 키가 남지 않고, 새 형식 키도 지원)
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY.trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
    }),
  });
  clearTimeout(timer);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

async function callGroq(system, messages) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 600,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Groq ${r.status}`);
  return j?.choices?.[0]?.message?.content || "";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "POST only" }));
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const messages = (body.messages || [])
      .filter((m) => m && typeof m.content === "string")
      .slice(-10)
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 1000) }));
    if (!messages.length) return res.status(400).send(JSON.stringify({ error: "messages 가 비었습니다" }));

    const system = buildSystem(body.context);
    let reply, provider;
    if (process.env.GEMINI_API_KEY) {
      reply = await callGemini(system, messages); provider = "gemini";
    } else if (process.env.GROQ_API_KEY) {
      reply = await callGroq(system, messages); provider = "groq";
    } else {
      return res.status(503).send(JSON.stringify({ error: "LLM 키가 설정되지 않았습니다", code: "NO_KEY" }));
    }
    res.status(200).send(JSON.stringify({ reply, provider }));
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: e.message }));
  }
}
