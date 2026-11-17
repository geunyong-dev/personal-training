# personal-training

MCP를 통해서 AI 에이전트를 연동하여, 헬스기록 및 식단을 관리해주는 앱

> 현재 범위: 운동 계획·기록 MVP (식단 관리는 이후 단계)

요일별로 1주 운동 계획을 세워 두고, 매일 그 계획으로 운동을 기록한다. 기록은 기기에 JSON으로 먼저 저장되고, 인터넷에 공개된 동기화 서버를 거쳐 Claude가 MCP로 읽고 계획을 써 준다. 휴대폰이 어느 네트워크(LTE·다른 와이파이)에 있든 동작한다.

```
[휴대폰 앱] ──로컬 JSON 저장(오프라인 OK)──▶ [기기 파일]
     │  HTTPS, 30초마다·변경 시 동기화
     │  Authorization: Bearer <기기 비밀키>
     ▼
[동기화 서버 server/]  (Fly.io / VPS / 집 PC + Cloudflare Tunnel)
     data/<기기ID>.json
     ▲
     │  HTTPS  https://<서버>/mcp/<개인 MCP 토큰>
[Claude (claude.ai · Desktop · 모바일 · Claude Code)]
```

## 화면 흐름

1. 앱 시작 → 로고 스플래시 → 홈
2. 인증 안 한 기기는 홈에서 `/auth`로 이동 → 닉네임 + 동의 → 기기 ID와 기기 비밀키 발급(목업). 한 번 인증하면 다시 묻지 않음
3. 홈 중앙 **오늘의 운동** 버튼
   - 오늘 계획 있음 → 그 계획으로 바로 시작
   - 오늘 계획 없음 → 계획 페이지에서 운동·세트·횟수·무게를 정하고 **계획 완료 · 오늘의 운동 시작**
   - 진행 중 운동 있음 → 이어서 하기
4. 시작하면 오늘의 운동 목록 위에 **첫 번째 운동 상세**가 바로 열리고 전체 타이머가 흐름
5. 운동 상세
   - 상단 헤더: 전체 운동 타이머 / 휴식 타이머: 바텀시트 (−15초 · +15초 · 일시정지 · 건너뛰기)
   - 하단 버튼: `[휴식 타이머 | 세트 완료]` → 마지막 세트에서 `[다음 운동]` → 마지막 운동의 마지막 세트에서 `[운동 완료]`
6. 운동 중에는 알림창에 상시 표시 (Android 고정 알림, iOS Live Activity)
7. 운동 완료 → 기기 JSON 저장 → 동기화 서버 → Claude가 MCP로 조회
8. 설정: 내 운동 기록, Claude 연결 상태·최근 호출, **Claude 연결 주소**(복사·재발급), 내 주간 계획, 서버 주소

## 인증과 보안

- **앱 ↔ 서버**: 인증하면 기기에 32바이트 랜덤 비밀키가 생긴다. 첫 동기화 때 서버가 기기 ID와 비밀키 해시를 등록하고, 이후 모든 요청은 `Authorization: Bearer <비밀키>`로 확인한다. 같은 기기 ID라도 비밀키가 다르면 401.
- **Claude ↔ 서버**: 서버가 기기마다 따로 발급하는 MCP 토큰으로 사용자를 구분한다. 앱 설정의 "Claude 연결 주소"(`https://<서버>/mcp/<토큰>`)를 Claude에 등록한다. 토큰이 다르면 다른 사람 데이터는 보이지 않는다. 주소가 새면 **재발급**으로 예전 주소를 끊는다.
- 서버 기본 보호: IP당 분당 120회 요청 제한, 요청 크기 5MB 제한, 기기 수 상한(`MAX_DEVICES`).
- 인증 자체는 목업이라 기기를 잃어버리면 기록을 되찾을 방법이 없다(계정 연동은 다음 단계).

## 서버 배포 (필수)

앱과 Claude 모두 인터넷에서 서버에 닿아야 한다. **HTTPS 주소**가 필요하다 (iOS는 http 차단, Claude 커스텀 커넥터는 공개 HTTPS 서버만 연결).

### A. Fly.io (권장)

```bash
fly launch --no-deploy --copy-config        # fly.toml의 app 이름 수정
fly volumes create pt_data --size 1 --region nrt
fly deploy
# → https://<app>.fly.dev
```

### B. 아무 서버(VPS)에서 Docker

```bash
docker build -t personal-training-server .
docker run -d --restart unless-stopped -p 8787:8787 -v pt-data:/data personal-training-server
# 앞단에 HTTPS 리버스 프록시(Caddy, nginx 등)를 둔다
```

### C. 집 PC + Cloudflare Tunnel (서버 없이)

```bash
npm run server                                          # PC에서 서버 실행
cloudflared tunnel --url http://localhost:8787          # https://xxxx.trycloudflare.com 발급
```

