# AI 팀장 오피스

Claude 구독으로 동작하는 데스크톱 AI 오피스. 5명의 AI 팀장(마케팅·전략·운영·검토·총괄)에게 일을 맡기고, 대화에서 나온 사실·결정은 지식금고(vault)에 자동으로 정리됩니다.

## 구조
- `web/` — React 프론트엔드(Vite). UI는 전부 상대경로 `/api/*`로 백엔드와 통신.
- `server/` — 오피스 API. `office-api.js`(라우트 등록, dev/prod 공유) + `index.js`(프로덕션 독립 서버).
- `electron/` — 데스크톱 셸. 첫 실행 온보딩(claude 설치/로그인) 후 본 앱을 띄움. `seed/`는 빌드 산출물.
- `scripts/build-seed.mjs` — 고객 배포용 깨끗한 초기 상태(빈 vault 템플릿 + .claude + CLAUDE.md) 생성.
- `vault/` — 지식금고(개발자 본인 데이터). **고객 배포본에는 빈 템플릿만 들어갑니다.**

## 동작 원리
AI 응답은 로컬에 설치된 **Claude Code CLI**(`claude -p`)를 호출해 생성됩니다. 따라서 실행하는 PC에 Claude Code가 설치되고 사용자 본인의 Claude 구독으로 로그인되어 있어야 합니다. Electron 앱이 첫 실행 때 이 설치·로그인을 안내합니다.

## 개발
```powershell
npm install
npm install --prefix web
npm run electron     # web 빌드 + seed 생성 + Electron 실행
```

## 배포용 exe
```powershell
npm run dist         # release/ 에 NSIS 설치 exe 생성
```

자세한 설치·실행·배포 절차는 [`docs/설치-실행-가이드.md`](docs/설치-실행-가이드.md) 참고.
