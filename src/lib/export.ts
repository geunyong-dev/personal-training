// 전체 기록 CSV 내보내기 (5.7)
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { findExercise, selectFinishedSessions, useApp } from '@/store/app-store';

export function buildCsv(): string {
  const st = useApp.getState();
  const head = ['date', 'exercise', 'set', 'kind', 'weight_kg', 'reps', 'rpe', 'rest_sec', 'memo'];
  const lines = [head.join(',')];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  for (const s of [...selectFinishedSessions(st)].reverse()) {
    for (const ex of s.exercises) {
      ex.sets.forEach((x, i) => {
        lines.push(
          [s.startedAt, findExercise(st, ex.exerciseId)?.nameKo ?? ex.exerciseId, i + 1, x.kind, x.weight, x.reps, x.rpe, x.restActualSec, i === 0 ? s.memo : '']
            .map(esc)
            .join(','),
        );
      });
    }
  }
  return lines.join('\n');
}

export async function exportCsv(): Promise<void> {
  const csv = '﻿' + buildCsv(); // 엑셀 한글 깨짐 방지 BOM
  const name = `workout-${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: '운동 기록 내보내기' });
}
