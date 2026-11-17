import { Stack } from 'expo-router/stack';

import { C } from '@/ui/theme';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg }, headerBackTitle: '뒤로' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: '1/2 · 프로필' }} />
      <Stack.Screen name="connect" options={{ title: '2/2 · Claude 연결' }} />
    </Stack>
  );
}
