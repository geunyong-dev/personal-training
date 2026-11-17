import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { BODY_PART_KO } from '@/data/exercises';
import { overloadWarning, recoveryByBodyPart, sessionVolume, weekStart } from '@/domain/calc';
import { formatWeight } from '@/domain/rules';
import { allExercises, findExercise, selectActiveSession, selectFinishedSessions, useApp } from '@/store/app-store';
import { Button, Card, Empty, Icon, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

export default function Home() {
  const st = useApp();
  const finished = useMemo(() => selectFinishedSessions(st), [st.sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = selectActiveSession(st);
  const proposals = st.routines.filter((r) => r.status === 'proposed');
  const nextRoutine = pickNextRoutine(st.routines.filter((r) => r.status === 'active'), finished);
  const recovery = recoveryByBodyPart(finished, allExercises(st));
  const thisWeek = finished.filter((s) => Date.parse(s.startedAt) >= weekStart(new Date()).getTime());
  const recentPRs = [...st.prs]
    .filter((p) => p.type !== 'volume')
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, 3);

  return (
    <Screen>
      <Text v="h1">안녕하세요, {st.profile?.nickname ?? ''}님</Text>

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

      {proposals.length > 0 ? (
        <Card style={{ borderColor: C.info, borderWidth: 1 }}>
          <Row>
            <Icon name={IC.sparkles} color={C.info} />
            <Text v="h3">Claude 제안 {proposals.length}개가 승인을 기다려요</Text>
          </Row>
          <Button small kind="secondary" title="제안 보기" onPress={() => router.navigate('/routines')} />
        </Card>
      ) : null}

      <Card>
        <Text v="small" dim>
          {active ? '진행 중인 운동' : '오늘의 루틴'}
        </Text>
        <Text v="h2">{active ? '운동 이어서 하기' : (nextRoutine?.name ?? '자유 운동')}</Text>
        {!active && nextRoutine ? (
          <Text v="small" dim numberOfLines={2}>
            {nextRoutine.items.map((i) => findExercise(st, i.exerciseId)?.nameKo).filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <Button
          title={active ? '계속하기' : '시작하기'}
          icon={IC.play}
          onPress={() => {
            if (!active) st.startSession(nextRoutine?.id);
            router.navigate('/workout');
          }}
        />
      </Card>

      <Row gap={S.md}>
        <Stat label="이번 주 운동" value={`${thisWeek.length}회`} sub={`목표 ${st.profile?.weeklyFreq ?? '-'}회`} />
        <Stat label="이번 주 볼륨" value={formatWeight(thisWeek.reduce((a, s) => a + sessionVolume(s), 0), st.settings.unit)} />
      </Row>

      <Section title="부위별 회복도">
        {Object.keys(recovery).length === 0 ? (
          <Empty title="아직 기록이 없어요" body="운동을 기록하면 부위별 회복 상태를 보여 드려요." />
        ) : (
          <Card>
            {Object.entries(recovery)
              .sort((a, b) => a[1] - b[1])
              .map(([part, pct]) => (
                <Row key={part} gap={S.md}>
                  <Text v="small" style={{ width: 64 }}>
                    {BODY_PART_KO[part] ?? part}
                  </Text>
                  <View style={{ flex: 1, height: 8, backgroundColor: C.surface2, borderRadius: R.pill }}>
                    <View
                      style={{
                        width: `${pct}%`,
                        height: 8,
                        borderRadius: R.pill,
                        backgroundColor: pct >= 100 ? C.good : pct >= 50 ? C.accent : C.warn,
                      }}
                    />
                  </View>
                  <Text v="small" dim style={{ width: 40, textAlign: 'right' }}>
                    {pct}%
                  </Text>
                </Row>
              ))}
          </Card>
        )}
      </Section>

      {recentPRs.length > 0 ? (
        <Section title="최근 PR">
          <Card>
            {recentPRs.map((p) => (
              <Row key={`${p.exerciseId}${p.type}`} style={{ justifyContent: 'space-between' }}>
                <Row>
                  <Icon name={IC.trophy} color={C.accent} size={16} />
                  <Text>{findExercise(st, p.exerciseId)?.nameKo}</Text>
                </Row>
                <Text dim>
                  {p.type === 'e1rm' ? '추정 1RM ' : '최고 '}
                  {formatWeight(p.value, st.settings.unit)}
                </Text>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
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

/** 가장 오래 안 한 활성 루틴을 오늘의 루틴으로 */
function pickNextRoutine<R extends { id: string }>(routines: R[], finished: { routineId?: string; startedAt: string }[]) {
  if (routines.length === 0) return undefined;
  const last = (id: string) => finished.find((s) => s.routineId === id)?.startedAt ?? '';
  return [...routines].sort((a, b) => last(a.id).localeCompare(last(b.id)))[0];
}
