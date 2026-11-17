import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { completedSetCount, lastSetsFor, sessionVolume } from '@/domain/calc';
import { formatWeight, resolveRestSec, validateSet } from '@/domain/rules';
import type { Session, SessionExercise } from '@/domain/types';
import { SetHeader, SetRow } from '@/features/session/SetRow';
import { RestTimerSheet } from '@/features/timer/RestTimerSheet';
import { isTimerRunning, useRestTimer } from '@/features/timer/timer-store';
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

/** 다음에 할 세트 안내: 현재 운동의 남은 세트 → 그 뒤 운동 → 앞쪽 운동 순으로 찾는다 */
function nextSetInfo(session: Session | undefined, unit: 'kg' | 'lb', fromIndex = 0) {
  const ex = session?.exercises ?? [];
  const order = [...ex.slice(fromIndex), ...ex.slice(0, fromIndex)];
  const flat = order.flatMap((e) => e.sets.map((x, i) => ({ e, x, i })));
  const next = flat.find(({ x }) => !x.completedAt);
  const def = next ? findExercise(useApp.getState(), next.e.exerciseId) : undefined;
  return {
    exerciseName: def?.nameKo ?? '운동',
    nextSetLabel: next
      ? `${next.i + 1}세트 · ${next.x.weight ? `${formatWeight(next.x.weight, unit)} × ` : ''}${next.x.reps}회`
      : '마지막 세트 완료',
  };
}

function firstUnfinishedIndex(session: Session): number {
  const i = session.exercises.findIndex((e) => e.sets.some((x) => !x.completedAt));
  return i === -1 ? Math.max(0, session.exercises.length - 1) : i;
}

function ActiveSession({ session }: { session: Session }) {
  const st = useApp();
  const unit = st.settings.unit;
  const history = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState(() => firstUnfinishedIndex(session));
  const [footerH, setFooterH] = useState(88);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const cardY = useRef<Record<string, number>>({});
  const timerRunning = useRestTimer(isTimerRunning);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  const count = session.exercises.length;
  const cur = Math.min(current, Math.max(0, count - 1));
  const isLast = count === 0 || cur >= count - 1; // 마지막 운동이면 "운동 완료"

  const focus = (i: number) => {
    setCurrent(i);
    const ex = session.exercises[i];
    const y = ex ? cardY.current[ex.id] : undefined;
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const onToggle = async (exIndex: number, ex: SessionExercise, setId: string) => {
    const curEx = useApp.getState().sessions.find((s) => s.id === session.id)?.exercises.find((e) => e.id === ex.id);
    const target = curEx?.sets.find((s) => s.id === setId);
    if (!curEx || !target) return;
    if (!target.completedAt) {
      const v = validateSet(target.weight, target.reps);
      if (!v.ok && !(await confirm('입력값을 확인해 주세요', `${v.reason}. 그래도 저장할까요?`, '저장'))) return;
    }
    setCurrent(exIndex);
    const restSec = useApp.getState().toggleSetComplete(ex.id, setId);
    if (restSec == null || !useApp.getState().settings.autoStartRest) return;
    // 세트 완료 → 타이머 시작 → 바텀시트가 올라온다
    void useRestTimer
      .getState()
      .start(restSec, nextSetInfo(selectActiveSession(useApp.getState()), unit, exIndex), { sound: useApp.getState().settings.restSound });
  };

  /** 하단 "휴식 타이머": 진행 중이면 시트를 다시 열고, 아니면 현재 운동 기준 휴식을 바로 시작 */
  const openRest = () => {
    const timer = useRestTimer.getState();
    if (isTimerRunning(timer)) return timer.showSheet();
    const ex = session.exercises[cur];
    const def = ex ? findExercise(st, ex.exerciseId) : undefined;
    void timer.start(resolveRestSec(def?.defaultRestSec, ex?.restSec, st.settings), nextSetInfo(session, unit, cur), {
      sound: st.settings.restSound,
    });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, overflow: 'hidden' }} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: footerH + S.xxl }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text v="h1" numberOfLines={1}>
              {st.routines.find((r) => r.id === session.routineId)?.name ?? '자유 운동'}
            </Text>
            <Text dim style={{ fontVariant: ['tabular-nums'] }}>
              {mm}분 · {formatWeight(sessionVolume(session), unit)} · {count > 0 ? `${cur + 1}/${count} 운동` : '운동 없음'}
            </Text>
          </View>
          <Button small kind="ghost" title="버리기" onPress={discard} />
        </Row>

        {session.exercises.map((ex, exIndex) => {
          const def = findExercise(st, ex.exerciseId);
          const hints = lastSetsFor(ex.exerciseId, history, session.id);
          const bw = def?.type === 'bodyweight';
          const isCur = exIndex === cur;
          return (
            <View key={ex.id} onLayout={(e) => (cardY.current[ex.id] = e.nativeEvent.layout.y)}>
              <Card style={isCur ? { borderWidth: 1.5, borderColor: C.accent } : { borderWidth: 1.5, borderColor: 'transparent' }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Pressable style={{ flex: 1 }} onPress={() => setCurrent(exIndex)}>
                    <Text v="h3">{def?.nameKo ?? '알 수 없는 운동'}</Text>
                    <Text v="small" faint>
                      {ex.sets.filter((x) => x.completedAt).length}/{ex.sets.length} 세트
                    </Text>
                  </Pressable>
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
                      onToggle={() => void onToggle(exIndex, ex, set.id)}
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
            </View>
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
      </ScrollView>

      <RestTimerSheet bottomInset={footerH} />

      <View
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        style={{ flexDirection: 'row', gap: S.sm, padding: S.lg, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, zIndex: 2, elevation: 30 }}>
        <Button
          style={{ flex: 1 }}
          kind="secondary"
          icon={IC.timer}
          title={timerRunning ? '휴식 타이머 보기' : '휴식 타이머'}
          onPress={openRest}
        />
        {isLast ? (
          <Button style={{ flex: 1 }} icon={IC.check} title="운동 완료" onPress={finish} />
        ) : (
          <Button style={{ flex: 1 }} icon={IC.chevron} title="다음 운동" onPress={() => focus(cur + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}
