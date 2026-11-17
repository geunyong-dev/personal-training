import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestTimerSheet } from '@/features/timer/RestTimerSheet';
import { isTimerRunning, useRestTimer } from '@/features/timer/timer-store';
import { Button } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/**
 * 운동 진행 화면 공통 틀: 스크롤 본문 + 휴식 타이머 바텀시트 + 하단 버튼 2개
 * 왼쪽은 항상 "휴식 타이머", 오른쪽은 화면마다 다르다 (다음 운동 / 운동 완료)
 */
export function WorkoutShell({
  children,
  onRest,
  primary,
  edges = ['top'],
}: {
  children: ReactNode;
  onRest: () => void;
  primary: { title: string; icon: 'next' | 'done'; onPress: () => void };
  edges?: ('top' | 'bottom')[];
}) {
  const [footerH, setFooterH] = useState(88);
  const timerRunning = useRestTimer(isTimerRunning);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, overflow: 'hidden' }} edges={edges}>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: footerH + S.xxl }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <RestTimerSheet bottomInset={footerH} />

      <View
        onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        style={{
          flexDirection: 'row',
          gap: S.sm,
          padding: S.lg,
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.border,
          zIndex: 2,
          elevation: 30,
        }}>
        <Button style={{ flex: 1 }} kind="secondary" icon={IC.timer} title={timerRunning ? '휴식 타이머 보기' : '휴식 타이머'} onPress={onRest} />
        <Button style={{ flex: 1 }} icon={primary.icon === 'done' ? IC.check : IC.chevron} title={primary.title} onPress={primary.onPress} />
      </View>
    </SafeAreaView>
  );
}
