import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { overloadWarning, sessionVolume, weekStart } from '@/domain/calc';
import { planSetCount, WEEKDAY_KO, WEEKDAYS, weekdayOf } from '@/domain/plan';
import { formatWeight } from '@/domain/rules';
import { startTodayWorkout } from '@/features/session/workout-actions';
import { findExercise, selectActiveSession, selectFinishedSessions, useApp } from '@/store/app-store';
import { Card, Icon, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

export default function Home() {
  const st = useApp();
  const finished = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // 인증하지 않은 기기는 인증 페이지로 (요구사항 2)
  if (!st.hydrated) return null;
  if (!st.user) return <Redirect href="/auth" />;

  const today = weekdayOf();
  const todayPlan = st.plan.days[today];
  const active = selectActiveSession(st);
  const weekFrom = weekStart(new Date()).getTime();
  const thisWeek = finished.filter((s) => Date.parse(s.startedAt) >= weekFrom);
  const doneDays = new Set(thisWeek.map((s) => weekdayOf(new Date(s.startedAt))));

  /**
   * 홈 중앙 버튼 (요구사항 4)
   * - 진행 중인 운동이 있으면 이어서
   * - 오늘 계획이 있으면 그 계획으로 바로 시작
   * - 없으면 오늘 운동을 계획하는 페이지로
   */
  const onStart = () => {
    if (active) return router.navigate('/workout');
    if (todayPlan) return void startTodayWorkout(today);
    router.push({ pathname: '/plan/[day]', params: { day: String(today), start: '1' } });
  };

  const label = active ? '운동 이어서 하기' : todayPlan ? '오늘의 운동 시작' : '오늘의 운동 계획하기';
  const sub = active
    ? '진행 중인 운동이 있어요'
    : todayPlan
      ? `${todayPlan.title ?? `${todayPlan.items.length}개 운동`} · ${planSetCount(todayPlan)}세트`
      : '오늘은 계획이 없어요. 할 운동을 정해 볼까요?';

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text v="small" dim>
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
          </Text>
          <Text v="h1">{st.user.nickname}님, 오늘도 화이팅</Text>
        </View>
      </Row>

      {/* 이번 주 요일 띠: 계획 있음·완료 표시 */}
      <Row style={{ justifyContent: 'space-between' }}>
        {WEEKDAYS.map((d) => {
          const isToday = d === today;
          const done = doneDays.has(d);
          const planned = !!st.plan.days[d];
          return (
            <Pressable key={d} onPress={() => router.push({ pathname: '/plan/[day]', params: { day: String(d) } })} style={{ alignItems: 'center', gap: 4 }}>
              <Text v="small" color={isToday ? C.accent : C.textDim}>
                {WEEKDAY_KO[d]}
              </Text>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: R.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? C.accent : planned ? C.surface2 : 'transparent',
                  borderWidth: isToday ? 2 : 1,
                  borderColor: isToday ? C.accent : C.border,
                }}>
                {done ? <Icon name={IC.check} size={16} color={C.accentInk} /> : planned ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.textDim }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Row>

      {/* 중앙: 오늘의 운동 시작 */}
      <View style={{ alignItems: 'center', paddingVertical: S.xl, gap: S.lg }}>
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => ({
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: C.accent,
            alignItems: 'center',
            justifyContent: 'center',
            gap: S.sm,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            shadowColor: C.accent,
            shadowOpacity: 0.35,
            shadowRadius: 30,
            elevation: 12,
          })}>
          <Icon name={active ? IC.play : todayPlan ? IC.workout : IC.add} size={40} color={C.accentInk} />
          <Text v="h2" color={C.accentInk} style={{ textAlign: 'center', paddingHorizontal: S.lg }}>
            {label}
          </Text>
        </Pressable>
        <Text dim style={{ textAlign: 'center' }}>
          {sub}
        </Text>
      </View>

      {todayPlan && !active ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="h3">오늘의 계획 · {WEEKDAY_KO[today]}요일</Text>
            <Pressable onPress={() => router.push({ pathname: '/plan/[day]', params: { day: String(today) } })}>
              <Text v="small" color={C.accent}>
                수정
              </Text>
            </Pressable>
          </Row>
          {todayPlan.items.map((it, i) => (
            <Row key={`${it.exerciseId}${i}`} style={{ justifyContent: 'space-between' }}>
              <Text>
                {i + 1}. {findExercise(st, it.exerciseId)?.nameKo ?? it.exerciseId}
              </Text>
              <Text dim style={{ fontVariant: ['tabular-nums'] }}>
                {it.sets}×{it.reps}
                {it.weightKg ? ` · ${formatWeight(it.weightKg, st.settings.unit)}` : ''}
              </Text>
            </Row>
          ))}
        </Card>
      ) : null}

      {overloadWarning(finished) ? (
        <Card style={{ borderColor: C.warn, borderWidth: 1 }}>
          <Text v="h3" color={C.warn}>
            이번 주 볼륨이 평소보다 30% 이상 많아요
          </Text>
          <Text v="small" dim>
            무리하지 말고 회복 상태를 확인하세요. 통증이 있으면 전문가와 상담하세요.
          </Text>
        </Card>
      ) : null}

      <Row gap={S.md} style={{ alignItems: 'stretch' }}>
        <Stat label="이번 주 운동" value={`${thisWeek.length}회`} sub={`계획 ${WEEKDAYS.filter((d) => st.plan.days[d]).length}일`} />
        <Stat label="이번 주 볼륨" value={formatWeight(thisWeek.reduce((a, s) => a + sessionVolume(s), 0), st.settings.unit)} />
      </Row>
    </Screen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flex: 1 }}>
      <Text v="small" dim>
        {label}
      </Text>
      <Text v="h2">{value}</Text>
      {sub ? (
        <Text v="small" faint>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}
