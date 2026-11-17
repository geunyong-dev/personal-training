import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { completedSetCount, lastSetsFor, sessionVolume } from '@/domain/calc';
import { formatWeight, validateSet } from '@/domain/rules';
import type { Session, SessionExercise } from '@/domain/types';
import { SetHeader, SetRow } from '@/features/session/SetRow';
import { RestTimerPanel } from '@/features/timer/RestTimerPanel';
import { useRestTimer } from '@/features/timer/timer-store';
import { ensurePermission } from '@/features/timer/notify';
import { findExercise, selectActiveSession, selectFinishedSessions, useApp } from '@/store/app-store';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Empty, Field, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

export default function WorkoutTab() {
  const active = useApp(selectActiveSession);
  return active ? <ActiveSession session={active} /> : <StartSession />;
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

function ActiveSession({ session }: { session: Session }) {
  const st = useApp();
  const unit = st.settings.unit;
  const history = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  const onToggle = async (ex: SessionExercise, setId: string) => {
    const cur = useApp.getState().sessions.find((s) => s.id === session.id)?.exercises.find((e) => e.id === ex.id);
    const target = cur?.sets.find((s) => s.id === setId);
    if (!cur || !target) return;
    if (!target.completedAt) {
      const v = validateSet(target.weight, target.reps);
      if (!v.ok && !(await confirm('입력값을 확인해 주세요', `${v.reason}. 그래도 저장할까요?`, '저장'))) return;
    }
    const restSec = useApp.getState().toggleSetComplete(ex.id, setId);
    if (restSec == null || !useApp.getState().settings.autoStartRest) return;

    // 다음 세트 안내: 같은 운동의 다음 미완료 세트, 없으면 다음 운동의 첫 세트
    const s2 = selectActiveSession(useApp.getState());
    const flat = s2?.exercises.flatMap((e) => e.sets.map((x, i) => ({ e, x, i }))) ?? [];
    const next = flat.find(({ x }) => !x.completedAt);
    const def = next ? findExercise(useApp.getState(), next.e.exerciseId) : undefined;
    const nextLabel = next
      ? `${next.i + 1}세트 · ${next.x.weight ? `${formatWeight(next.x.weight, unit)} × ` : ''}${next.x.reps}회`
      : '마지막 세트 완료';
    void useRestTimer.getState().start(
      restSec,
      { exerciseName: def?.nameKo ?? '운동', nextSetLabel: nextLabel },
      { sound: useApp.getState().settings.restSound },
    );
  };

  const finish = async () => {
    const done = completedSetCount(session);
    const ok = await confirm(
      '운동을 마칠까요?',
      done === 0 ? '완료한 세트가 없어서 이 세션은 저장되지 않아요.' : `완료한 세트 ${done}개를 저장해요. 미완료 세트는 빠져요.`,
      '마치기',
    );
    if (!ok) return;
    void useRestTimer.getState().skip();
    const res = st.finishSession('manual');
    if (res.saved) router.push({ pathname: '/session/[id]', params: { id: res.sessionId, fresh: '1' } });
  };

  const discard = async () => {
    if (await confirm('세션을 버릴까요?', '이 세션의 기록이 모두 지워져요.', '버리기', true)) {
      void useRestTimer.getState().skip();
      st.discardActiveSession();
    }
  };

  const mm = Math.floor(elapsed / 60);
  return (
    <Screen
      footer={
        <Row style={{ padding: S.lg, gap: S.sm, backgroundColor: C.bg }}>
          <Button kind="danger" title="버리기" onPress={discard} />
          <Button style={{ flex: 1 }} title="운동 마치기" onPress={finish} />
        </Row>
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="h1">{st.routines.find((r) => r.id === session.routineId)?.name ?? '자유 운동'}</Text>
        <Text dim style={{ fontVariant: ['tabular-nums'] }}>
          {mm}분 · {formatWeight(sessionVolume(session), unit)}
        </Text>
      </Row>

      <RestTimerPanel />

      {session.exercises.map((ex) => {
        const def = findExercise(st, ex.exerciseId);
        const hints = lastSetsFor(ex.exerciseId, history, session.id);
        const bw = def?.type === 'bodyweight';
        return (
          <Card key={ex.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="h3">{def?.nameKo ?? '알 수 없는 운동'}</Text>
              <Button
                small
                kind="ghost"
                icon={IC.trash}
                title=""
                onPress={async () => {
                  if (await confirm('운동 삭제', `${def?.nameKo}을(를) 이 세션에서 뺄까요?`, '삭제', true))
                    st.removeExerciseFromSession(ex.id);
                }}
              />
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
                hint={sameKind[nth] ?? sameKind.at(-1) ?? hints.at(-1)}
                onChange={(patch) => st.updateSet(ex.id, set.id, patch)}
                onToggle={() => void onToggle(ex, set.id)}
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
                if (ex.sets.length >= 30) notice('세트는 운동당 30개까지 기록할 수 있어요');
                else st.addSet(ex.id);
              }}
            />
          </Card>
        );
      })}

      <Button kind="secondary" icon={IC.add} title="운동 추가" onPress={() => router.push({ pathname: '/exercise-picker', params: { for: 'session' } })} />

      <Field
        label="메모"
        placeholder="컨디션, 통증 부위 등 (Claude가 참고해요)"
        defaultValue={session.memo}
        onEndEditing={(e) => st.setSessionMemo(e.nativeEvent.text)}
        multiline
      />
    </Screen>
  );
}
