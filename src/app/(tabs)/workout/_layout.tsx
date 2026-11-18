import { Stack } from 'expo-router/stack';

import { C } from '@/ui/theme';

// 홈에서 바로 운동 상세로 들어가도 뒤로 가기는 오늘의 운동 목록이 되도록
export const unstable_settings = { initialRouteName: 'index' };

/** 운동 탭: 오늘의 운동 목록 → 운동별 상세 페이지 */
export default function WorkoutStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerBackTitle: '목록',
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: '오늘의 운동' }} />
      <Stack.Screen name="[exerciseId]" options={{ title: '' }} />
    </Stack>
  );
}
