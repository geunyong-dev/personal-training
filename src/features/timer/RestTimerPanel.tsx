import { StyleSheet, View } from 'react-native';

import { LIMITS } from '@/domain/rules';
import { Button, Card, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

import { useRestTimer } from './timer-store';
import { fmtClock, useCountdown } from './use-countdown';

/** 운동 화면 상단의 큰 휴식 타이머: ±15초, 일시정지, 건너뛰기 (5.3) */
export function RestTimerPanel() {
  const { running, paused, leftMs, totalSec } = useCountdown();
  const ctx = useRestTimer((s) => s.context);
  const { adjust, pause, resume, skip } = useRestTimer.getState();
  if (!running) return null;
  const pct = totalSec > 0 ? Math.min(1, leftMs / (totalSec * 1000)) : 0;
  const warn = leftMs <= LIMITS.restWarnBeforeEndSec * 1000;
  return (
    <Card style={{ alignItems: 'center', gap: S.md }}>
      <Text dim>{paused ? '일시정지' : '휴식 중'}</Text>
      <Text v="hero" color={warn ? C.warn : C.text}>
        {fmtClock(leftMs)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: warn ? C.warn : C.accent }]} />
      </View>
      {ctx ? (
        <Text v="small" dim>
          다음: {ctx.exerciseName} · {ctx.nextSetLabel}
        </Text>
      ) : null}
      <Row gap={S.sm}>
        <Button small kind="secondary" icon={IC.minus} title={`${LIMITS.restAdjustSec}초`} onPress={() => void adjust(-LIMITS.restAdjustSec)} />
        <Button small kind="secondary" icon={IC.add} title={`${LIMITS.restAdjustSec}초`} onPress={() => void adjust(LIMITS.restAdjustSec)} />
        <Button
          small
          kind="secondary"
          icon={paused ? IC.play : IC.pause}
          title={paused ? '재개' : '일시정지'}
          onPress={() => void (paused ? resume() : pause())}
        />
        <Button small kind="primary" icon={IC.skip} title="건너뛰기" onPress={() => void skip()} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', height: 6, borderRadius: R.pill, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: R.pill },
});