PC가 켜져 있어야 동기화된다. 고정 주소가 필요하면 Cloudflare 계정으로 이름 있는 터널을 만든다.

서버 환경변수: `PORT`(8787), `WORKOUT_DATA_DIR`(데이터 폴더), `MAX_DEVICES`(1000), `RATE_LIMIT_PER_MIN`(120)

## 앱 실행

```bash
npm install
EXPO_PUBLIC_SYNC_URL=https://<서버주소> npm run web     # 기본 서버 주소를 넣어 빌드
npx expo run:ios / run:android                         # 개발 빌드 (Live Activity·알림 때문에 Expo Go 불가)
```

`EXPO_PUBLIC_SYNC_URL`을 넣지 않았다면 앱 **설정 → 동기화 서버 주소**에 직접 입력한다.

## Claude 연결

앱 **설정 → Claude 연결 주소 → 주소 복사** 후:

- **claude.ai · Claude Desktop · 모바일 앱**: 설정 → 커넥터 → 커스텀 커넥터 추가 → 주소 붙여넣기 (OAuth 설정은 비워 둔다). claude.ai에서 한 번 추가하면 Desktop·모바일에서도 쓸 수 있다.
- **Claude Code**: `claude mcp add --transport http personal-training "<복사한 주소>"`
- (같은 PC에서만) **stdio**: `npx tsx server/stdio.ts` — 토큰 없이 마지막으로 동기화한 기기를 다룬다.

### MCP 도구

| 도구 | 하는 일 |
| --- | --- |
| `get_weekly_plan` | 운동 계획 조회 (월~일, 휴식일 포함) |
| `create_day_plan` | 운동 계획 작성 (요일, 운동·세트·횟수·무게). 이미 있으면 `overwrite: true` |
| `update_day_plan` | 운동 계획 수정 (항목 추가·변경·삭제, 이름·메모, 휴식일로 비우기) |
| `list_workout_records` | 운동 기록 조회 (기간·운동별 필터) |
| `search_exercises` | 계획 작성용 운동 id 검색 |

Claude가 쓴 계획에는 앱에서 "Claude" 표시가 붙고, 다음 동기화 때 반영된다(마지막 수정 우선).

## 검사

```bash
npm run typecheck     # 앱 + 서버
npm test              # 도메인·스토어 (jest)
npm run test:server   # 서버: 인증·사용자 격리·토큰 재발급·요청 제한·동기화 ↔ MCP
npm run build:server  # 서버 단일 파일 번들 (server/dist)
npx eslint src server
```

## 폴더 구조

```
src/
  app/                    화면 (expo-router)
    _layout.tsx           스플래시, 알림·동기화 시작
    auth.tsx              기기 인증 (목업)
    (tabs)/index.tsx      홈: 오늘의 운동 버튼, 이번 주 띠
    (tabs)/workout/       오늘의 운동 목록 → 운동 상세([exerciseId])
    (tabs)/plan.tsx       주간 계획 (월~일)
    plan/[day].tsx        요일 계획 편집 (세트·횟수·무게)
    (tabs)/history.tsx    기록 캘린더·주간 볼륨
    (tabs)/settings.tsx   기록·MCP 연결·계획 요약, 서버 주소
  domain/                 순수 규칙: plan, calc(볼륨·PR), rules(입력 범위·휴식)
  store/                  zustand + 로컬 JSON 파일 저장
  features/session/       운동 진행 동작, 바텀시트 틀, 전체 타이머
  features/timer/         휴식 타이머, 예약 알림
  features/workout-notice/ 진행 중 알림 (Android 고정 알림 / iOS Live Activity)
  widgets/                iOS Live Activity 레이아웃
  lib/companion.ts        동기화 서버 클라이언트 (Bearer 인증)
server/
  http.ts                 동기화 API + MCP(HTTP) + 인증·요청 제한
  stdio.ts                MCP(stdio, 같은 PC 전용)
  mcp.ts                  MCP 도구 (토큰별 사용자 범위)
  store.ts                기기별 JSON 저장, 비밀키 해시, MCP 토큰 색인
Dockerfile, fly.toml      서버 배포
```

## 알아둘 점

- Android 고정 알림은 앱이 꺼져 있으면 숫자가 실시간으로 바뀌지 않는다(시작 시각·휴식 종료 시각 표시, 종료 알림은 예약돼 울림). 실시간 카운트다운은 네이티브 포그라운드 서비스가 필요해 다음 단계로 둔다. iOS Live Activity는 시스템이 시계를 그려서 계속 흐른다.
- 서버 저장소는 JSON 파일이다. 사용자가 많아지면 DB(Postgres 등)로 옮긴다. 이전 Supabase 구현은 git 기록(`feat: Supabase schema…`)에 남아 있다.
