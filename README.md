# 캠퍼스GO AI · 강원대 삼척캠퍼스 AI 비서

> KNU AI 해커톤 「Zero to One」 출품작 — 주제: AI로 해결하는 캠퍼스 생활 문제

## 1. 문제: 아무도 기록하지 않는 '숨은 비용'

- 강의실을 찾느라 헤매고(**시간**), 다음 수업까지 몇 분 남았는지·어디로 가야 하는지 매번 따로 확인합니다.
- 장학금·학사일정·계절학기·학점교류 공지는 학교 홈페이지 4개 게시판에 흩어져 있어 **놓치거나 마감이 지나서** 압니다(**돈 + 불안**).
- 학식·혼잡도·버스·분실물 정보는 단톡방에 묻고 또 묻습니다(**수고**).

## 2. 해결: 한 번 물으면 AI 에이전트가 직접 찾아서 처리

AI는 **3D 캠퍼스 걷기 모드의 🤖 AI 요정(T키)** 하나로 모았습니다. 지도·검색의 "AI에게 물어보기"를 누르면 3D로 넘어가 요정이 바로 답합니다. AI(Gemini)가 질문을 이해하고 **도구 17개를 스스로 골라 실행**한 뒤(화면에 "🗓 시간표 확인 → 🧭 경로 계산" 같은 단계가 보임) 실제 데이터로 답하고, 지도에 핀·경로를 그립니다.

| # | 기능 | 에이전트 도구 | 데이터 |
|---|---|---|---|
| 1 | **AI 캠퍼스 내비게이션** — "10분 뒤 301호 수업이야" → 시간표에서 건물 확인 → 경로·도보 시간·도착 예상·**몇 층** 안내 | `get_schedule` `navigate` `find_place` | 공식 캠퍼스맵 27동, OSM 보행로 그래프(다익스트라), 층별 사진 213장 |
| 2 | **개인 시간표** — 말로 등록("월 9시 자료구조 5공학관 301호"), **시간표 사진을 올리면 AI가 읽어서 자동 등록**, 다음 수업·남은 시간·출발 시각, 공강 추천 | `add_classes` `remove_class` `get_schedule` | 사용자 입력(이 기기에만 저장) |
| 3 | **학식·교내 시설** — 식당·카페·편의점·프린터·ATM·열람실 위치, 혼잡도 | `get_meals` `find_place` `campus_status` | 건물 내부 시설 데이터, 제보 |
| 4 | **AI 학교 행정 비서** — 장학금 자격 정리, 수강신청·계절학기·학점교류·전과·부복수전공 일정, 공지 요약, 마감 D-day | `search_school_info` | **강원대 홈페이지 공지(일반·학사·장학·행사) 실시간 수집** + 2026 학사일정 58건 |
| 5 | **캠퍼스 커뮤니티** — 분실물·중고거래·팀원모집·동아리·행사·주변정보·학식메뉴, AI에게 "분실물 올려줘" | `community` | 사용자 글 + 학교 행사 공지 |
| 6 | **실시간 현황** — 식당·도서관·버스 혼잡도, 통학버스 추정 위치 | `campus_status` `report_status` `get_bus` | **[제보]·[시간대 추정]·[시간표 추정]을 구분해 표시** (센서 데이터가 없음을 숨기지 않음) |
| 7 | **메신저로 받기 (텔레그램·디스코드)** — "매일 7시에 날씨·오늘 수업 보내줘", "수업 15분 전에 알려줘", "장학 공지 새로 뜨면 알려줘", "3시에 과제 제출 알려줘". 요정이 **한 번만 / 주기적으로**를 먼저 묻고, 주기 알림은 서버가 보낼 때마다 최신 데이터로 새로 만듦 | `messenger_link` `send_message` `subscribe` `my_subscriptions` | Telegram Bot API, Discord 웹후크, Upstash Redis, GitHub Actions(15분마다) |
| 8 | **3D 캠퍼스를 돌아다니는 학생 NPC 30명** — 자유롭게 걷다가 서로 만나면 '요즘 화제'(밈·유행·경제·뉴스·자격증 등)를 주고받고 혼잣말도 함. 가까이 가 **E키**를 누르면 그 학생이 들은 소식을 알려 줌(엿듣기). 그중 최대 20%(머리 위 표시가 하늘색)는 AI 뉴스·논문을 주제로 **여러 줄 토론**을 주고받음. 내용은 6시간마다 유튜브·구글 트렌드·커뮤니티·네이버에서 학습 | `get_trends` | `tools/learn-trends.mjs` → `data/trends.json` (원문 미저장, 유해 표현 2중 필터) + 학습 전엔 기본 상식 대사 |

