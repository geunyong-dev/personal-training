# personal-training

MCP를 통해서 AI 에이전트를 연동하여, 헬스기록 및 식단을 관리해주는 앱

> 현재 범위: 운동 기록 MVP (식단 관리는 이후 단계)

운동을 기록하면 Claude가 MCP로 그 기록을 읽고 다음 루틴을 제안하는 헬스 기록 앱. 기획·정책은 「운동앱 기획·정책 정의서」를 따른다.

- 앱: React Native (Expo SDK 58, expo-router), 상태 zustand + 기기 저장(expo-sqlite localStorage)
- 백엔드: Supabase (Postgres + RLS, Auth 소셜 로그인, OAuth 2.1 서버)
- Claude 연동: Supabase Edge Function으로 띄운 원격 MCP 서버 (`supabase/functions/mcp`)

## 폴더 구조

```
src/
  app/                  화면 (expo-router)
    (tabs)/             홈 · 운동 · 기록 · 루틴 · 설정
    onboarding/         시작 → 프로필 → Claude 연결(필수)
    session/[id]        세션 상세·PR
    routine/[id]        루틴 편집 (Claude 제안 승인 포함)
    share/[id]          공유 카드 이미지
    oauth/consent       (웹) Claude 연결 동의 화면
    login, auth-callback (웹) 동의 화면용 로그인
  domain/               순수 규칙: 볼륨·PR(Epley)·과훈련 경고·휴식 우선순위·자동 종료·규칙 기반 추천
  data/exercises.ts     기본 운동 라이브러리 (54개)
  store/                zustand 스토어 (오프라인 우선)
  features/timer/       휴식 타이머: 예약 알림, iOS Live Activity, 진동
  lib/                  supabase 클라이언트, 동기화(LWW), CSV 내보내기
  widgets/              iOS Live Activity 레이아웃
supabase/
  migrations/           스키마 + RLS + MCP 헬퍼 함수
  seed.sql              운동 라이브러리 (npm run gen:seed 로 생성)
  functions/mcp/        MCP 서버 (도구 8개)
```

## 처음 실행하기

```bash
npm install
cp .env.example .env            # Supabase URL·anon 키 입력

# 백엔드 (Docker 필요)
npx supabase start
npx supabase gen signing-key --algorithm ES256   # MCP 인증용 비대칭 키 → supabase/signing_keys.json
npx supabase db reset           # 마이그레이션 + seed 적용
npx supabase functions serve mcp

# 앱
npm run web                     # 웹 미리보기 (OAuth 동의 화면도 여기서 뜸)
npx expo run:ios                # 개발 빌드 (Live Activity·알림 때문에 Expo Go는 불가)
npx expo run:android
```

검사:

```bash
npm run typecheck
npm test                        # 도메인·스토어 단위 테스트
npx eslint src scripts
deno test -A supabase/functions/mcp   # MCP 계산·프로토콜 테스트
```

## Claude 연결 흐름

1. 사용자가 Claude 커넥터 설정에 `https://<프로젝트>.supabase.co/functions/v1/mcp` 를 추가
2. Claude가 OAuth 2.1(동적 클라이언트 등록)로 Supabase Auth에 인증 요청
3. Supabase가 사용자를 웹 `/oauth/consent?authorization_id=…` 로 보냄 → 로그인 후 "허용"
4. Claude가 받은 사용자 토큰으로 MCP 도구 호출. 모든 쿼리는 RLS로 본인 데이터만
5. 첫 호출 때 `mcp_begin_call()` 이 `mcp_connections` 에 기록 → 앱 온보딩 "연결 확인"이 이 행으로 판단

### MCP 도구

| 도구 | 종류 | 설명 |
| --- | --- | --- |
| get_profile | 읽기 | 목표·경력·주 횟수·장비 (키·체중은 동의 시만) |
| list_sessions | 읽기 | 완료 세션, 기본 최근 12주 |
| get_exercise_history | 읽기 | 운동별 최고 무게·추정 1RM·볼륨 추이, PR |
| get_recovery_status | 읽기 | 부위별 회복도 (72시간 = 100%) |
| search_exercises | 읽기 | 라이브러리 + 커스텀 운동 검색 |
| list_routines | 읽기 | 루틴 목록 (active / proposed / archived) |
| propose_routine | 쓰기 | 루틴을 "제안" 상태로 추가 → 앱에서 승인해야 적용 |
| add_session_note | 쓰기 | 세션 메모 끝에 `[Claude]` 코멘트 추가 |

호출 제한: 사용자당 분당 60회, 쓰기 하루 50회. 모든 호출은 `mcp_audit_log` 에 남고 앱 설정 화면에서 보인다.

## 정책 → 코드 위치

| 정책 (정의서) | 구현 |
| --- | --- |
| 5.1 만 14세 미만 가입 불가, 안전 고지 | `onboarding/index.tsx` 체크박스 |
| 5.1 닉네임 2~12자·중복 불가 | `domain/rules.ts` + DB check/unique + `nickname_taken()` |
| 5.1 탈퇴 30일 유예 | `request_account_deletion()`, `purge_deleted_accounts()` (pg_cron) |
| 5.2 웜업 제외 볼륨, Epley 1RM(10회 이하), PR | `domain/calc.ts` |
| 5.2 3시간 무활동 자동 종료, 완료 0세트 미저장 | `domain/rules.ts`, `store/app-store.ts` |
| 5.2 오프라인 우선, LWW 충돌 해결 | `lib/sync.ts` + DB 트리거 `touch_updated_at()` |
| 5.3 휴식 우선순위 운동 > 루틴 > 전역(90초) | `resolveRestSec()` |
| 5.3 종료 10초 전 진동, 앱 종료돼도 알림 | `features/timer/*` (예약 알림 + Live Activity) |
| 5.4 공유 카드는 기기에서 생성, 신체 정보 제외 | `app/share/[id].tsx` |
| 5.5 Claude 쓰기는 제안·메모만, 감사 로그, 호출 제한 | `supabase/functions/mcp/server.ts`, `mcp_begin_call()` |
| 5.6 운동 중 화면·공유 카드에 광고 없음 | (광고 도입 시 지킬 것) |
| 5.7 키·체중 별도 동의 | DB `body_needs_consent` 제약, `ProfileForm` |
| 5.8 과훈련 경고 (4주 평균 대비 +30%) | `overloadWarning()` → 홈 배너 |

## 설계 메모

- 세션의 운동·세트는 `sessions.exercises` jsonb 한 컬럼에 저장한다. 오프라인 동기화를 단순하게 하려는 선택이며, 분석·조회용으로 세트를 행으로 펼친 뷰 `session_sets` 를 둔다.
- 무게는 항상 kg로 저장하고 표시할 때만 lb로 바꾼다.

## 아직 안 된 것 (TODO)

- Android 진행 중 알림의 실시간 카운트다운 (지금은 예약 알림만). expo-widgets CustomNotification으로 구현 예정
- Live Activity 안의 ±15초·건너뛰기 버튼 (지금은 표시만)
- 운동 이미지·상세 설명 (직접 제작 + 오픈 데이터, 라이선스 확인 필요)
- 공유 웹 링크, 주간 리포트, HealthKit/Health Connect (2차)
- 광고 SDK (정책 5.6 준수)
- 실제 Supabase 프로젝트·소셜 로그인 키 설정, EAS 빌드 설정
