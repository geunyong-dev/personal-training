import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { planSetCount, WEEKDAY_KO, WEEKDAYS, weekdayOf } from '@/domain/plan';
import { formatWeight } from '@/domain/rules';
import { findExercise, useApp } from '@/store/app-store';
import { Card, Icon, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

/** 1주 단위 운동 계획 (요구사항 3): 요일마다 할 운동을 미리 정해 둔다 */
export default function WeeklyPlanTab() {
  const st = useApp();
  const today = weekdayOf();
  const planned = WEEKDAYS.filter((d) => st.plan.days[d]).length;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Text v="h1">주간 계획</Text>
        <Text dim>
          주 {planned}일 운동 · 요일을 눌러 계획을 짜요
        </Text>
      </View>

      {WEEKDAYS.map((d) => {
        const p = st.plan.days[d];
        const isToday = d === today;
        return (
          <Pressable key={d} onPress={() => router.push({ pathname: '/plan/[day]', params: { day: String(d) } })} accessibilityRole="button">
            <Card style={{ flexDirection: 'row', gap: S.md, borderWidth: 1, borderColor: isToday ? C.accent : 'transparent' }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: R.md,
                  backgroundColor: isToday ? C.accent : p ? C.surface2 : 'transparent',
                  borderWidth: p || isToday ? 0 : 1,
                  borderColor: C.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text v="h3" color={isToday ? C.accentInk : p ? C.text : C.textFaint}>
                  {WEEKDAY_KO[d]}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text v="h3" color={p ? C.text : C.textFaint}>
                    {p ? (p.title ?? `${p.items.length}개 운동`) : '휴식일'}
                    {isToday ? <Text v="small" color={C.accent}>  오늘</Text> : null}
                  </Text>
                  {p?.source === 'claude' ? (
                    <Row gap={4}>
                      <Icon name={IC.sparkles} size={12} color={C.info} />
                      <Text v="small" color={C.info}>
                        Claude
                      </Text>
                    </Row>
                  ) : null}
                </Row>
                {p ? (
                  <>
                    {p.items.slice(0, 4).map((it, i) => (
                      <Text key={`${it.exerciseId}${i}`} v="small" dim numberOfLines={1}>
                        {findExercise(st, it.exerciseId)?.nameKo ?? it.exerciseId} · {it.sets}×{it.reps}
                        {it.weightKg ? ` · ${formatWeight(it.weightKg, st.settings.unit)}` : ''}
                      </Text>
                    ))}
                    {p.items.length > 4 ? (
                      <Text v="small" faint>
                        외 {p.items.length - 4}개
                      </Text>
                    ) : null}
                    <Text v="small" faint>
                      총 {planSetCount(p)}세트
                    </Text>
                  </>
                ) : (
                  <Text v="small" faint>
                    눌러서 계획 추가
                  </Text>
                )}
              </View>
              <Icon name={IC.chevron} size={14} color={C.textFaint} />
            </Card>
          </Pressable>
        );
      })}

      <Text v="small" faint style={{ textAlign: 'center' }}>
        Claude에게 &ldquo;이번 주 운동 계획 짜줘&rdquo;라고 하면 MCP로 이 계획을 직접 써 줘요.
      </Text>
    </Screen>
  );
}
