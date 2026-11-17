import { router, Stack, useLocalSearchParams } from 'expo-router';

import { completedSetCount, sessionDurationSec, sessionVolume } from '@/domain/calc';
import { formatWeight } from '@/domain/rules';
import { findExercise, useApp } from '@/store/app-store';
import { confirm } from '@/ui/confirm';
import { Button, Card, Empty, Icon, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

const KIND_KO = { normal: '', warmup: '웜업', drop: '드롭', failure: '실패' } as const;

export default function SessionDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const st = useApp();
  const s = st.sessions.find((x) => x.id === id);
  if (!s) return <Screen><Empty title="세션을 찾을 수 없어요" /></Screen>;

  const prs = st.prs.filter((p) => p.sessionId === s.id && p.type !== 'volume');
  const unit = st.settings.unit;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: fresh ? '운동 완료!' : new Date(s.startedAt).toLocaleDateString('ko-KR') }} />
      <Row gap={S.md}>
        <Card style={{ flex: 1 }}>
          <Text v="small" dim>시간</Text>
          <Text v="h2">{Math.round(sessionDurationSec(s) / 60)}분</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text v="small" dim>세트</Text>
          <Text v="h2">{completedSetCount(s)}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text v="small" dim>볼륨</Text>
          <Text v="h2">{formatWeight(sessionVolume(s), unit)}</Text>
        </Card>
      </Row>

      {prs.length > 0 ? (
        <Card style={{ borderColor: C.accent, borderWidth: 1 }}>
          <Row>
            <Icon name={IC.trophy} color={C.accent} />
            <Text v="h3">새 기록 {prs.length}개!</Text>
          </Row>
          {prs.map((p) => (
            <Text key={`${p.exerciseId}${p.type}`} dim>
              {findExercise(st, p.exerciseId)?.nameKo} · {p.type === 'e1rm' ? '추정 1RM' : '최고 무게'} {formatWeight(p.value, unit)}
            </Text>
          ))}
        </Card>
      ) : null}

      {s.exercises.map((ex) => (
        <Card key={ex.id}>
          <Text v="h3">{findExercise(st, ex.exerciseId)?.nameKo}</Text>
          {ex.sets.map((x, i) => (
            <Row key={x.id} style={{ justifyContent: 'space-between' }}>
              <Text dim>
                {i + 1}세트 {KIND_KO[x.kind]}
              </Text>
              <Text style={{ fontVariant: ['tabular-nums'] }}>
                {x.weight ? `${formatWeight(x.weight, unit)} × ` : ''}
                {x.reps}회{x.restActualSec ? `  · 휴식 ${x.restActualSec}초` : ''}
              </Text>
            </Row>
          ))}
        </Card>
      ))}

      {s.memo ? (
        <Card>
          <Text v="small" dim>메모</Text>
          <Text>{s.memo}</Text>
        </Card>
      ) : null}

      <Button icon={IC.share} title="공유 카드 만들기" onPress={() => router.push({ pathname: '/share/[id]', params: { id: s.id } })} />
      <Button
        kind="danger"
        icon={IC.trash}
        title="이 기록 삭제"
        onPress={async () => {
          if (await confirm('기록 삭제', '이 운동 기록을 삭제할까요? 되돌릴 수 없어요.', '삭제', true)) {
            st.deleteSession(s.id);
            router.back();
          }
        }}
      />
    </Screen>
  );
}
