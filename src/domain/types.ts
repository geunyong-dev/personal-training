// 도메인 타입

export type Unit = 'kg' | 'lb';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band';
export type BodyPart =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'cardio';
export type ExerciseType = 'weighted' | 'bodyweight' | 'cardio';
export type SetKind = 'normal' | 'warmup' | 'drop' | 'failure';
export type SessionEndReason = 'manual' | 'auto';
export type PRType = 'max_weight' | 'e1rm' | 'volume';

/** 기기별 목업 인증으로 만든 로컬 사용자 */
export interface LocalUser {
  id: string; // 기기 ID (uuid). 동기화 서버·MCP에서 사용자 키로 쓴다
  nickname: string;
  createdAt: string;
}

export interface Settings {
  unit: Unit;
  defaultRestSec: number; // 전역 기본 휴식 (5.3), 기본 90
  autoStartRest: boolean;
  restSound: boolean;
}

export interface Exercise {
  id: string;
  nameKo: string;
  nameEn: string;
  bodyParts: BodyPart[];
  equipment: Equipment;
  type: ExerciseType;
  isCustom?: boolean;
  defaultRestSec?: number; // 운동별 휴식 (우선순위 1)
}

/** 요일: 0=월 … 6=일 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 계획의 운동 한 항목: 몇 세트 몇 회 몇 kg */
export interface PlanItem {
  exerciseId: string;
  sets: number;
  reps: number;
  weightKg?: number;
  restSec?: number;
}

export interface DayPlan {
  title?: string; // 예: "가슴·삼두"
  items: PlanItem[];
  note?: string;
  source: 'user' | 'claude';
  updatedAt: string;
}

/** 1주 단위 운동 계획. 요일별로 미리 정해 두고 매일 그 계획으로 운동한다 */
export interface WeeklyPlan {
  days: Partial<Record<Weekday, DayPlan>>;
  updatedAt: string;
}

export interface WorkoutSet {
  id: string;
  kind: SetKind;
  weight: number; // 항상 kg로 저장, 표시할 때만 단위 변환
  reps: number;
  durationSec?: number;
  rpe?: number;
  completedAt?: string; // 완료 체크 시각. 없으면 미완료
  restActualSec?: number; // 이전 세트 완료 → 이 세트 시작까지 실제 휴식
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  restSec?: number; // 계획에서 넘어온 휴식 값
  sets: WorkoutSet[];
}

export interface Session {
  id: string;
  planDay?: Weekday; // 어떤 요일 계획으로 시작했는지
  title?: string;
  startedAt: string;
  endedAt?: string;
  endReason?: SessionEndReason;
  memo?: string;
  exercises: SessionExercise[];
  updatedAt: string;
}

export interface PersonalRecord {
  exerciseId: string;
  type: PRType;
  value: number;
  sessionId: string;
  setId?: string;
  achievedAt: string;
}
