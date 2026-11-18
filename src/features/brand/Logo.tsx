import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from '@/ui/kit';
import { C, S } from '@/ui/theme';

export function Logo({ size = 96, withName = true }: { size?: number; withName?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: S.md }}>
      <Image source={require('../../../assets/images/logo.png')} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="운동앱 로고" />
      {withName ? (
        <View style={{ alignItems: 'center' }}>
          <Text v="h2">Personal Training</Text>
          <Text v="small" color={C.accent}>
            기록하면, Claude가 같이 짜 주는 운동
          </Text>
        </View>
      ) : null}
    </View>
  );
}
