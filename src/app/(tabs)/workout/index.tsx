import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { sessionVolume } from '@/domain/calc';
import { formatWeight } from '@/domain/rules';
import type { Session } from '@/domain/types';
import { WorkoutShell } from '@/features/session/WorkoutShell';
import { discardWorkout, finishWorkout, firstUnfinishedIndex, openRest } from '@/features/session/workout-actions';
import { ensurePermission } from '@/features/timer/notify';
import { findExercise, selectActiveSession, useApp } from '@/store/app-store';
import { BODY_PART_KO } from '@/data/exercises';
import { Button, Card, Empty, Field, Icon, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

export default function WorkoutTab() {
  const active = useApp(selectActiveSession);
  return active ? <TodayWorkout session={active} /> : <StartSession />;
}

/** 오늘의 운동: 운동 항목 목록. 항목을 누르면 그 운동 페이지로 들어간다 */
function TodayWorkout({ session }: { session: Session }) {
  const st = useApp();
  const unit = st.settings.unit;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  const total = session.exercises.length;
  const doneCount = session.exercises.filter((e) => e.sets.length > 0 && e.sets.every((x) => x.completedAt)).length;
  const resume = firstUnfinishedIndex(session);
  const allDone = total > 0 && doneCount === total;

  return (
    <WorkoutShell
      onRest={() => openRest(resume)}
      primary={
        allDone || total === 0
          ? { title: '운동 완료', icon: 'done', onPress: () => void finishWorkout() }
          : {
              title: doneCount === 0 && session.exercises[0].sets.every((x) => !x.completedAt) ? '첫 운동 시작' : '이어서 하기',
              icon: 'next',
              onPress: () => router.push({ pathname: '/workout/[exerciseId]', params: { exerciseId: session.exercises[resume].id } }),
            }
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text v="small" color={C.accent}>
            오늘의 운동
          </Text>
          <Text v="h1" numberOfLines={1}>
            {st.routines.find((r) => r.id === session.routineId)?.name ?? '자유 운동'}
          </Text>
        </View>
        <Button small kind="ghost" title="버리기" onPress={() => void discardWorkout()} />
      </Row>

      <Row gap={S.md} style={{ alignItems: 'stretch' }}>
        <Stat label="시간" value={`${Math.floor(elapsed / 60)}분`} />
        <Stat label="운동" value={`${doneCount}/${total}`} />
        <Stat label="볼륨" value={formatWeight(sessionVolume(session), unit)} />
      </Row>

      {total === 0 ? <Empty title="아직 운동이 없어요" body="아래에서 운동을 추가해 주세요." /> : null}

      <View style={{ gap: S.sm }}>
        {session.exercises.map((ex, i) => {
          const def = findExercise(st, ex.exerciseId);
          const done = ex.sets.filter((x) => x.completedAt).length;
          const status = ex.sets.length > 0 && done === ex.sets.length ? 'done' : done > 0 ? 'doing' : 'todo';
          const top = ex.sets.reduce((a, x) => (x.weight > a ? x.weight : a), 0);
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
                  {status === 'done' ? <Icon name={IC.check} size={16} color={C.accentInk} /> : <Text v="h3" dim>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text v="h3" numberOfLines={1} color={status === 'done' ? C.textDim : C.text}>
                    {def?.nameKo ?? '알 수 없는 운동'}
                  </Text>
                  <Text v="small" faint numberOfLines={1}>
                    {done}/{ex.sets.length}세트
                    {top ? ` · 최고 ${formatWeight(top, unit)}` : ''}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: S.md }}>
      <Text v="small" dim>
        {label}
      </Text>
      <Text v="h3" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </Card>
  );
}

function StartSession() {
  const routines = useApp((s) => s.routines).filter((r) => r.status === 'active');
  const start = useApp((s) => s.startSession);
  const begin = (routineId?: string) => {
    void ensurePermission(); // 첫 세션 때 알림 권한 요청 (휴식 타이머용)
    start(routineId);
  };
  return (
    <Screen>
      <Text v="h1">운동 시작</Text>
      <Button title="빈 세션으로 시작" icon={IC.play} onPress={() => begin()} />
      <Section title="루틴으로 시작">
        {routines.length === 0 ? (
          <Empty title="루틴이 없어요" body="루틴 탭에서 만들거나 Claude에게 제안을 받아 보세요." />
        ) : (
          routines.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text v="h3">{r.name}</Text>
                  <Text v="small" dim numberOfLines={1}>
                    {r.items.map((i) => findExercise(useApp.getState(), i.exerciseId)?.nameKo).filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Button small title="시작" onPress={() => begin(r.id)} />
              </Row>
            </Card>
          ))
        )}
      </Section>
    </Screen>
  );
}
