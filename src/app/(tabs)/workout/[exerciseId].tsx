import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { BODY_PART_KO, EQUIPMENT_KO } from '@/data/exercises';
import { lastSetsFor } from '@/domain/calc';
import { currentSetIndex, FOOTER_LABEL, footerAction } from '@/domain/plan';
import { LIMITS } from '@/domain/rules';
import { ElapsedClock } from '@/features/session/ElapsedClock';
import { SetHeader, SetRow } from '@/features/session/SetRow';
import { WorkoutShell } from '@/features/session/WorkoutShell';
import { completeAndFinish, completeAndGoNext, completeCurrentSet, openRest, toggleSet } from '@/features/session/workout-actions';
import { findExercise, selectActiveSession, selectFinishedSessions, useApp } from '@/store/app-store';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Empty, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/**
 * 운동 한 항목 페이지
 * - 상단 헤더: 전체 운동 타이머 / 휴식 타이머는 바텀시트 (요구사항 8)
 * - 하단: [휴식 타이머 | 세트 완료] → 마지막 세트면 [휴식 타이머 | 다음 운동] → 마지막 운동의 마지막 세트면 [휴식 타이머 | 운동 완료] (요구사항 9)
 */
export default function ExerciseDetail() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const st = useApp();
  const session = selectActiveSession(st);
  const history = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const index = session?.exercises.findIndex((e) => e.id === exerciseId) ?? -1;
  const ex = index >= 0 ? session!.exercises[index] : undefined;

  if (!session || !ex) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: '' }} />
        <Empty title="진행 중인 운동이 아니에요" />
        <Button kind="secondary" title="오늘의 운동으로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/workout'))} />
      </Screen>
    );
  }

  const unit = st.settings.unit;
  const def = findExercise(st, ex.exerciseId);
  const bw = def?.type === 'bodyweight';
  const hints = lastSetsFor(ex.exerciseId, history, session.id);
  const total = session.exercises.length;
  const cur = currentSetIndex(ex);
  const action = footerAction(session, index);
  const next = session.exercises[index + 1];

  const onPrimary = () => {
    if (action === 'complete_set') void completeCurrentSet(ex.id);
    else if (action === 'next_exercise') void completeAndGoNext(ex.id);
    else void completeAndFinish(ex.id);
  };

  return (
    <WorkoutShell
      edges={[]}
      onRest={() => openRest(index)}
      primary={{
        title: action === 'complete_set' ? `${FOOTER_LABEL.complete_set} (${cur + 1}/${ex.sets.length})` : FOOTER_LABEL[action],
        icon: action === 'complete_set' ? 'set' : action === 'finish' ? 'done' : 'next',
        onPress: onPrimary,
      }}>
      <Stack.Screen
        options={{
          title: `운동 ${index + 1}/${total}`,
          headerRight: () => <ElapsedClock startedAt={session.startedAt} />,
        }}
      />

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="h1">{def?.nameKo ?? '알 수 없는 운동'}</Text>
          <Text v="small" dim>
            {def ? `${def.bodyParts.map((b) => BODY_PART_KO[b]).join(' · ')} · ${EQUIPMENT_KO[def.equipment]}` : ''}
          </Text>
        </View>
        <Button
          small
          kind="ghost"
          icon={IC.trash}
          title=""
          onPress={async () => {
            if (await confirm('운동 삭제', `${def?.nameKo}을(를) 오늘의 운동에서 뺄까요?`, '삭제', true)) {
              st.removeExerciseFromSession(ex.id);
              router.back();
            }
          }}
        />
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="h3">세트</Text>
          <Text v="small" dim>
            {ex.sets.filter((x) => x.completedAt).length}/{ex.sets.length} 완료
          </Text>
        </Row>
        <SetHeader unit={unit} bodyweight={bw} />
        {ex.sets.map((set, i) => {
          const sameKind = hints.filter((h) => h.kind === set.kind);
          const nth = ex.sets.slice(0, i).filter((x) => x.kind === set.kind).length;
          return (
            <SetRow
              key={set.id}
              index={i}
              set={set}
              unit={unit}
              bodyweight={bw}
              current={i === cur}
              hint={sameKind[nth] ?? sameKind.at(-1) ?? hints.at(-1)}
              onChange={(patch) => st.updateSet(ex.id, set.id, patch)}
              onToggle={() => void toggleSet(ex.id, set.id)}
              onRemove={() => st.removeSet(ex.id, set.id)}
            />
          );
        })}
        <Button
          small
          kind="secondary"
          icon={IC.add}
          title="세트 추가"
          onPress={() => {
            if (ex.sets.length >= LIMITS.setsPerExerciseMax) notice(`세트는 운동당 ${LIMITS.setsPerExerciseMax}개까지 기록할 수 있어요`);
            else st.addSet(ex.id);
          }}
        />
        <Text v="small" faint>
          테두리가 있는 줄이 지금 세트예요. 번호를 누르면 세트 종류(웜업 W·드롭 D·실패 F)가 바뀌고, 길게 누르면 삭제돼요.
        </Text>
      </Card>

      {hints.length > 0 ? (
        <Text v="small" dim>
          지난 기록: {hints.map((h) => `${h.weight ? `${h.weight}kg×` : ''}${h.reps}`).join(', ')}
        </Text>
      ) : null}

      {next ? (
        <Text v="small" faint style={{ textAlign: 'center' }}>
          다음: {findExercise(st, next.exerciseId)?.nameKo}
        </Text>
      ) : (
        <Text v="small" color={C.accent} style={{ textAlign: 'center', marginTop: S.xs }}>
          마지막 운동이에요
        </Text>
      )}
    </WorkoutShell>
  );
}
