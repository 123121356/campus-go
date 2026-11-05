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
- AI 도우미 아래에 "AI 응답: Google Gemini"가 뜨는지 (GEMINI_API_KEY 넣은 뒤)
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
