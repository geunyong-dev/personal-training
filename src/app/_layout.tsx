import { DarkTheme, ThemeProvider , router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Animated, AppState, Platform, StyleSheet } from 'react-native';

import { Logo } from '@/features/brand/Logo';
import * as Notifications from 'expo-notifications';

import { initNotifications } from '@/features/timer/notify';
import { watchWorkoutNotice } from '@/features/workout-notice/workout-notice';
import { startSyncLoop } from '@/lib/companion';
import { useApp } from '@/store/app-store';
import { C } from '@/ui/theme';

// 네이티브 스플래시는 저장된 데이터를 다 읽을 때까지 유지하고, 이어서 로고 화면을 잠깐 보여 준다 (요구사항 1)
void SplashScreen.preventAutoHideAsync();

const LOGO_MIN_MS = 1200;

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.bg,
    primary: C.accent,
    text: C.text,
    border: C.border,
  },
};

export default function RootLayout() {
  const hydrated = useApp((s) => s.hydrated);

  useEffect(() => {
    void initNotifications();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useApp.getState().runAutoClose();
    });
    const stopSync = startSyncLoop();
    // 진행 중 알림(Android 고정 알림 / iOS Live Activity)을 세션·휴식 타이머에 맞춰 갱신
    const stopNotice = watchWorkoutNotice();
    // 알림을 누르면 해당 화면으로
    const tap =
      Platform.OS === 'web'
        ? { remove: () => {} }
        : Notifications.addNotificationResponseReceivedListener((r) => {
            const url = r.notification.request.content.data?.url;
            if (typeof url === 'string' && url.startsWith('/')) router.navigate(url as never);
          });
    return () => {
      sub.remove();
      stopSync();
      stopNotice();
      tap.remove();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    useApp.getState().runAutoClose();
    void SplashScreen.hideAsync();
  }, [hydrated]);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          contentStyle: { backgroundColor: C.bg },
          headerBackTitle: '뒤로',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="auth"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen name="plan/[day]" options={{ title: '운동 계획' }} />
        <Stack.Screen name="exercise-picker" options={{ title: '운동 선택', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]" options={{ title: '운동 기록' }} />
        <Stack.Screen name="share/[id]" options={{ title: '공유 카드', presentation: 'modal' }} />
      </Stack>
      <LogoSplash ready={hydrated} />
    </ThemeProvider>
  );
}

/** 앱 첫 시작 시 로고를 잠깐 보여 주고 사라지면서 홈으로 */
function LogoSplash({ ready }: { ready: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.92));
  const [gone, setGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
    }).start();
    const t = setTimeout(() => setMinElapsed(true), LOGO_MIN_MS);
    return () => clearTimeout(t);
  }, [scale]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [ready, minElapsed, opacity]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.splash, { opacity }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Logo size={112} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splash: {
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
