import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { BODY_PART_KO } from '@/data/exercises';
import { parseWeekday, planSetCount, validatePlanItem, WEEKDAY_KO, weekdayOf } from '@/domain/plan';
import { fromKg, toKg } from '@/domain/rules';
import { startTodayWorkout } from '@/features/session/workout-actions';
import { findExercise, useApp } from '@/store/app-store';
import { usePlanDraft } from '@/store/plan-draft';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Empty, Field, Icon, Row, Screen, Stepper, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/**
 * 운동 계획 페이지 (요구사항 5)
 * 운동을 고르고 몇 세트·몇 회·몇 kg으로 할지 정한다.
 * start=1 로 들어오면(홈에서 오늘 계획이 없을 때) 저장과 동시에 오늘의 운동을 시작한다 (요구사항 6)
 */
export default function PlanDay() {
  const params = useLocalSearchParams<{ day: string; start?: string }>();
  const day = parseWeekday(params.day) ?? weekdayOf();
  const startAfter = params.start === '1';
  const saved = useApp((s) => s.plan.days[day]);
  const unit = useApp((s) => s.settings.unit);
  const setDayPlan = useApp((s) => s.setDayPlan);
  const draft = usePlanDraft();
  const isToday = day === weekdayOf();

  useEffect(() => {
    usePlanDraft.getState().load(day, saved?.title ?? '', saved?.items ?? []);
    // 페이지에 들어올 때 한 번만 저장본을 불러온다
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const bad = draft.items.map(validatePlanItem).find(Boolean);
    if (bad) return notice('입력값을 확인해 주세요', bad);
    setDayPlan(day, draft.items.length ? { title: draft.title.trim() || undefined, items: draft.items } : null);
    if (startAfter && draft.items.length) {
      router.back();
      startTodayWorkout(day);
    } else router.back();
  };

  const clear = async () => {
    if (await confirm(`${WEEKDAY_KO[day]}요일 계획 비우기`, '이 요일을 휴식일로 둘까요?', '비우기', true)) {
      setDayPlan(day, null);
      router.back();
    }
  };

  return (
    <Screen
      edges={['bottom']}
      footer={
        <View style={{ padding: S.lg, gap: S.sm, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg }}>
          <Button
            icon={startAfter ? IC.play : IC.check}
            title={startAfter ? '계획 완료 · 오늘의 운동 시작' : '계획 저장'}
            disabled={startAfter && draft.items.length === 0}
            onPress={save}
          />
        </View>
      }>
      <Stack.Screen options={{ title: `${WEEKDAY_KO[day]}요일 계획${isToday ? ' (오늘)' : ''}` }} />

      {saved?.source === 'claude' ? (
        <Card style={{ borderColor: C.info, borderWidth: 1 }}>
          <Row>
            <Icon name={IC.sparkles} color={C.info} size={16} />
            <Text v="small">Claude가 만든 계획이에요{saved.note ? ` · ${saved.note}` : ''}</Text>
          </Row>
        </Card>
      ) : null}

      <Field label="계획 이름 (선택)" placeholder="예: 가슴·삼두" value={draft.title} onChangeText={draft.setTitle} maxLength={20} />

      {draft.items.length === 0 ? (
        <Empty title="운동을 추가해 주세요" body="아래 '운동 추가'에서 오늘 할 운동을 고르고 세트·횟수·무게를 정해요." />
      ) : (
        draft.items.map((it, i) => {
          const def = findExercise(useApp.getState(), it.exerciseId);
          const bw = def?.type === 'bodyweight';
          return (
            <Card key={`${it.exerciseId}-${i}`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text v="h3">
                    {i + 1}. {def?.nameKo ?? it.exerciseId}
                  </Text>
                  <Text v="small" faint>
                    {def?.bodyParts.map((b) => BODY_PART_KO[b]).join(' · ')}
                  </Text>
                </View>
                <Button small kind="ghost" title="↑" onPress={() => draft.move(i, -1)} />
                <Button small kind="ghost" title="↓" onPress={() => draft.move(i, 1)} />
                <Button small kind="ghost" icon={IC.trash} title="" onPress={() => draft.remove(i)} />
              </Row>
              <Row gap={S.sm}>
                <Stepper label="세트" value={it.sets} step={1} min={1} max={30} onChange={(v) => draft.update(i, { sets: Math.round(v) })} />
                <Stepper label="횟수" value={it.reps} step={1} min={1} max={100} onChange={(v) => draft.update(i, { reps: Math.round(v) })} />
                {!bw ? (
                  <Stepper
                    label={`무게(${unit})`}
                    value={Math.round(fromKg(it.weightKg ?? 0, unit) * 100) / 100}
                    step={unit === 'kg' ? 2.5 : 5}
                    min={0}
                    max={unit === 'kg' ? 500 : 1100}
                    onChange={(v) => draft.update(i, { weightKg: Math.round(toKg(v, unit) * 4) / 4 })}
                  />
                ) : null}
              </Row>
            </Card>
          );
        })
      )}

      <Button kind="secondary" icon={IC.add} title="운동 추가" onPress={() => router.push({ pathname: '/exercise-picker', params: { for: 'plan' } })} />

      {draft.items.length > 0 ? (
        <Text v="small" dim style={{ textAlign: 'center' }}>
          {draft.items.length}개 운동 · 총 {planSetCount({ items: draft.items, source: 'user', updatedAt: '' })}세트
        </Text>
      ) : null}

      {saved && !startAfter ? <Button kind="ghost" title="이 요일 비우기 (휴식일)" onPress={clear} /> : null}
    </Screen>
  );
}
