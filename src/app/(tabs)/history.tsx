import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { completedSetCount, sessionDurationSec, sessionVolume, weekStart } from '@/domain/calc';
import { formatWeight } from '@/domain/rules';
import { findExercise, selectFinishedSessions, useApp } from '@/store/app-store';
import { Card, Empty, Icon, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

const DOW = ['월', '화', '수', '목', '금', '토', '일'];

export default function History() {
  const st = useApp();
  const finished = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const daysWithWorkout = new Set(finished.map((s) => new Date(s.startedAt).toDateString()));
  const weeks = weeklyVolumes(finished, 8);
  const maxVol = Math.max(1, ...weeks.map((w) => w.vol));

  return (
    <Screen>
      <Text v="h1">기록</Text>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <Text v="h3">‹</Text>
          </Pressable>
          <Text v="h3">
            {month.getFullYear()}년 {month.getMonth() + 1}월
          </Text>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <Text v="h3">›</Text>
          </Pressable>
        </Row>
        <Calendar month={month} marked={daysWithWorkout} />
      </Card>

      <Section title="주간 볼륨 (최근 8주)">
        <Card>
          <Row style={{ alignItems: 'flex-end', height: 120, gap: S.sm }}>
            {weeks.map((w) => (
              <View key={w.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(2, (w.vol / maxVol) * 96),
                    backgroundColor: w.current ? C.accent : C.surface2,
                    borderRadius: R.sm,
                  }}
                />
                <Text v="small" faint>
                  {w.label}
                </Text>
              </View>
            ))}
          </Row>
          <Text v="small" dim>
            이번 주 {formatWeight(weeks.at(-1)?.vol ?? 0, st.settings.unit)}
          </Text>
        </Card>
      </Section>

      <Section title="지난 운동">
        {finished.length === 0 ? (
          <Empty title="아직 기록이 없어요" body="운동 탭에서 첫 세션을 시작해 보세요." />
        ) : (
          finished.map((s) => (
            <Pressable key={s.id} onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text v="h3">
                    {new Date(s.startedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                  </Text>
                  <Icon name={IC.chevron} color={C.textFaint} size={14} />
                </Row>
                <Text v="small" dim numberOfLines={1}>
                  {s.exercises.map((e) => findExercise(st, e.exerciseId)?.nameKo).join(' · ')}
                </Text>
                <Text v="small" faint>
                  {Math.round(sessionDurationSec(s) / 60)}분 · {completedSetCount(s)}세트 · {formatWeight(sessionVolume(s), st.settings.unit)}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </Section>
    </Screen>
  );
}

function Calendar({ month, marked }: { month: Date; marked: Set<string> }) {
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date().toDateString();
  return (
    <View>
      <Row>
        {DOW.map((d) => (
          <Text key={d} v="small" faint style={{ flex: 1, textAlign: 'center' }}>
            {d}
          </Text>
        ))}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: S.xs }}>
        {cells.map((d, i) => {
          const key = d ? new Date(month.getFullYear(), month.getMonth(), d).toDateString() : `e${i}`;
          const on = d != null && marked.has(key);
          return (
            <View key={key} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? C.accent : 'transparent',
                  borderWidth: key === today ? 1 : 0,
                  borderColor: C.textDim,
                }}>
                <Text v="small" color={on ? C.accentInk : d ? C.text : 'transparent'}>
                  {d ?? ''}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function weeklyVolumes(sessions: Parameters<typeof sessionVolume>[0][], n: number) {
  const start = weekStart(new Date()).getTime();
  const week = 7 * 86400e3;
  return Array.from({ length: n }, (_, i) => {
    const from = start - (n - 1 - i) * week;
    const vol = sessions
      .filter((s) => {
        const t = Date.parse(s.startedAt);
        return t >= from && t < from + week;
      })
      .reduce((a, s) => a + sessionVolume(s), 0);
    const d = new Date(from);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, vol, current: i === n - 1 };
  });
}
