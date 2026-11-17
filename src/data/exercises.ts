// 기본 운동 라이브러리 (직접 제작). 이미지·상세 설명은 추후 직접 제작/오픈 데이터로 보강.
// 오픈 데이터를 섞을 때는 라이선스(출처 표기·동일조건 변경허락) 확인 후 source 필드에 기록할 것.
import type { Exercise } from '@/domain/types';

type Seed = Omit<Exercise, 'type'> & { type?: Exercise['type'] };

const seeds: Seed[] = [
  // 가슴
  { id: 'bench-press', nameKo: '벤치 프레스', nameEn: 'Bench Press', bodyParts: ['chest', 'triceps', 'shoulders'], equipment: 'barbell', defaultRestSec: 150 },
  { id: 'incline-bench-press', nameKo: '인클라인 벤치 프레스', nameEn: 'Incline Bench Press', bodyParts: ['chest', 'shoulders', 'triceps'], equipment: 'barbell', defaultRestSec: 120 },
  { id: 'db-bench-press', nameKo: '덤벨 벤치 프레스', nameEn: 'Dumbbell Bench Press', bodyParts: ['chest', 'triceps'], equipment: 'dumbbell' },
  { id: 'incline-db-press', nameKo: '인클라인 덤벨 프레스', nameEn: 'Incline Dumbbell Press', bodyParts: ['chest', 'shoulders'], equipment: 'dumbbell' },
  { id: 'db-fly', nameKo: '덤벨 플라이', nameEn: 'Dumbbell Fly', bodyParts: ['chest'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'chest-press-machine', nameKo: '체스트 프레스 머신', nameEn: 'Chest Press Machine', bodyParts: ['chest', 'triceps'], equipment: 'machine' },
  { id: 'pec-deck', nameKo: '펙 덱 플라이', nameEn: 'Pec Deck Fly', bodyParts: ['chest'], equipment: 'machine', defaultRestSec: 60 },
  { id: 'cable-crossover', nameKo: '케이블 크로스오버', nameEn: 'Cable Crossover', bodyParts: ['chest'], equipment: 'cable', defaultRestSec: 60 },
  { id: 'push-up', nameKo: '푸시업', nameEn: 'Push-up', bodyParts: ['chest', 'triceps', 'core'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 60 },
  { id: 'dips', nameKo: '딥스', nameEn: 'Dips', bodyParts: ['chest', 'triceps'], equipment: 'bodyweight', type: 'bodyweight' },
  // 등
  { id: 'deadlift', nameKo: '데드리프트', nameEn: 'Deadlift', bodyParts: ['back', 'hamstrings', 'glutes'], equipment: 'barbell', defaultRestSec: 180 },
  { id: 'barbell-row', nameKo: '바벨 로우', nameEn: 'Barbell Row', bodyParts: ['back', 'biceps'], equipment: 'barbell', defaultRestSec: 120 },
  { id: 'db-row', nameKo: '원암 덤벨 로우', nameEn: 'One-arm Dumbbell Row', bodyParts: ['back', 'biceps'], equipment: 'dumbbell' },
  { id: 'lat-pulldown', nameKo: '랫 풀다운', nameEn: 'Lat Pulldown', bodyParts: ['back', 'biceps'], equipment: 'cable' },
  { id: 'seated-cable-row', nameKo: '시티드 케이블 로우', nameEn: 'Seated Cable Row', bodyParts: ['back', 'biceps'], equipment: 'cable' },
  { id: 'pull-up', nameKo: '풀업', nameEn: 'Pull-up', bodyParts: ['back', 'biceps'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 120 },
  { id: 'chin-up', nameKo: '친업', nameEn: 'Chin-up', bodyParts: ['back', 'biceps'], equipment: 'bodyweight', type: 'bodyweight' },
  { id: 'machine-row', nameKo: '머신 로우', nameEn: 'Machine Row', bodyParts: ['back'], equipment: 'machine' },
  { id: 'back-extension', nameKo: '백 익스텐션', nameEn: 'Back Extension', bodyParts: ['back', 'glutes', 'hamstrings'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 60 },
  // 어깨
  { id: 'overhead-press', nameKo: '오버헤드 프레스', nameEn: 'Overhead Press', bodyParts: ['shoulders', 'triceps'], equipment: 'barbell', defaultRestSec: 150 },
  { id: 'db-shoulder-press', nameKo: '덤벨 숄더 프레스', nameEn: 'Dumbbell Shoulder Press', bodyParts: ['shoulders', 'triceps'], equipment: 'dumbbell' },
  { id: 'lateral-raise', nameKo: '사이드 레터럴 레이즈', nameEn: 'Lateral Raise', bodyParts: ['shoulders'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'rear-delt-fly', nameKo: '리어 델트 플라이', nameEn: 'Rear Delt Fly', bodyParts: ['shoulders', 'back'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'face-pull', nameKo: '페이스 풀', nameEn: 'Face Pull', bodyParts: ['shoulders', 'back'], equipment: 'cable', defaultRestSec: 60 },
  { id: 'shoulder-press-machine', nameKo: '숄더 프레스 머신', nameEn: 'Shoulder Press Machine', bodyParts: ['shoulders', 'triceps'], equipment: 'machine' },
  // 팔
  { id: 'barbell-curl', nameKo: '바벨 컬', nameEn: 'Barbell Curl', bodyParts: ['biceps'], equipment: 'barbell', defaultRestSec: 60 },
  { id: 'db-curl', nameKo: '덤벨 컬', nameEn: 'Dumbbell Curl', bodyParts: ['biceps'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'hammer-curl', nameKo: '해머 컬', nameEn: 'Hammer Curl', bodyParts: ['biceps'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'cable-curl', nameKo: '케이블 컬', nameEn: 'Cable Curl', bodyParts: ['biceps'], equipment: 'cable', defaultRestSec: 60 },
  { id: 'triceps-pushdown', nameKo: '트라이셉스 푸시다운', nameEn: 'Triceps Pushdown', bodyParts: ['triceps'], equipment: 'cable', defaultRestSec: 60 },
  { id: 'overhead-triceps-ext', nameKo: '오버헤드 트라이셉스 익스텐션', nameEn: 'Overhead Triceps Extension', bodyParts: ['triceps'], equipment: 'dumbbell', defaultRestSec: 60 },
  { id: 'skull-crusher', nameKo: '라잉 트라이셉스 익스텐션', nameEn: 'Skull Crusher', bodyParts: ['triceps'], equipment: 'barbell', defaultRestSec: 60 },
  // 하체
  { id: 'back-squat', nameKo: '바벨 백 스쿼트', nameEn: 'Back Squat', bodyParts: ['quads', 'glutes', 'hamstrings'], equipment: 'barbell', defaultRestSec: 180 },
  { id: 'front-squat', nameKo: '프론트 스쿼트', nameEn: 'Front Squat', bodyParts: ['quads', 'glutes', 'core'], equipment: 'barbell', defaultRestSec: 150 },
  { id: 'goblet-squat', nameKo: '고블릿 스쿼트', nameEn: 'Goblet Squat', bodyParts: ['quads', 'glutes'], equipment: 'dumbbell' },
  { id: 'leg-press', nameKo: '레그 프레스', nameEn: 'Leg Press', bodyParts: ['quads', 'glutes'], equipment: 'machine', defaultRestSec: 120 },
  { id: 'romanian-deadlift', nameKo: '루마니안 데드리프트', nameEn: 'Romanian Deadlift', bodyParts: ['hamstrings', 'glutes', 'back'], equipment: 'barbell', defaultRestSec: 120 },
  { id: 'db-rdl', nameKo: '덤벨 루마니안 데드리프트', nameEn: 'Dumbbell RDL', bodyParts: ['hamstrings', 'glutes'], equipment: 'dumbbell' },
  { id: 'leg-extension', nameKo: '레그 익스텐션', nameEn: 'Leg Extension', bodyParts: ['quads'], equipment: 'machine', defaultRestSec: 60 },
  { id: 'leg-curl', nameKo: '레그 컬', nameEn: 'Leg Curl', bodyParts: ['hamstrings'], equipment: 'machine', defaultRestSec: 60 },
  { id: 'lunge', nameKo: '런지', nameEn: 'Lunge', bodyParts: ['quads', 'glutes'], equipment: 'dumbbell' },
  { id: 'bulgarian-split-squat', nameKo: '불가리안 스플릿 스쿼트', nameEn: 'Bulgarian Split Squat', bodyParts: ['quads', 'glutes'], equipment: 'dumbbell' },
  { id: 'hip-thrust', nameKo: '힙 쓰러스트', nameEn: 'Hip Thrust', bodyParts: ['glutes', 'hamstrings'], equipment: 'barbell', defaultRestSec: 120 },
  { id: 'bw-squat', nameKo: '맨몸 스쿼트', nameEn: 'Bodyweight Squat', bodyParts: ['quads', 'glutes'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 60 },
  { id: 'calf-raise', nameKo: '카프 레이즈', nameEn: 'Calf Raise', bodyParts: ['calves'], equipment: 'machine', defaultRestSec: 60 },
  // 코어·유산소
  { id: 'plank', nameKo: '플랭크', nameEn: 'Plank', bodyParts: ['core'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 60 },
  { id: 'hanging-leg-raise', nameKo: '행잉 레그 레이즈', nameEn: 'Hanging Leg Raise', bodyParts: ['core'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 60 },
  { id: 'cable-crunch', nameKo: '케이블 크런치', nameEn: 'Cable Crunch', bodyParts: ['core'], equipment: 'cable', defaultRestSec: 60 },
  { id: 'crunch', nameKo: '크런치', nameEn: 'Crunch', bodyParts: ['core'], equipment: 'bodyweight', type: 'bodyweight', defaultRestSec: 45 },
  { id: 'kb-swing', nameKo: '케틀벨 스윙', nameEn: 'Kettlebell Swing', bodyParts: ['glutes', 'hamstrings', 'core'], equipment: 'kettlebell' },
  { id: 'band-pull-apart', nameKo: '밴드 풀 어파트', nameEn: 'Band Pull-apart', bodyParts: ['shoulders', 'back'], equipment: 'band', defaultRestSec: 45 },
  { id: 'treadmill', nameKo: '트레드밀', nameEn: 'Treadmill', bodyParts: ['cardio'], equipment: 'machine', type: 'cardio', defaultRestSec: 60 },
  { id: 'cycle', nameKo: '실내 사이클', nameEn: 'Stationary Bike', bodyParts: ['cardio'], equipment: 'machine', type: 'cardio', defaultRestSec: 60 },
  { id: 'rowing-machine', nameKo: '로잉 머신', nameEn: 'Rowing Machine', bodyParts: ['cardio', 'back'], equipment: 'machine', type: 'cardio', defaultRestSec: 60 },
];

export const EXERCISES: Exercise[] = seeds.map((s) => ({ type: 'weighted', ...s }));

export const BODY_PART_KO: Record<string, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  quads: '대퇴사두',
  hamstrings: '햄스트링',
  glutes: '둔근',
  calves: '종아리',
  core: '코어',
  cardio: '유산소',
};

export const EQUIPMENT_KO: Record<string, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  machine: '머신',
  cable: '케이블',
  bodyweight: '맨몸',
  kettlebell: '케틀벨',
  band: '밴드',
};
