import { Stack } from 'expo-router/stack';

import { C } from '@/ui/theme';

/** 운동 탭: 오늘의 운동 목록 → 운동별 상세 페이지 */
export default function WorkoutStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        contentStyle: { backgroundColor: C.bg },
        headerBackTitle: '오늘의 운동',
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[exerciseId]" options={{ title: '' }} />
    </Stack>
  );
}
