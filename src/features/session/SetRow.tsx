import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fromKg, snapWeight, toKg } from '@/domain/rules';
import type { SetKind, Unit, WorkoutSet } from '@/domain/types';
import { Icon, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

const KIND_LABEL: Record<SetKind, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };
const KIND_ORDER: SetKind[] = ['normal', 'warmup', 'drop', 'failure'];

export function SetRow({
  index,
  set,
  unit,
  hint,
  bodyweight,
  onChange,
  onToggle,
  onRemove,
}: {
  index: number;
  set: WorkoutSet;
  unit: Unit;
  hint?: WorkoutSet; // 직전 기록 (회색 힌트, 5.2)
  bodyweight?: boolean;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const done = !!set.completedAt;
  const show = (kg: number) => (kg ? String(Math.round(fromKg(kg, unit) * 100) / 100) : '');
  const [w, setW] = useState(show(set.weight));
  const [r, setR] = useState(set.reps ? String(set.reps) : '');

  const commitWeight = (txt: string) => {
    const n = Number(txt.replace(',', '.'));
    onChange({ weight: Number.isFinite(n) ? snapWeight(toKg(n, unit)) : 0 });
  };
  const commitReps = (txt: string) => {
    const n = parseInt(txt, 10);
    onChange({ reps: Number.isFinite(n) ? n : 0 });
  };

  // 힌트 탭하면 직전 기록으로 채움
  const applyHint = () => {
    if (!hint) return;
    setW(show(hint.weight));
    setR(String(hint.reps));
    onChange({ weight: hint.weight, reps: hint.reps });
  };

  const nextKind = () => onChange({ kind: KIND_ORDER[(KIND_ORDER.indexOf(set.kind) + 1) % KIND_ORDER.length] });

  return (
    <View style={[styles.row, done && styles.rowDone]}>
      <Pressable onPress={nextKind} onLongPress={onRemove} style={styles.idx} accessibilityLabel="세트 종류 바꾸기, 길게 누르면 삭제">
        <Text v="h3" color={set.kind === 'normal' ? C.textDim : C.warn}>
          {KIND_LABEL[set.kind] || index + 1}
        </Text>
      </Pressable>
      <Pressable onPress={applyHint} style={styles.hint}>
        <Text v="small" faint numberOfLines={1}>
          {hint ? `${show(hint.weight) || 0}${bodyweight ? '' : unit} × ${hint.reps}` : '—'}
        </Text>
      </Pressable>
      {!bodyweight ? (
        <TextInput
          style={styles.input}
          value={w}
          onChangeText={setW}
          onEndEditing={(e) => commitWeight(e.nativeEvent.text)}
          onBlur={() => commitWeight(w)}
          keyboardType="decimal-pad"
          placeholder={hint ? show(hint.weight) : unit}
          placeholderTextColor={C.textFaint}
          editable={!done}
          selectTextOnFocus
        />
      ) : (
        <View style={styles.input} />
      )}
      <TextInput
        style={styles.input}
        value={r}
        onChangeText={setR}
        onEndEditing={(e) => commitReps(e.nativeEvent.text)}
        onBlur={() => commitReps(r)}
        keyboardType="number-pad"
        placeholder={hint ? String(hint.reps) : '회'}
        placeholderTextColor={C.textFaint}
        editable={!done}
        selectTextOnFocus
      />
      <Pressable
        onPress={() => {
          commitWeight(w);
          commitReps(r);
          onToggle();
        }}
        style={[styles.check, done && { backgroundColor: C.accent }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}>
        <Icon name={IC.check} size={18} color={done ? C.accentInk : C.textDim} />
      </Pressable>
    </View>
  );
}

export function SetHeader({ unit, bodyweight }: { unit: Unit; bodyweight?: boolean }) {
  return (
    <View style={[styles.row, { paddingVertical: 0 }]}>
      <Text v="small" faint style={styles.idx}>
        세트
      </Text>
      <Text v="small" faint style={styles.hint}>
        이전
      </Text>
      <Text v="small" faint style={[styles.input, styles.headerCell]}>
        {bodyweight ? '' : unit}
      </Text>
      <Text v="small" faint style={[styles.input, styles.headerCell]}>
        횟수
      </Text>
      <View style={[styles.check, { backgroundColor: 'transparent' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 4, borderRadius: R.sm },
  rowDone: { backgroundColor: '#1D2A12' },
  idx: { width: 32, alignItems: 'center', textAlign: 'center' },
  hint: { flex: 1 },
  input: {
    width: 64,
    backgroundColor: C.surface2,
    color: C.text,
    borderRadius: R.sm,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  headerCell: { backgroundColor: 'transparent', paddingVertical: 0 },
  check: { width: 40, height: 36, borderRadius: R.sm, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
});
