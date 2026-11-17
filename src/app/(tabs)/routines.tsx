import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { recommendRoutines } from '@/domain/recommend';
import type { Routine } from '@/domain/types';
import { uuid } from '@/lib/id';
import { allExercises, findExercise, useApp } from '@/store/app-store';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Empty, Icon, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

export default function Routines() {
  const st = useApp();
  const proposals = st.routines.filter((r) => r.status === 'proposed');
  const active = st.routines.filter((r) => r.status === 'active');

  const create = () => {
    const id = uuid();
    st.upsertRoutine({ id, name: '새 루틴', source: 'manual', status: 'active', items: [] });
    router.push({ pathname: '/routine/[id]', params: { id } });
  };

  const addRecommended = async () => {
    if (!st.profile) return;
    if (!(await confirm('추천 루틴 추가', '프로필(목표·주 횟수·장비)에 맞춘 기본 루틴을 추가할까요?', '추가'))) return;
    for (const r of recommendRoutines(st.profile, allExercises(st), new Date(), uuid)) st.upsertRoutine(r);
    notice('추천 루틴을 추가했어요');
  };

  return (
    <Screen>
      <Text v="h1">루틴</Text>

      {proposals.length > 0 ? (
        <Section title="Claude 제안함">
          {proposals.map((r) => (
            <Card key={r.id} style={{ borderColor: C.info, borderWidth: 1 }}>
              <Row>
                <Icon name={IC.sparkles} color={C.info} size={16} />
                <Text v="h3" style={{ flex: 1 }}>
                  {r.name}
                </Text>
              </Row>
              {r.note ? <Text v="small" dim>{r.note}</Text> : null}
              <RoutineItems routine={r} />
              <Row>
                <Button small kind="secondary" title="거절" onPress={() => st.rejectProposal(r.id)} />
                <Button small kind="secondary" title="수정" onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })} />
                <Button small style={{ flex: 1 }} title="승인하고 내 루틴에 추가" onPress={() => st.approveProposal(r.id)} />
              </Row>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section
        title="내 루틴"
        right={<Button small kind="secondary" icon={IC.add} title="새 루틴" onPress={create} />}>
        {active.length === 0 ? (
          <Empty title="루틴이 없어요" body="새 루틴을 만들거나 Claude에게 '루틴 짜줘'라고 말해 보세요." />
        ) : (
          active.map((r) => (
            <Pressable key={r.id} onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text v="h3">{r.name}</Text>
                  <Text v="small" faint>
                    {r.source === 'claude' ? 'Claude' : r.source === 'template' ? '추천' : '직접'}
                  </Text>
                </Row>
                <RoutineItems routine={r} />
              </Card>
            </Pressable>
          ))
        )}
      </Section>

      <Button kind="ghost" title="프로필 기반 추천 루틴 다시 받기" onPress={addRecommended} />
    </Screen>
  );
}

function RoutineItems({ routine }: { routine: Routine }) {
  const st = useApp();
  return (
    <View style={{ gap: 2 }}>
      {routine.items.map((it, i) => (
        <Text key={`${it.exerciseId}${i}`} v="small" dim>
          {findExercise(st, it.exerciseId)?.nameKo ?? it.exerciseId} · {it.targetSets}×{it.targetReps}
        </Text>
      ))}
      {routine.items.length === 0 ? (
        <Text v="small" faint style={{ marginTop: S.xs }}>
          운동이 없어요
        </Text>
      ) : null}
    </View>
  );
}