**중복 정리:** 시설 혼잡도(3)·식당 혼잡도/건물 이용 현황(6)은 `campus_status` 하나로, 교내 행사(5·6)는 학교 행사 공지 + 커뮤니티로, 다음 수업(1·2·7)은 `get_schedule` 하나로, 셔틀 위치(6)·버스 도착(7)은 `get_bus` 하나로 합쳤습니다.

**끊기지 않는 AI:** Gemini 3.8 Flash 우선(gemini-3.8-flash → 3.5-flash → 3.1-flash-lite → …), 혼잡·무료 한도 초과 모델은 자동으로 건너뜀. AI 서버가 아예 안 되면 **같은 도구를 쓰는 규칙 기반 비서**로 전환되어 시연이 멈추지 않습니다.

지도(건물·층별 사진), 조감도, 3D 캠퍼스(걷기·비행), 버스 시간표는 AI가 결과를 보여 주는 화면으로 함께 제공됩니다. 길찾기 버튼은 없애고 길 안내는 AI가 맡습니다.

## 3. 필수 제약 충족

1. **인터넷 기반 서비스** — 모바일 웹앱(PWA), Vercel 배포
2. **외부 데이터 활용** — 강원대 홈페이지 공지·학사일정(실시간 수집), 강원대 공식 캠퍼스맵, Google Gemini API(에이전트·이미지 인식), Open-Meteo 날씨·미세먼지, OpenStreetMap 건물·도로, 후문 정류장·통학버스 시간표
3. **에이전트(가점)** — 모델이 도구 호출 → 브라우저가 앱 데이터로 실행 → 결과를 다시 모델에 → 최대 7단계 반복 (`ai.js`, `api/agent.js`)

> 학교 공지는 `/api/school`이 30분마다 새로 모으고, 실패하면 `data/school.json` 저장본을 씁니다(로컬에서 `/api/school?save=1` 로 저장본 갱신). 시간표·커뮤니티·제보는 현재 **이 기기(localStorage)에만 저장**됩니다 — 여러 사용자 공유는 DB 연동이 다음 단계입니다.

## 4. 구조

```
index.html  styles.css  app.js     ← 프런트(의존성 없음, Leaflet CDN)
ai.js                              ← AI 에이전트 도구 17개 (3D AI 요정 npc.js 가 사용)
api/agent.js  POST /api/agent      ← Gemini 함수 호출 프록시(키는 서버에만), GET ?probe=1 모델 상태 확인
api/school.js GET  /api/school     ← 강원대 공지 실시간 수집(삼척·전체 캠퍼스)
data/school.json  data/calendar.json ← 공지 저장본, 2026 학사일정
data/buildings.json                ← 건물 데이터 (위치 편집 모드로 보정)
data/bus.json                      ← 정류장·노선·예비 시간표
api/bus.js    GET /api/bus?nodeId= | ?name=강원대   (TAGO 도착정보)
api/stops.js  GET /api/stops?name=강원대 | ?cities=1 (정류소 nodeId 찾기)
api/chat.js   POST /api/chat                        (Gemini → Groq)
api/notify.js POST /api/notify                      ← 메신저 연결·보내기·구독, ?run=1 주기 실행 (.github/workflows/notify.yml)
dev-server.js 로컬 실행용 (node dev-server.js)
```
API 키는 서버 환경변수에만 있고 브라우저로 내려가지 않습니다.

