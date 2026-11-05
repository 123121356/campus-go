// POST /api/agent  { contents: Gemini 형식 대화(텍스트·이미지·도구 결과), profile }
// → { content: 모델 응답(텍스트 또는 도구 호출), model }
// 에이전트 루프: 모델이 도구 호출을 돌려주면 브라우저가 앱 데이터로 도구를 실행하고 결과를 다시 보냅니다.
// (키는 서버에만 있고, 도구는 사용자 기기의 시간표·위치·제보 데이터를 그대로 씁니다.)

const SYSTEM = `너는 "캠퍼스GO AI", 강원대학교 삼척캠퍼스 전용 AI 비서다. 재학생·신입생·방문객의 캠퍼스 생활을 돕는다.
너는 도구(function)를 써서 실제 데이터를 확인한 뒤 답하는 에이전트다.

[원칙]
- 사실은 반드시 도구 결과에 근거한다. 도구에 없는 내용은 지어내지 말고 "확인된 정보가 없어요"라고 말한 뒤 어디서 확인하면 되는지(학과 사무실, K-Cloud, 학생지원과 전화 등) 알려 준다.
- 필요한 도구는 여러 번, 여러 개 불러도 된다. 예: "10분 뒤 301호 수업" → get_schedule로 과목·건물 확인 → navigate로 길·층·시간 안내.
- 데이터 종류를 구분해서 말한다: [학교 공지]·[학사일정](공식), [시간표 추정]/[시간대 추정](계산값), [제보](사용자 제보). 실시간 센서 데이터가 없으면 그렇다고 밝힌다.
- 마감일이 있는 공지는 날짜와 남은 기간(D-n)을 같이 말한다. 지난 마감은 "마감됨"이라고 한다.
- 장학금 질문: search_school_info(category=scholarship)로 찾고, 자격(성적·소득분위·학년 등)을 짧게 정리한다. 사용자가 조건을 알려주면 맞는지 따져 준다. 최종 판단은 공지 원문·학생지원과 확인을 권한다.
- 졸업 요건처럼 학과마다 다른 정보는 데이터가 없으면 K-Cloud(학부생서비스 > 졸업)와 학과 사무실을 안내한다.
- 시간표 사진이 오면 과목명·요일·시작/끝 시각·강의실을 읽어 add_classes로 등록한다. 건물은 강의실 번호 앞 글자나 건물명으로 추정하고, 모르면 비워 둔다.
- 공강 추천: get_schedule의 공강 시간과 find_place·campus_status·search_school_info(event)를 조합해 구체적으로 2~3개 제안한다.
- 혼잡도·좌석 질문: campus_status를 쓴다. 제보가 없으면 시간대 추정임을 밝히고, 사용자가 상황을 알려 주면 report_status로 제보를 남긴다.
- 커뮤니티(분실물, 중고거래, 팀원 모집, 동아리·행사, 주변 정보) 글쓰기 요청은 community(action=post)로 올리고, 개인정보(전화번호 등)는 적지 말고 앱 안 연락 방법을 쓰라고 안내한다.
- 답은 한국어로 짧고 친근하게(보통 2~6줄). 목록은 "· "로 시작한다. 영어 질문엔 영어로.
- 건물·시설 이름은 도구 결과에 나온 이름 그대로 쓴다(예: "도서관", "그린에너지 연구관 10층 카페"). 결과에 없는 장소·이름·운영시간을 만들지 않는다.
- 운영시간 데이터가 없으면 "운영 여부는 확인이 필요해요"라고 말한다.
- 좌표 숫자, 내부 id(n101 등)는 사용자에게 보여 주지 않는다.`

const T = (name, description, properties = {}, required = []) => ({ name, description, parameters: { type: "OBJECT", properties, required } });
const S = (d) => ({ type: "STRING", description: d });
const TOOLS = [{ functionDeclarations: [
  T("find_place", "캠퍼스 건물·시설(ATM, 프린터, 식당, 편의점, 카페, 화장실, 휴게실, 열람실, 헬스장 등)을 찾아 지도에 핀을 찍는다.", { query: S("찾을 장소나 시설") }, ["query"]),
  T("navigate", "현재 위치(없으면 정문)에서 목적지 건물까지 걷는 경로를 지도에 그리고, 거리·도보 시간·몇 층인지·도착 예상 시각을 돌려준다.", { destination: S("건물명 또는 강의실(예: 5공학관, 301호, 제5공학관 301호)"), room: S("호실 번호(선택)") }, ["destination"]),
  T("get_schedule", "사용자 개인 시간표에서 오늘/특정 요일 수업, 다음 수업까지 남은 시간, 공강 시간을 돌려준다.", { day: S("today, tomorrow, 또는 월~일 (선택)") }),
  T("add_classes", "개인 시간표에 수업을 추가한다.", { classes: { type: "ARRAY", items: { type: "OBJECT", properties: { name: S("과목명"), day: S("요일: 월 화 수 목 금 토 일"), start: S("시작 HH:MM"), end: S("끝 HH:MM"), place: S("건물명/강의실, 예: 5공학관 301호") }, required: ["name", "day", "start"] } } }, ["classes"]),
  T("remove_class", "시간표에서 과목을 지운다.", { name: S("과목명") }, ["name"]),
  T("get_bus", "강원대 후문 정류장 시내버스(21-1, 21-3) 다음 도착 추정과 통학버스(셔틀) 운행 상태·추정 위치를 돌려준다.", { direction: S("donghae(동해 방면) 또는 samcheok(삼척 시내 방면), 선택") }),
  T("get_weather", "삼척캠퍼스 현재 날씨, 비 예보, 미세먼지를 돌려준다."),
  T("search_school_info", "강원대 공식 공지(일반·학사·장학·행사)와 학사일정을 검색한다. 장학금, 수강신청, 계절학기, 학점교류, 전과, 부·복수전공, 휴학·복학, 행사, 공지 요약에 쓴다.", { query: S("검색어(빈 문자열이면 최신순)"), category: S("all, notice, academic, scholarship, event, calendar 중 하나") }),
  T("campus_status", "식당·도서관·건물 등의 혼잡도/이용 현황. 최근 사용자 제보와 시간대 추정을 구분해 돌려준다.", { place: S("장소(선택, 비우면 전체)") }),
  T("report_status", "사용자가 본 현장 상황(혼잡도)을 제보로 저장한다.", { place: S("장소"), level: S("여유, 보통, 혼잡 중 하나"), note: S("한 줄 메모(선택)") }, ["place", "level"]),
  T("community", "캠퍼스 커뮤니티 글 목록 보기 또는 글 쓰기. 종류: 분실물, 중고거래, 팀원모집, 동아리·행사, 주변정보, 학식메뉴.", { action: S("list 또는 post"), type: S("글 종류(선택)"), title: S("제목(post)"), body: S("내용(post)") }, ["action"]),
  T("get_meals", "교내 식당·푸드코트·카페 위치와 지금 운영/혼잡 추정, 사용자가 제보한 오늘 메뉴·가격을 돌려준다."),
] }];

