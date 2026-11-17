# personal-training

MCP를 통해서 AI 에이전트를 연동하여, 헬스기록 및 식단을 관리해주는 앱

> 현재 범위: 운동 계획·기록 MVP (식단 관리는 이후 단계)

요일별로 1주 운동 계획을 세워 두고, 매일 그 계획으로 운동을 기록한다. 기록은 기기에 JSON으로 저장되고, PC의 동기화 서버를 거쳐 Claude가 MCP로 읽고 계획을 써 준다.

```
[휴대폰 앱] ──로컬 JSON 저장──▶ [기기 파일]
     │  같은 와이파이, 30초마다·변경 시 동기화
     ▼
[PC 동기화 서버 server/] ──data/<기기ID>.json
     ▲
     │  MCP (HTTP /mcp 또는 stdio)
[Claude Desktop / Claude Code]
```

## 화면 흐름

1. 앱 시작 → 로고 스플래시 → 홈
2. 인증 안 한 기기는 홈에서 `/auth`로 이동 → 닉네임 + 동의 → 기기 ID 발급(목업). 한 번 인증하면 다시 묻지 않음
3. 홈 중앙 **오늘의 운동** 버튼
   - 오늘 계획 있음 → 그 계획으로 바로 시작
   - 오늘 계획 없음 → 계획 페이지(`/plan/<요일>?start=1`)에서 운동·세트·횟수·무게를 정하고 **계획 완료 · 오늘의 운동 시작**
   - 진행 중 운동 있음 → 이어서 하기
4. 시작하면 오늘의 운동 목록 위에 **첫 번째 운동 상세**가 바로 열리고 전체 타이머가 흐름
5. 운동 상세
   - 상단 헤더: 전체 운동 타이머
   - 휴식 타이머: 세트를 완료하면 바텀시트로 올라오고 끝나면 내려감 (−15초 · +15초 · 일시정지 · 건너뛰기)
   - 하단 버튼: `[휴식 타이머 | 세트 완료]` → 마지막 세트에서 `[휴식 타이머 | 다음 운동]` → 마지막 운동의 마지막 세트에서 `[휴식 타이머 | 운동 완료]`
   - 다음 운동·운동 완료는 마지막 세트를 완료 처리한 뒤 이동·저장
6. 운동 중에는 알림창에 상시 표시 (Android 고정 알림, iOS Live Activity). 앱을 꺼도 시작 시각 기준으로 계속 흐름
7. 운동 완료 → 기록 저장(기기 JSON) → 동기화 서버 → Claude가 MCP로 조회
8. 설정: 내 운동 기록, Claude(MCP) 연결 상태와 최근 호출, 내 주간 계획, 동기화 서버 주소

## 실행

```bash
npm install

# 1) PC 동기화 서버 (+ MCP)
npm run server
#   앱 설정에 입력할 주소:  http://192.168.x.x:8787
#   Claude MCP 주소:        http://localhost:8787/mcp

# 2) 앱
npm run web                  # 웹 미리보기
npx expo run:ios             # 개발 빌드 (Live Activity·알림 때문에 Expo Go 불가)
npx expo run:android
```

앱 **설정 → PC 동기화 서버 주소**에 서버가 알려 준 주소를 넣고 "연결·동기화"를 누른다.

### Claude 연결

**Claude Code**

```bash
claude mcp add --transport http personal-training http://localhost:8787/mcp
```

**Claude Desktop** (`claude_desktop_config.json`, 서버와 같은 data 폴더를 쓰도록 경로 지정)

```json
{
  "mcpServers": {
    "personal-training": {
      "command": "npx",
      "args": ["tsx", "/절대경로/personal-training/server/stdio.ts"],
      "env": { "WORKOUT_DATA_DIR": "/절대경로/personal-training/server/data" }
    }
  }
}
```

MCP가 다루는 사용자는 마지막으로 동기화한 기기다. 여러 기기를 쓰면 `WORKOUT_DEVICE_ID`로 고정한다.

### MCP 도구

| 도구 | 하는 일 |
| --- | --- |
| `get_weekly_plan` | 운동 계획 조회 (월~일, 휴식일 포함) |
| `create_day_plan` | 운동 계획 작성 (요일, 운동·세트·횟수·무게). 이미 있으면 `overwrite: true` 필요 |
| `update_day_plan` | 운동 계획 수정 (항목 추가·변경·삭제, 이름·메모, 휴식일로 비우기) |
| `list_workout_records` | 운동 기록 조회 (기간·운동별 필터) |
| `search_exercises` | 계획 작성용 운동 id 검색 |

Claude가 쓴 계획에는 앱에서 "Claude" 표시가 붙고, 다음 동기화 때 앱에 반영된다(마지막 수정 우선).

## 검사

```bash
npm run typecheck     # 앱 + 서버
npm test              # 도메인·스토어 (jest)
npm run test:server   # 서버 동기화 ↔ MCP 끝까지 (node:test)
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
  domain/                 순수 규칙: plan(요일·하단 버튼 규칙), calc(볼륨·PR), rules(입력 범위·휴식)
  store/                  zustand + 로컬 JSON 파일 저장
  features/session/       운동 진행 동작, 바텀시트 틀, 전체 타이머
  features/timer/         휴식 타이머, 예약 알림
  features/workout-notice/ 진행 중 알림 (Android 고정 알림 / iOS Live Activity)
  widgets/                iOS Live Activity 레이아웃
  lib/companion.ts        동기화 서버 클라이언트
server/
  http.ts                 동기화 API + MCP(HTTP)
  stdio.ts                MCP(stdio, Claude Desktop)
  mcp.ts                  MCP 도구
  store.ts                기기별 JSON 저장
```

## 알아둘 점

- 인증은 목업이다. 서버는 기기 ID만으로 사용자를 구분하므로 같은 와이파이 안에서만 쓴다.
- Android "고정 알림"은 앱이 꺼져 있으면 숫자가 실시간으로 바뀌지 않는다(시작 시각·휴식 종료 시각을 보여 주고, 종료 알림은 예약돼 있어 울림). 실시간 카운트다운은 네이티브 포그라운드 서비스가 필요해 다음 단계로 둔다. iOS Live Activity는 시스템이 시계를 그려서 계속 흐른다.
- 이전 Supabase 백엔드 구현은 git 기록(`feat: Supabase schema…`)에 남아 있다. 클라우드 전환 시 참고.