## 5. 실행 · 배포

> 처음이라면 **[SETUP.md](SETUP.md)** 를 따라 하세요 (`setup.bat` → `.env` 키 입력 → `start.bat`).

```bash
cp .env.example .env      # 키 입력
node dev-server.js        # http://localhost:3000  (Node 18+, 설치할 패키지 없음)
```

**Vercel 배포**: GitHub에 push → vercel.com에서 Import → Settings › Environment Variables에 `.env` 값 입력 → Deploy.  
키가 하나도 없어도 앱은 동작합니다(예비 시간표 + 규칙 기반 답변).

### 키 발급 (각 5분)
- **공공데이터포털** data.go.kr → `국토교통부_(TAGO)_버스도착정보`, `국토교통부_(TAGO)_버스정류소정보` 활용신청 → 마이페이지의 **일반 인증키(Decoding)**. 승인 후 반영까지 시간이 걸릴 수 있으니 **가장 먼저** 신청하세요.
- **Gemini**: aistudio.google.com → Get API key. (무료 등급은 입력이 품질 개선에 쓰일 수 있으니 개인정보 입력 금지)
- **Groq**: console.groq.com → API Keys.

## 6. 현장에서 꼭 할 일 (체크리스트)

- [ ] 키 넣고 `/api/stops?name=강원대` 호출 → 교내 정류장 `nodeId`를 `data/bus.json`에 기록 (삼척 도시코드가 다르면 `/api/stops?cities=1`로 확인)
- [x] 건물 이름·번호·좌표: 학교 공식 캠퍼스맵 데이터로 반영 완료 (27개)
- [ ] 건물별 용도·입주 학과·식당/매점 운영시간을 `desc`·`facilities`에 채우기 (두타관·해솔관·언장관 용도 확인)
- [ ] 교내 버스정류장 실제 위치 확인 → `bus.json`의 `lat/lng` 수정
- [ ] 정류장 게시판/삼척시청 시간표로 `bus.json`의 예비 시간표 고치고 `verified: true`
- [ ] 후문 정류장 실제 위치 확인 → `bus.json`의 `stop.lat/lng` 수정
- [ ] 팀 밖 사용자 3명 이상 시간 측정 (가점: 실사용 기록)

### 내부 사진 넣는 법
```
photos/120/1F/01_로비.jpg        ← 건물번호/층/순서_설명.jpg
photos/120/1F/info.txt          ← (선택) 첫 줄 = 층 설명
node tools/build-floors.js      ← data/floors.json 자동 생성
```
사진은 가로 1600px 이하로 줄여 넣으세요. 사람 얼굴·학생증·게시된 개인정보가 찍힌 사진은 빼거나 가리세요.

## 7. '줄었다'는 증명 방법
앱 안의 사용 기록 기능은 뺐습니다. 대신 팀 밖 사용자 3명 이상에게 같은 과제(처음 가는 건물 찾기, 다음 버스 확인)를 기존 방법과 캠퍼스GO로 각각 해 보게 하고, 스마트폰 스톱워치로 잰 시간을 표로 정리해 발표하세요.

## 8. AI 활용 과정 공개

- 기획·코드 작성: Claude(Anthropic)와 페어 프로그래밍 — 요구사항(해커톤 조건 사진) → 기능 설계 → 코드 → 브라우저 자동 테스트
- 서비스 내 AI: Gemini 3.8 Flash(또는 Groq Llama 3.3). 시스템 프롬프트로 “데이터에 없는 사실은 지어내지 말 것”, “좌표·개인정보 비노출”을 강제하고, 응답 속 `[[MAP:id]]` 태그를 앱이 버튼으로 바꿉니다.

