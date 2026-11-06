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
- 학식·식단·메뉴 질문은 get_meals를 부르고, 학식은 "제5공학관 학생식당"이라고 알려 준 뒤 이번 주 식단 링크(https://www.kangwon.ac.kr/ko/extn/337/wkmenu-mngr/list.do?campusCd=2)를 그대로 붙여 준다. 링크 속 메뉴 내용은 모르므로 메뉴를 지어내지 않는다(제보된 메뉴가 있으면 [제보]로 구분).
- 운영시간 데이터가 없으면 "운영 여부는 확인이 필요해요"라고 말한다.
- 좌표 숫자, 내부 id(n101 등)는 사용자에게 보여 주지 않는다.
- 현재 위치("여기 어디", "내 위치", "가까운 건물")를 물으면 [사용자]의 위치 설명(지금 어느 건물 근처인지)만 근거로 답한다. 학식이 제5공학관이라고 해서 현재 위치를 제5공학관으로 단정하지 말 것.
[요즘 화제]
- "요즘 뭐가 유행이야?", "취업 커뮤니티 분위기 어때?", "인기 검색어" 같은 질문은 get_trends로 답한다. 커뮤니티 요약은 사실이 아니라 분위기라고 밝히고, 출처 종류(커뮤니티·구글 트렌드 등)를 짧게 말한다. 정치·혐오·자극적 이야기는 하지 않는다.
- 취업 화제가 나오면 관련 학교 공지(search_school_info)나 학사일정과 연결해 도움이 되는 방향으로 답한다.
- topics에 trends(요즘 화제)를 넣어 메신저 구독으로도 받을 수 있다.
[메신저로 보내기 — 텔레그램·디스코드]
- 사용자가 정보를 텔레그램/디스코드(메신저, 폰, 알림)로 보내 달라고 하면, 먼저 "지금 한 번만 보낼까요, 주기적으로 받을까요?"라고 묻는다. 이미 말했으면 묻지 않는다.
  · 주기적이면 언제인지 확인한다: 매일/평일 몇 시(daily), 수업 N분 전(before_class), N시간마다(interval), 새 공지·새 글이 생길 때(on_new), 특정 시각 한 번(once). 메신저를 말하지 않았으면 어느 쪽인지 묻는다.
- 메신저 연결은 messenger_link로 확인한다. 텔레그램이 연결 안 됐으면 결과의 url을 그대로 주고 "링크 열고 시작 누른 뒤 '연결했어'라고 말해 주세요"라고 안내한다. "연결했어"라고 하면 messenger_link를 다시 불러 확인한다.
  디스코드는 채널 설정 › 연동 › 웹후크 › 새 웹후크 › URL 복사 후 붙여 넣어 달라고 하고, 주소를 받으면 messenger_link(channel=discord, webhook=주소)로 연결한다.
- 한 번 보내기: 필요한 도구로 실제 데이터를 먼저 확인한 뒤, 그 결과만으로 짧게 정리해서 send_message의 text로 보낸다(지어내지 않는다, 마크다운 대신 줄바꿈과 "· " 사용).
- 주기 보내기: subscribe를 쓴다. 내용은 서버가 보낼 때마다 최신 데이터로 새로 만든다. topics: weather(날씨), class(수업·시간표), bus(후문 버스), notices(새 공지), deadlines(마감 임박 공지), calendar(학사일정), community(커뮤니티 새 글), trends(요즘 화제), reminder(메모; text 필요). 특정 단어만 원하면 filter(예: "장학", "분실물").
  등록되면 무엇을·언제·어디로 보내는지 한 줄로 확인하고, 그만 받으려면 "알림 그만"이라고 하면 된다고 알려 준다.
- "내 알림/구독 뭐 있어?" → my_subscriptions(action=list), "그만/해지" → 목록에서 골라 my_subscriptions(action=cancel, id) (모두면 all=yes).
- 한 번 보내기를 "~시에" 원하면 subscribe(schedule_type=once, at=YYYY-MM-DDTHH:MM 한국 시간)로 등록한다. 지금 시각은 아래 [지금]을 기준으로 계산한다.
- 웹후크 주소·연결 코드는 답에 다시 적지 않는다.`

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
  T("get_trends", "요즘 화제: 취업 커뮤니티 분위기, 인기 검색어, 유튜브 인기 급상승, 검색량 변화를 AI가 주제로 요약한 것.", { category: S("job, trend, youtube, search, meme, campus, all 중 하나(선택)"), query: S("찾을 단어(선택)") }),
  T("messenger_link", "텔레그램/디스코드 연결 상태 확인 및 연결. 텔레그램은 연결 링크(url)를 돌려주고, 디스코드는 webhook 주소를 받아 연결한다.", { channel: S("telegram 또는 discord"), webhook: S("디스코드 웹후크 주소(디스코드 연결 때만)") }, ["channel"]),
  T("send_message", "지금 한 번 메신저로 보낸다. 다른 도구로 확인한 실제 정보를 정리한 글을 text로 넣는다.", { channel: S("telegram 또는 discord (비우면 연결된 것)"), text: S("보낼 내용(한국어, 1500자 이하)") }, ["text"]),
  T("subscribe", "주기적으로(또는 정한 시각에 한 번) 메신저로 최신 정보를 보내도록 등록한다. 서버가 15분마다 확인해서 보낸다.", {
    channel: S("telegram 또는 discord (비우면 연결된 것)"),
    topics: { type: "ARRAY", items: { type: "STRING" }, description: "weather, class, bus, notices, deadlines, calendar, community, trends, reminder 중 여러 개" },
    schedule_type: S("daily, before_class, interval, on_new, once 중 하나"),
    time: S("daily: 보낼 시각 HH:MM"), days: S("daily: 요일들(예: 월화수목금, 평일, 주말, 비우면 매일)"),
    minutes: S("before_class: 수업 몇 분 전(5~120)"), hours: S("interval: 몇 시간마다(1~24)"), at: S("once: YYYY-MM-DDTHH:MM (한국 시간)"),
    text: S("reminder 메모 내용"), filter: S("notices·community에서 이 단어가 들어간 것만(선택)"), title: S("구독 이름(예: 아침 브리핑)"),
    preview: S("yes면 등록하면서 미리보기를 한 번 보냄"),
  }, ["topics", "schedule_type"]),
  T("my_subscriptions", "내 메신저 알림(구독) 목록 보기 또는 해지.", { action: S("list 또는 cancel"), id: S("해지할 구독 id"), all: S("yes면 모두 해지") }, ["action"]),
  T("get_meals", "학식(제5공학관 학생식당) 안내와 이번 주 공식 식단 링크, 교내 식당·푸드코트·카페 위치, 지금 운영/혼잡 추정, 사용자가 제보한 오늘 메뉴·가격을 돌려준다."),
] }];

// Gemini 3.8 Flash 우선 (.env 의 GEMINI_MODEL 은 그다음). 혼잡·무료 한도 초과면 다음 모델로 자동 전환 (시연 중에도 끊기지 않게)
// .env 의 GEMINI_MODEL 을 가장 먼저 시도(연결 보장) → 그다음 범용 최신 별칭들로 자동 전환
const MODELS = [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.0-flash"].filter(Boolean))];
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
