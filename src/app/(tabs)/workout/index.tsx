import { router, Stack } from 'expo-router';
import { Pressable, View } from 'react-native';

import { BODY_PART_KO } from '@/data/exercises';
import { sessionVolume } from '@/domain/calc';
import { WEEKDAY_KO, weekdayOf } from '@/domain/plan';
import { formatWeight } from '@/domain/rules';
import type { Session } from '@/domain/types';
import { ElapsedClock } from '@/features/session/ElapsedClock';
import { WorkoutShell } from '@/features/session/WorkoutShell';
import { discardWorkout, finishWorkout, firstUnfinishedIndex, openRest, startTodayWorkout } from '@/features/session/workout-actions';
import { findExercise, selectActiveSession, useApp } from '@/store/app-store';
import { Button, Card, Empty, Field, Icon, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

export default function WorkoutTab() {
  const active = useApp(selectActiveSession);
  return active ? <TodayWorkout session={active} /> : <NoActiveWorkout />;
}

/** 진행 중 운동이 없을 때: 홈과 같은 규칙으로 시작 또는 계획 */
function NoActiveWorkout() {
  const today = weekdayOf();
  const plan = useApp((s) => s.plan.days[today]);
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: '오늘의 운동', headerRight: undefined }} />
      {plan ? (
        <Card>
          <Text v="small" color={C.accent}>
            {WEEKDAY_KO[today]}요일 계획
          </Text>
          <Text v="h2">{plan.title ?? `${plan.items.length}개 운동`}</Text>
          {plan.items.map((it, i) => (
            <Text key={`${it.exerciseId}${i}`} v="small" dim>
              {i + 1}. {findExercise(useApp.getState(), it.exerciseId)?.nameKo} · {it.sets}×{it.reps}
            </Text>
          ))}
          <Button icon={IC.play} title="오늘의 운동 시작" onPress={() => startTodayWorkout(today)} />
        </Card>
      ) : (
        <>
          <Empty title="오늘은 계획이 없어요" body="오늘 할 운동을 정하면 바로 시작할 수 있어요." />
          <Button
            icon={IC.add}
            title="오늘의 운동 계획하기"
            onPress={() => router.push({ pathname: '/plan/[day]', params: { day: String(today), start: '1' } })}
          />
        </>
      )}
    </Screen>
  );
}

/** 오늘의 운동: 운동 항목 목록. 항목을 누르면 그 운동 페이지로 */
function TodayWorkout({ session }: { session: Session }) {
  const st = useApp();
  const unit = st.settings.unit;
  const total = session.exercises.length;
  const doneCount = session.exercises.filter((e) => e.sets.length > 0 && e.sets.every((x) => x.completedAt)).length;
  const resume = firstUnfinishedIndex(session);
  const allDone = total > 0 && doneCount === total;

  return (
    <WorkoutShell
      edges={[]}
      onRest={() => openRest(resume)}
      primary={
        allDone || total === 0
          ? { title: '운동 완료', icon: 'done', onPress: () => void finishWorkout() }
          : {
              title: '이어서 하기',
              icon: 'next',
              onPress: () => router.push({ pathname: '/workout/[exerciseId]', params: { exerciseId: session.exercises[resume].id } }),
            }
      }>
      {/* 전체 운동 타이머는 상단 헤더에 (요구사항 8) */}
      <Stack.Screen
        options={{
          title: '오늘의 운동',
          headerRight: () => <ElapsedClock startedAt={session.startedAt} />,
        }}
      />

      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text v="h1" numberOfLines={1}>
            {session.title ?? (session.planDay != null ? `${WEEKDAY_KO[session.planDay]}요일 계획` : '자유 운동')}
          </Text>
          <Text dim>
            {doneCount}/{total} 운동 완료 · {formatWeight(sessionVolume(session), unit)}
          </Text>
        </View>
        <Button small kind="ghost" title="버리기" onPress={() => void discardWorkout()} />
      </Row>

      {total === 0 ? <Empty title="아직 운동이 없어요" body="아래에서 운동을 추가해 주세요." /> : null}

      <View style={{ gap: S.sm }}>
        {session.exercises.map((ex, i) => {
          const def = findExercise(st, ex.exerciseId);
          const done = ex.sets.filter((x) => x.completedAt).length;
          const status = ex.sets.length > 0 && done === ex.sets.length ? 'done' : done > 0 || i === resume ? 'doing' : 'todo';
          const plan = ex.sets[0];
          return (
            <Pressable
              key={ex.id}
              onPress={() => router.push({ pathname: '/workout/[exerciseId]', params: { exerciseId: ex.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${def?.nameKo}, ${done}/${ex.sets.length} 세트`}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, borderWidth: 1, borderColor: status === 'doing' ? C.accent : 'transparent' }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: R.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: status === 'done' ? C.accent : C.surface2,
                  }}>
                  {status === 'done' ? (
                    <Icon name={IC.check} size={16} color={C.accentInk} />
                  ) : (
                    <Text v="h3" dim>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text v="h3" numberOfLines={1} color={status === 'done' ? C.textDim : C.text}>
                    {def?.nameKo ?? '알 수 없는 운동'}
                  </Text>
                  <Text v="small" faint numberOfLines={1}>
                    {done}/{ex.sets.length}세트
                    {plan ? ` · ${plan.weight ? `${formatWeight(plan.weight, unit)} × ` : ''}${plan.reps}회` : ''}
                    {def ? ` · ${def.bodyParts.slice(0, 2).map((b) => BODY_PART_KO[b]).join('·')}` : ''}
                  </Text>
                </View>
                <Icon name={IC.chevron} size={14} color={C.textFaint} />
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Button kind="secondary" icon={IC.add} title="운동 추가" onPress={() => router.push({ pathname: '/exercise-picker', params: { for: 'session' } })} />

      <Field
        label="메모"
        placeholder="컨디션, 통증 부위 등 (Claude가 참고해요)"
        defaultValue={session.memo}
        onEndEditing={(e) => st.setSessionMemo(e.nativeEvent.text)}
        multiline
      />
    </WorkoutShell>
  );
}
