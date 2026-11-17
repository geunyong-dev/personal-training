import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { initNotifications } from '@/features/timer/notify';
import { startSyncLoop } from '@/lib/sync';
import { useApp } from '@/store/app-store';
import { C } from '@/ui/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent, text: C.text, border: C.border },
};

export default function RootLayout() {
  const onboarded = useApp((s) => s.onboarded);
  const claudeConnected = useApp((s) => s.claudeConnected);
  const ready = onboarded && claudeConnected; // 온보딩 + Claude 연결이 끝나야 앱 진입 (7장 결정)

  useEffect(() => {
    void initNotifications();
    useApp.getState().runAutoClose();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useApp.getState().runAutoClose();
    });
    const stopSync = startSyncLoop();
    return () => {
      sub.remove();
      stopSync();
    };
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[id]" options={{ title: '운동 기록' }} />
          <Stack.Screen name="routine/[id]" options={{ title: '루틴' }} />
          <Stack.Screen name="exercise-picker" options={{ title: '운동 추가', presentation: 'modal' }} />
          <Stack.Screen name="share/[id]" options={{ title: '공유 카드', presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!ready}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* 웹 전용: Claude 연결 OAuth 동의 화면 (Supabase OAuth 2.1 서버가 리다이렉트) */}
        <Stack.Screen name="oauth/consent" options={{ title: 'Claude 연결 승인' }} />
        <Stack.Screen name="login" options={{ title: '로그인' }} />
      </Stack>
    </ThemeProvider>
  );
}
