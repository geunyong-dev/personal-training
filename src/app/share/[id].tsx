import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Switch, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { completedSetCount, sessionDurationSec, sessionVolume } from '@/domain/calc';
import { formatWeight } from '@/domain/rules';
import { findExercise, useApp } from '@/store/app-store';
import { notice } from '@/ui/confirm';
import { Button, Card, Empty, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

/**
 * 오늘 운동 공유 카드 (정의서 5.4)
 * - 이미지로 기기에서 만들고 서버에 저장하지 않는다
 * - 기본 포함: 날짜, 운동명, 세트·무게·횟수, 총 볼륨, 운동 시간, PR / 메모는 켜야 포함
 * - 광고 없음, 앱 이름 워터마크만 (5.6)
 */
export default function ShareCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const st = useApp();
  const s = st.sessions.find((x) => x.id === id);
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [withMemo, setWithMemo] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!s) return <Screen><Empty title="세션을 찾을 수 없어요" /></Screen>;

  const unit = st.settings.unit;
  const prs = st.prs.filter((p) => p.sessionId === s.id && p.type === 'max_weight');
  const prIds = new Set(prs.map((p) => p.exerciseId));

  const share = async () => {
    if (Platform.OS === 'web') return notice('공유 카드는 모바일 앱에서 만들 수 있어요');
    setBusy(true);
    try {
      const uri = await captureRef(ref as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '오늘 운동 공유' });
    } catch {
      notice('이미지를 만들지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <View ref={ref} collapsable={false} style={{ backgroundColor: C.bg, borderRadius: R.lg, padding: S.xl, gap: S.md, borderWidth: 1, borderColor: C.border }}>
        <Text v="small" color={C.accent}>
          {new Date(s.startedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
        </Text>
        <Text v="h1">{st.routines.find((r) => r.id === s.routineId)?.name ?? '오늘의 운동'}</Text>
        <Row gap={S.lg} style={{ alignItems: 'flex-start' }}>
          <Metric label="시간" value={`${Math.round(sessionDurationSec(s) / 60)}분`} />
          <Metric label="세트" value={String(completedSetCount(s))} />
          <Metric label="볼륨" value={formatWeight(sessionVolume(s), unit)} />
        </Row>
        <View style={{ height: 1, backgroundColor: C.border }} />
        {s.exercises.map((ex) => {
          const work = ex.sets.filter((x) => x.kind !== 'warmup');
          const best = work.reduce((a, x) => (x.weight > a.weight ? x : a), work[0] ?? ex.sets[0]);
          return (
            <Row key={ex.id} style={{ justifyContent: 'space-between' }}>
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {findExercise(st, ex.exerciseId)?.nameKo}
                {prIds.has(ex.exerciseId) ? <Text color={C.accent}>  PR</Text> : null}
              </Text>
              <Text dim style={{ fontVariant: ['tabular-nums'] }}>
                {ex.sets.length}세트 · {best?.weight ? `${formatWeight(best.weight, unit)} × ` : ''}
                {best?.reps}
              </Text>
            </Row>
          );
        })}
        {withMemo && s.memo ? (
          <Text v="small" dim>
            {s.memo}
          </Text>
        ) : null}
        <Text v="small" faint style={{ textAlign: 'right', marginTop: S.sm }}>
          운동앱 × Claude
        </Text>
      </View>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text>메모 포함</Text>
          <Switch value={withMemo} onValueChange={setWithMemo} trackColor={{ true: C.accent, false: C.surface2 }} thumbColor="#ffffff" />
        </Row>
        <Text v="small" faint>
          체중·키 같은 신체 정보는 공유 카드에 들어가지 않아요.
        </Text>
      </Card>
      <Button icon={IC.share} title={busy ? '만드는 중…' : '이미지로 공유'} disabled={busy} onPress={() => void share()} />
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text v="small" dim>
        {label}
      </Text>
      <Text v="h2">{value}</Text>
    </View>
  );
}