## 출처
- 3D 건물 윤곽·도로: © OpenStreetMap contributors (ODbL), 2026-11-05 추출. 높이 = 층수 × 3.6m (층수는 나무위키·OSM, 두타관·해솔관은 5층 추정)
- 버스 시간표: 정류장 '시내버스 노선 운행시간표(삼척↔동해)' 사진 (2026-11 촬영)
- 나무위키 '강원대학교/삼척캠퍼스' (2026-11-05 열람, CC BY-NC-SA 2.0 KR) — 학과·층수·시설, 셔틀 시간표
- 날씨·대기질: Open-Meteo https://open-meteo.com (CC BY 4.0)
- 캠퍼스 조감도 일러스트 ©2017 3DG9.com — 공개 배포 전 학교 홍보팀 등에 사용 허락 확인 필요
- 강원대학교 캠퍼스맵 (삼척캠퍼스) https://kangwon.ac.kr/campusmap/index.do (2026-11-05 수집)
- 강원대 삼척캠퍼스, 시내버스 교내 통과 노선 개통 — 대학저널 (2023.3.14) https://dhnews.co.kr/news/view/1065575771018266
- 삼척시, 시내버스 개편노선 본격 운행 — 뉴스서울 https://newsseoul.co.kr/news/view/1065573023025626
- 지도 데이터 © OpenStreetMap contributors · 버스 정보: 국토교통부 TAGO(공공데이터포털)

## 매일 학습 (AI가 학교 홈페이지 공지를 매일 읽고 정리)

```
강원대 홈페이지 ──(매일 06~07시)──▶ tools/learn-school.mjs
   일반·학사·장학·행사 게시판        1) 수집: 삼척/전체 캠퍼스 글만
                                   2) 읽기: 새 글 본문·문의전화·첨부파일
                                   3) 정리: Gemini가 요약·마감일·대상·신청방법·키워드 추출
                                   4) 누적: data/knowledge.json (어제까지 배운 것 + 오늘)
                                   5) 기록: data/learn-log.json, data/school.json 갱신
                                          │
                     GitHub 커밋 → Vercel 자동 재배포 → AI 도우미(search_school_info)가 바로 사용
```

- **지금 한 번 실행:** `learn-now.bat` 더블클릭 (처음엔 `learn-now.bat --pages=10` 으로 과거 글까지)
- **내 PC에서 매일 자동:** `learn-schedule.bat` 실행 → 작업 스케줄러에 매일 07:00 등록
- **PC가 꺼져 있어도 매일 자동:** GitHub 저장소 Settings → Secrets → Actions 에 `GEMINI_API_KEY` 등록하면
  `.github/workflows/daily-learn.yml`(원본은 `tools/daily-learn.yml`, `learn-now.bat` 첫 실행 때 자동 복사) 이 매일 06:00(KST)에 돌고 결과를 커밋합니다. Actions 탭에서 수동 실행도 가능.
- `GEMINI_API_KEY` 가 없으면 규칙 기반(정규식)으로 마감일·요약을 뽑습니다.
- 학교 사이트를 하나도 못 읽은 날은 기존 지식베이스를 덮어쓰지 않고 실패로 끝납니다.

## 요즘 화제 학습 (6시간마다, 3D NPC 대사)

```
디시 갤러리 제목·구글 트렌드 RSS·유튜브 인기·네이버 데이터랩 ──(6시간마다)──▶ tools/learn-trends.mjs
   robots.txt 확인 · 2~3.5초 간격 · 403/429면 중단          1) 수집  2) 유해 표현 거르기
                                                          3) Gemini: 주제 요약 + NPC 대사(분위기로만 말하기)
                                                          4) 누적: data/trends.json (며칠째 화제인지, 식는 화제)
                                     │
                 3D 건물 NPC 말풍선(📰) · AI 요정 get_trends · 메신저 구독(trends)
```
