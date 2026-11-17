// 앱의 운동 라이브러리(src/data/exercises.ts)로 supabase/seed.sql 을 만든다.
// 실행: npm run gen:seed
import { writeFileSync } from 'node:fs';

import { EXERCISES } from '../src/data/exercises';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = EXERCISES.map(
  (e) =>
    `  (${q(e.id)}, ${q(e.nameKo)}, ${q(e.nameEn)}, array[${e.bodyParts.map(q).join(', ')}], ${q(e.equipment)}, ${q(e.type)}, ${e.defaultRestSec ?? 'null'})`,
);

const sql = `-- 자동 생성 파일: npm run gen:seed
insert into public.exercise_library (id, name_ko, name_en, body_parts, equipment, type, default_rest_sec) values
${rows.join(',\n')}
on conflict (id) do update set
  name_ko = excluded.name_ko, name_en = excluded.name_en, body_parts = excluded.body_parts,
  equipment = excluded.equipment, type = excluded.type, default_rest_sec = excluded.default_rest_sec;
`;

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log(`seed.sql: ${EXERCISES.length} exercises`);
