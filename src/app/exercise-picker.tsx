import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { BODY_PART_KO, EQUIPMENT_KO } from '@/data/exercises';
import type { BodyPart, Equipment, Exercise } from '@/domain/types';
import { lastSetsFor } from '@/domain/calc';
import { allExercises, selectFinishedSessions, useApp } from '@/store/app-store';
import { usePlanDraft } from '@/store/plan-draft';
import { Button, Card, Chip, Field, Icon, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/** for=session → 진행 중 세션에 추가, for=plan → 편집 중인 계획 초안에 추가 */
export default function ExercisePicker() {
  const params = useLocalSearchParams<{ for: string }>();
  const st = useApp();
  const [q, setQ] = useState('');
  const [part, setPart] = useState<BodyPart | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return allExercises(st).filter(
      (e) =>
        (!part || e.bodyParts.includes(part)) &&
        (!qq || e.nameKo.includes(qq) || e.nameEn.toLowerCase().includes(qq)),
    );
  }, [q, part, st.customExercises]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (e: Exercise) => {
    if (params.for === 'session') {
      st.addExerciseToSession(e.id);
    } else {
      // 직전 기록이 있으면 그 무게·횟수로 시작
      const last = lastSetsFor(e.id, selectFinishedSessions(st)).filter((x) => x.kind !== 'warmup');
      const top = last.reduce<(typeof last)[number] | undefined>((a, x) => (!a || x.weight > a.weight ? x : a), undefined);
      usePlanDraft.getState().add(e.id, top ? { weightKg: top.weight, reps: top.reps, sets: Math.max(1, last.length) } : undefined);
    }
    router.back();
  };

  if (creating) return <CustomExerciseForm onDone={(e) => (e ? pick(e) : setCreating(false))} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, gap: S.md }}>
      <Field placeholder="운동 이름 검색" value={q} onChangeText={setQ} autoFocus />
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="전체" selected={!part} onPress={() => setPart(null)} />
        {(Object.keys(BODY_PART_KO) as BodyPart[]).map((p) => (
          <Chip key={p} label={BODY_PART_KO[p]} selected={part === p} onPress={() => setPart(p)} />
        ))}
      </Row>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border }} />}
        ListFooterComponent={
          <Button style={{ marginTop: S.lg }} kind="secondary" icon={IC.add} title="커스텀 운동 만들기" onPress={() => setCreating(true)} />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={{ paddingVertical: S.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Text v="h3">{item.nameKo}</Text>
                <Text v="small" dim>
                  {item.bodyParts.map((b) => BODY_PART_KO[b]).join(' · ')} · {EQUIPMENT_KO[item.equipment]}
                  {item.isCustom ? ' · 내 운동' : ''}
                </Text>
              </View>
              <Icon name={IC.add} color={C.accent} />
            </Row>
          </Pressable>
        )}
      />
    </View>
  );
}

function CustomExerciseForm({ onDone }: { onDone: (e?: Exercise) => void }) {
  const add = useApp((s) => s.addCustomExercise);
  const [name, setName] = useState('');
  const [part, setPart] = useState<BodyPart>('chest');
  const [eq, setEq] = useState<Equipment>('dumbbell');
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, gap: S.lg }}>
      <Field label="운동 이름" value={name} onChangeText={setName} placeholder="예: 스미스 인클라인 프레스" />
      <Card>
        <Text v="small" dim>
          주 부위
        </Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {(Object.keys(BODY_PART_KO) as BodyPart[]).map((p) => (
            <Chip key={p} label={BODY_PART_KO[p]} selected={part === p} onPress={() => setPart(p)} />
          ))}
        </Row>
        <Text v="small" dim>
          장비
        </Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {(Object.keys(EQUIPMENT_KO) as Equipment[]).map((p) => (
            <Chip key={p} label={EQUIPMENT_KO[p]} selected={eq === p} onPress={() => setEq(p)} />
          ))}
        </Row>
      </Card>
      <Row>
        <Button kind="secondary" title="취소" onPress={() => onDone()} />
        <Button
          style={{ flex: 1 }}
          title="만들고 추가"
          disabled={name.trim().length < 2}
          onPress={() =>
            onDone(
              add({
                nameKo: name.trim(),
                nameEn: name.trim(),
                bodyParts: [part],
                equipment: eq,
                type: eq === 'bodyweight' ? 'bodyweight' : part === 'cardio' ? 'cardio' : 'weighted',
              }),
            )
          }
        />
      </Row>
    </View>
  );
}
