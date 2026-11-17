import { router, useLocalSearchParams } from 'expo-router';
import { TextInput } from 'react-native';

import type { RoutineItem } from '@/domain/types';
import { findExercise, useApp } from '@/store/app-store';
import { confirm } from '@/ui/confirm';
import { Button, Card, Empty, Field, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R } from '@/ui/theme';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const st = useApp();
  const routine = st.routines.find((r) => r.id === id);
  if (!routine) return <Screen><Empty title="루틴을 찾을 수 없어요" /></Screen>;

  const save = (patch: Partial<typeof routine>) => st.upsertRoutine({ ...routine, ...patch });
  const setItem = (i: number, patch: Partial<RoutineItem>) =>
    save({ items: routine.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...routine.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    save({ items });
  };

  return (
    <Screen edges={['bottom']}>
      <Field label="루틴 이름" defaultValue={routine.name} onEndEditing={(e) => save({ name: e.nativeEvent.text.trim() || routine.name })} />
      {routine.status === 'proposed' ? (
        <Card style={{ borderColor: C.info, borderWidth: 1 }}>
          <Text v="small" dim>
            Claude가 제안한 루틴이에요. 수정 후 승인하면 내 루틴이 돼요.
          </Text>
          <Button small title="승인" onPress={() => st.approveProposal(routine.id)} />
        </Card>
      ) : null}

      {routine.items.map((it, i) => (
        <Card key={`${it.exerciseId}${i}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="h3" style={{ flex: 1 }}>
              {findExercise(st, it.exerciseId)?.nameKo ?? it.exerciseId}
            </Text>
            <Button small kind="ghost" title="↑" onPress={() => move(i, -1)} />
            <Button small kind="ghost" title="↓" onPress={() => move(i, 1)} />
            <Button small kind="ghost" icon={IC.trash} title="" onPress={() => save({ items: routine.items.filter((_, j) => j !== i) })} />
          </Row>
          <Row>
            <NumBox label="세트" value={it.targetSets} onChange={(v) => setItem(i, { targetSets: Math.max(1, Math.min(30, v)) })} />
            <NumBox label="횟수" value={it.targetReps} onChange={(v) => setItem(i, { targetReps: Math.max(1, Math.min(100, v)) })} />
            <NumBox label="휴식(초)" value={it.restSec ?? 0} onChange={(v) => setItem(i, { restSec: v > 0 ? v : undefined })} />
          </Row>
        </Card>
      ))}

      <Button kind="secondary" icon={IC.add} title="운동 추가" onPress={() => router.push({ pathname: '/exercise-picker', params: { for: routine.id } })} />
      <Button
        kind="danger"
        icon={IC.trash}
        title="루틴 삭제"
        onPress={async () => {
          if (await confirm('루틴 삭제', `'${routine.name}'을(를) 삭제할까요?`, '삭제', true)) {
            st.deleteRoutine(routine.id);
            router.back();
          }
        }}
      />
    </Screen>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Card style={{ flex: 1, padding: 8, backgroundColor: C.surface2 }}>
      <Text v="small" dim>
        {label}
      </Text>
      <TextInput
        defaultValue={value ? String(value) : ''}
        keyboardType="number-pad"
        placeholder="기본"
        placeholderTextColor={C.textFaint}
        onEndEditing={(e) => onChange(parseInt(e.nativeEvent.text, 10) || 0)}
        style={{ color: C.text, fontSize: 18, borderRadius: R.sm, fontVariant: ['tabular-nums'] }}
      />
    </Card>
  );
}
