// 도메인 타입. 정의서 6장(데이터 모델 초안)과 1:1로 대응한다.

export type Unit = 'kg' | 'lb';
export type Goal = 'muscle' | 'strength' | 'fat_loss' | 'health';
export type Level = 'beginner' | 'intermediate' | 'advanced';
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
export type RoutineSource = 'manual' | 'template' | 'claude';
export type RoutineStatus = 'proposed' | 'active' | 'archived';
export type SessionEndReason = 'manual' | 'auto';
export type PRType = 'max_weight' | 'e1rm' | 'volume';

export interface Profile {
  nickname: string;
  goal: Goal;
  level: Level;
  weeklyFreq: number; // 1~7
  equipment: Equipment[];
  heightCm?: number;
  weightKg?: number;
  consentBody: boolean; // 키·체중 별도 선택 동의 (5.7)
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

export interface RoutineItem {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  targetWeight?: number;
  restSec?: number; // 루틴 내 휴식 (우선순위 2)
}

export interface Routine {
  id: string;
  name: string;
  source: RoutineSource;
  status: RoutineStatus;
  items: RoutineItem[];
  note?: string; // Claude 제안 사유 등
  createdAt: string;
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
  restSec?: number; // 루틴에서 넘어온 휴식 값
  sets: WorkoutSet[];
}

export interface Session {
  id: string;
  routineId?: string;
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
