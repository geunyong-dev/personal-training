import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { LIMITS } from '@/domain/rules';
import { Button, Icon, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

import { useRestTimer } from './timer-store';
import { fmtClock, useCountdown } from './use-countdown';

/** 운동 탭 밖에서도 보이는 작은 휴식 타이머 바 */
export function RestTimerMini() {
  const { running, leftMs } = useCountdown();
  const pathname = usePathname();
  const adjust = useRestTimer((s) => s.adjust);
  const skip = useRestTimer((s) => s.skip);
  if (!running || pathname === '/workout') return null;
  return (
    <Pressable style={styles.bar} onPress={() => router.navigate('/workout')}>
      <Row>
        <Icon name={IC.timer} color={C.accentInk} />
        <Text v="h3" color={C.accentInk} style={{ fontVariant: ['tabular-nums'] }}>
          휴식 {fmtClock(leftMs)}
        </Text>
      </Row>
      <Row>
        <Button small kind="secondary" title={`+${LIMITS.restAdjustSec}초`} onPress={() => void adjust(LIMITS.restAdjustSec)} />
        <Button small kind="secondary" title="건너뛰기" onPress={() => void skip()} />
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: S.md,
    right: S.md,
    bottom: 92,
    backgroundColor: C.accent,
    borderRadius: R.lg,
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
