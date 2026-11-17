import { Tabs } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { RestTimerMini } from '@/features/timer/RestTimerMini';
import { IC } from '@/ui/icons';
import { C } from '@/ui/theme';

const icon =
  (name: (typeof IC)[keyof typeof IC]) =>
  ({ color }: { color: string | unknown }) => <SymbolView name={name} size={22} tintColor={color as string} />;

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.accent,
          tabBarInactiveTintColor: C.textFaint,
          tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
        }}>
        <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: icon(IC.home) }} />
        <Tabs.Screen name="workout" options={{ title: '운동', tabBarIcon: icon(IC.workout) }} />
        <Tabs.Screen name="history" options={{ title: '기록', tabBarIcon: icon(IC.history) }} />
        <Tabs.Screen name="routines" options={{ title: '루틴', tabBarIcon: icon(IC.routine) }} />
        <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: icon(IC.settings) }} />
      </Tabs>
      <RestTimerMini />
    </View>
  );
}
