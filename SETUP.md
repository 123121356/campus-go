# 캠퍼스GO 환경 세팅 (Windows)

## 1. 프로그램 설치 — `setup.bat` 더블클릭
- **Node.js (LTS)**: 로컬 서버 실행용. 추가로 설치할 npm 패키지는 없습니다.
- **Git**: GitHub에 코드 올리기용.
- `.env` 파일을 자동으로 만듭니다.

> winget 이 없다는 오류가 나면 직접 설치: https://nodejs.org (LTS) , https://git-scm.com/download/win  
> 설치 뒤에는 창을 닫고 `setup.bat` 을 다시 실행해 "설치됨"이 뜨는지 확인하세요.

## 2. API 키 발급 → `.env` 에 붙여넣기
`.env` 를 메모장으로 열어 `=` 뒤에 붙여 넣습니다. (키는 비밀번호와 같습니다. 카톡·GitHub에 올리지 마세요)

| 변수 | 어디서 | 비고 |
|---|---|---|
| `DATA_GO_KR_KEY` | data.go.kr 로그인 → `국토교통부_(TAGO)_버스도착정보`, `국토교통부_(TAGO)_버스정류소정보` 각각 **활용신청** → 마이페이지 › 개발계정 › **일반 인증키(Decoding)** | 승인·반영에 시간이 걸릴 수 있으니 **제일 먼저** |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | 개인정보 입력 금지 |
| `GROQ_API_KEY` | console.groq.com → API Keys | Gemini 대신 써도 됨 (둘 중 하나면 충분) |

키가 하나도 없어도 앱은 돌아갑니다 (예비 시간표 + 기본 답변).

## 3. 실행 — `start.bat` 더블클릭
브라우저에서 http://localhost:3000 이 열립니다. 확인할 것:
- 지도와 건물 마커가 보이는지, **조감도** 버튼으로 그림이 보이는지
- 버스 탭이 "실시간"으로 바뀌는지 (DATA_GO_KR_KEY 넣은 뒤)
- **3D** 버튼 → 🚶 걸어서 보기 → **🤖 AI 요정(T키)** 에게 질문했을 때 답이 오는지 (GEMINI_API_KEY 넣은 뒤)
- **3D** 에서 돌아다니는 학생 NPC 30명이 서로 대화·혼잣말을 하는지, 가까이 가서 **E키**로 소식을 들을 수 있는지
- 키를 바꾼 뒤에는 start.bat 창을 닫고 다시 실행

## 4. GitHub 에 올리기 (제출: 소스코드 링크)
1. github.com 에서 새 저장소 만들기 (예: `campus-go`, README 추가 체크 해제)
2. 이 폴더에서 주소창에 `cmd` 입력 → 엔터, 아래 실행 (처음 한 번만 이름/이메일 설정)
```
git config --global user.name "이름"
git config --global user.email "깃허브 이메일"
git init
git add .
git commit -m "캠퍼스GO 첫 커밋"
git branch -M main
git remote add origin https://github.com/<아이디>/campus-go.git
git push -u origin main
```
`.env` 는 `.gitignore` 에 있어서 올라가지 않습니다. `git status` 에 `.env` 가 보이면 멈추고 확인하세요.

## 5. Vercel 배포 (제출: 배포 URL)
1. vercel.com → GitHub 로 로그인 → **Add New › Project** → `campus-go` Import
2. Framework Preset: **Other**, Build 설정은 비워 둠
3. **Environment Variables** 에 `.env` 의 값을 하나씩 입력 → **Deploy**
4. 나온 주소(`https://campus-go-xxx.vercel.app`)가 배포 URL. 코드 고친 뒤 `git push` 하면 자동 재배포

## 6. 메신저 알림 (텔레그램·디스코드) — 선택
3D 캠퍼스의 AI 요정에게 "매일 아침 7시에 날씨랑 오늘 수업 텔레그램으로 보내줘", "장학 공지 새로 올라오면 디스코드로 알려줘"처럼 부탁하면 보내 줍니다.
요정이 **한 번만 보낼지, 주기적으로 받을지** 먼저 물어봅니다.

1. **Upstash Redis** 가 있어야 합니다 (`.env` 의 `KV_REST_API_URL`, `KV_REST_API_TOKEN`).
2. **텔레그램 봇 만들기**: 텔레그램에서 `@BotFather` → `/newbot` → 이름·아이디(`…_bot`) 정하기 → 받은 토큰을 `.env` 의 `TELEGRAM_BOT_TOKEN`, 봇 아이디를 `TELEGRAM_BOT_NAME` 에 넣기.
   사용자는 요정이 주는 링크를 열어 **시작(Start)** 만 누르면 연결됩니다. (웹훅 설정 필요 없음)
