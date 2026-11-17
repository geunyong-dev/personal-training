import { useEffect, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { LIMITS } from '@/domain/rules';
import { Button, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

import { isTimerRunning, useRestTimer } from './timer-store';
import { fmtClock, useCountdown } from './use-countdown';

const HIDDEN_OFFSET = 900; // 화면 밖으로 충분히

/**
 * 휴식 타이머 바텀시트 (운동 화면)
 * - 세트를 완료해 타이머가 시작되면 올라오고, 타이머가 끝나거나 건너뛰면 내려간다
 * - 아래로 끌거나 손잡이를 누르면 내려간다 (타이머는 계속). 하단 "휴식 타이머" 버튼으로 다시 연다
 */
export function RestTimerSheet({ bottomInset }: { bottomInset: number }) {
  const visible = useRestTimer((s) => s.sheetVisible && isTimerRunning(s));
  const { leftMs, paused, totalSec } = useCountdown();
  const ctx = useRestTimer((s) => s.context);
  const { adjust, pause, resume, skip, hideSheet } = useRestTimer.getState();

  const [y] = useState(() => new Animated.Value(HIDDEN_OFFSET));

  useEffect(() => {
    Animated.spring(y, {
      toValue: visible ? 0 : HIDDEN_OFFSET,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [visible, y]);

  // 아래로 끌어서 닫기
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) useRestTimer.getState().hideSheet();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );

  const pct = totalSec > 0 ? Math.min(1, leftMs / (totalSec * 1000)) : 0;
  const warn = !paused && leftMs <= LIMITS.restWarnBeforeEndSec * 1000;

  return (
    <Animated.View
      style={[styles.sheet, { bottom: bottomInset, transform: [{ translateY: y }] }]}
      // 숨겨진 동안에는 화면 밖에 두고 터치를 받지 않는다 (내려가는 애니메이션을 위해 항상 렌더)
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      {...pan.panHandlers}>
      <Pressable onPress={hideSheet} style={styles.handleArea} accessibilityLabel="휴식 타이머 내리기">
        <View style={styles.handle} />
      </Pressable>

      <Text dim>{paused ? '일시정지' : '휴식 중'}</Text>
      <Text v="hero" color={warn ? C.warn : C.text}>
        {fmtClock(leftMs)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: warn ? C.warn : C.accent }]} />
      </View>
      {ctx ? (
        <Text v="small" dim numberOfLines={1}>
          다음: {ctx.exerciseName} · {ctx.nextSetLabel}
        </Text>
      ) : null}

      <Row gap={S.sm} style={styles.controls}>
        <Button
          style={styles.ctrl}
          kind="secondary"
          icon={IC.minus}
          title={`${LIMITS.restAdjustSec}초`}
          onPress={() => void adjust(-LIMITS.restAdjustSec)}
        />
        <Button
          style={styles.ctrl}
          kind="secondary"
          icon={IC.add}
          title={`${LIMITS.restAdjustSec}초`}
          onPress={() => void adjust(LIMITS.restAdjustSec)}
        />
      </Row>
      <Row gap={S.sm} style={styles.controls}>
        <Button
          style={styles.ctrl}
          kind="secondary"
          icon={paused ? IC.play : IC.pause}
          title={paused ? '재개' : '일시정지'}
          onPress={() => void (paused ? resume() : pause())}
        />
        <Button style={styles.ctrl} icon={IC.skip} title="건너뛰기" onPress={() => void skip()} />
      </Row>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: R.lg + 8,
    borderTopRightRadius: R.lg + 8,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingHorizontal: S.lg,
    paddingBottom: S.lg,
    alignItems: 'center',
    gap: S.sm,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  handleArea: { alignSelf: 'stretch', alignItems: 'center', paddingTop: S.sm, paddingBottom: S.xs },
  handle: { width: 40, height: 5, borderRadius: R.pill, backgroundColor: C.border },
  track: { width: '100%', height: 6, borderRadius: R.pill, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: R.pill },
  controls: { alignSelf: 'stretch' },
  ctrl: { flex: 1 },
});