// 빠른 모델 우선. 혼잡·무료 한도 초과면 다음 모델로 자동 전환 (시연 중에도 끊기지 않게)
const MODELS = [...new Set(["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.7-flash", process.env.GEMINI_MODEL].filter(Boolean))];
// dev-server는 요청마다 모듈을 다시 읽으므로 상태는 globalThis에 보관
const G = (globalThis.__cgAgent ||= { okModel: null, coolUntil: {} });

async function callModel(model, body) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 11000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      signal: ctl.signal, method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
    const content = j?.candidates?.[0]?.content;
    if (!content?.parts?.length) throw new Error(j?.candidates?.[0]?.finishReason || "빈 응답");
    return content;
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!process.env.GEMINI_API_KEY) return res.status(503).send(JSON.stringify({ error: "GEMINI_API_KEY 가 없습니다", code: "NO_KEY" }));
  if (req.method === "GET") { // 상태 확인: 이 키로 쓸 수 있는 모델 목록 (키 값은 내보내지 않음)
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY.trim() } });
      const j = await r.json();
      const models = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace("models/", ""));
      let probe = null;
      if (req.query?.probe) probe = await Promise.all(MODELS.map(async (m) => { const t = Date.now(); try { await callModel(m, { contents: [{ role: "user", parts: [{ text: "안녕" }] }], generationConfig: { maxOutputTokens: 20 } }); return { m, ok: true, ms: Date.now() - t }; } catch (e) { return { m, ok: false, ms: Date.now() - t, err: e.message.slice(0, 80) }; } }));
      return res.status(200).send(JSON.stringify({ candidates: MODELS, lastOk: G.okModel, cooling: G.coolUntil, probe, available: models }));
    } catch (e) { return res.status(502).send(JSON.stringify({ error: e.message })); }
  }
  if (req.method !== "POST") return res.status(405).send(JSON.stringify({ error: "POST only" }));
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const contents = (body.contents || []).filter((c) => c && Array.isArray(c.parts) && c.parts.length).slice(-40);
    if (!contents.length) return res.status(400).send(JSON.stringify({ error: "contents 가 비었습니다" }));
    const p = body.profile || {};
    const system = `${SYSTEM}\n\n[지금] ${p.now || new Date().toISOString()} (한국 시간)\n[사용자] ${p.role || "알 수 없음"}${p.hasTimetable ? " · 시간표 등록됨" : " · 시간표 없음"}${p.location ? ` · 위치: ${p.location}` : ""}`;
    const req2 = { systemInstruction: { parts: [{ text: system }] }, contents, tools: TOOLS, generationConfig: { temperature: 0.4, maxOutputTokens: 1200 } };
    let lastErr;
    const now = Date.now();
    const order = [G.okModel, ...MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    const ready = order.filter((m) => !(G.coolUntil[m] > now));
    for (const model of ready.length ? ready : order) {
      try {
        const content = await callModel(model, req2);
        G.okModel = model; delete G.coolUntil[model];
        return res.status(200).send(JSON.stringify({ content, model }));
      } catch (e) {
        lastErr = e;
        if (G.okModel === model) G.okModel = null;
        // 혼잡·시간초과 모델은 90초, 없는 모델은 1시간 쉬게 함
        G.coolUntil[model] = Date.now() + (/no longer available|not found|not supported|404/i.test(e.message) ? 3600e3 : /quota|exhausted|429/i.test(e.message) ? 600e3 : 90e3);
        if (!/no longer available|not found|not supported|404|high demand|overloaded|unavailable|503|429|abort|timeout|빈 응답|exhausted|quota|MAX_TOKENS/i.test(e.message)) break;
      }
    }
    res.status(502).send(JSON.stringify({ error: lastErr?.message || "AI 응답 실패" }));
  } catch (e) {
    res.status(502).send(JSON.stringify({ error: e.message }));
  }
}