3. **디스코드**: 키가 필요 없습니다. 사용자가 자기 채널의 웹후크 주소(채널 설정 › 연동 › 웹후크 › 새 웹후크 › URL 복사)를 요정에게 붙여 넣으면 됩니다.
4. `NOTIFY_SECRET` 에 아무 긴 문자열을 넣습니다. Vercel 환경변수에도 같은 값으로 넣으세요.
5. **주기 실행 (15분마다)**: GitHub 저장소 → Settings → Secrets and variables → Actions 에
   `APP_URL`(배포 주소), `NOTIFY_SECRET`(위와 같은 값)을 넣으면 `.github/workflows/notify.yml` 이 15분마다 돕니다. (이 파일은 `github-upload.bat` 을 실행할 때 `tools/notify.yml` 에서 자동으로 복사됩니다) Actions 탭에서 수동 실행도 됩니다.
   - 비공개 저장소는 무료 시간(월 2,000분)을 넘을 수 있으니 `notify.yml` 의 cron 을 30분마다로 바꾸세요.
   - **배포 전에 내 PC로 시연**: `.env` 에 `NOTIFY_LOCAL_RUN=1` → `start.bat` 이 1분마다 알림을 확인합니다. (배포본과 동시에 켜지 마세요)
6. 확인: 요정에게 "텔레그램 연결해줘" → 링크 열고 시작 → "연결했어" → "지금 날씨 텔레그램으로 보내줘".

## 7. 요즘 화제 학습 (3D NPC가 커뮤니티·검색 트렌드를 말함) — 선택
3D 캠퍼스를 돌아다니는 학생 NPC 30명이 서로 만나면 "📰 요즘 하반기 공채 자소서 얘기 많더라"처럼 화제를 주고받고, 혼자 있을 땐 혼잣말을 합니다.
가까이 가서 **E키**(모바일은 '듣기')를 누르면 그 학생이 들은 소식을 알려 주고, AI 요정에게 "요즘 뭐가 유행이야?"라고 물어도 답합니다. 머리 위 표시가 하늘색인 학생(전체의 최대 20%)은 AI 뉴스·논문을 놓고 여러 줄 토론을 합니다. 학습 전에는 기본 상식 대사로 말하고, 학습 뒤에는 실제 밈·유행·경제·뉴스·자격증 소식으로 바뀝니다.

| 출처 | 방식 | 키 |
|---|---|---|
| 디시인사이드 | 갤러리 목록의 **제목·조회·추천 수만** 읽음 (본문·글쓴이 X). robots.txt 확인, 요청 사이 2~3.5초, 403/429 오면 즉시 중단 | 필요 없음 |
| 구글 트렌드 | 일별 인기 검색어 RSS | 필요 없음 |
| 유튜브 | YouTube Data API 인기 급상승 | `YOUTUBE_API_KEY` |
| 네이버 데이터랩 | 설정한 키워드(취업·자소서·계절학기…)의 지난주 대비 검색량 | `NAVER_CLIENT_ID/SECRET` |

- **지금 한 번:** `learn-trends.bat` (결과 `data/trends.json`, 기록 `logs/trends.log`)
- **내 PC에서 6시간마다:** `learn-trends.bat schedule`
- **PC가 꺼져 있어도:** GitHub Actions secret 에 `GEMINI_API_KEY`(+ 선택 키)를 넣으면 `learn-trends.yml` 이 6시간마다 돌고 커밋 → Vercel 자동 재배포. (`github-upload.bat` 실행 때 자동 복사)
- 읽을 갤러리·키워드는 `tools/trends-config.json` 에서 바꿉니다 (갤러리 주소의 `?id=` 값).
- 안전장치: 욕설·혐오·성적·폭력·정치 단어가 든 제목은 AI에 보내기 전에 버리고, AI가 만든 대사도 한 번 더 거릅니다. 원문 제목은 파일에 저장하지 않습니다.
- `GEMINI_API_KEY` 가 없으면 구글 검색어·네이버 증감·취업 단어 빈도로만 간단한 대사를 만듭니다.
- X(트위터)·인스타그램은 수집하지 않습니다 (공식 유료 API만 허용, 차단 우회 수집은 약관 위반).
