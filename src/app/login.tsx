import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { signInWith, type SocialProvider } from '@/lib/supabase';
import { Button, Screen, Text } from '@/ui/kit';
import { C } from '@/ui/theme';

/** 웹 로그인 (OAuth 동의 화면에서 로그인이 안 돼 있을 때 온다). next로 돌아갈 곳을 받는다 */
export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [error, setError] = useState<string | null>(null);
  const go = async (p: SocialProvider) => {
    const res = await signInWith(p, next);
    if (!res.ok) setError(res.error ?? '로그인에 실패했어요');
  };
  return (
    <Screen>
      <Text v="h2">앱과 같은 계정으로 로그인해 주세요</Text>
      <Button title="Apple로 로그인" onPress={() => void go('apple')} />
      <Button kind="secondary" title="Google로 로그인" onPress={() => void go('google')} />
      <Button kind="secondary" title="카카오로 로그인" onPress={() => void go('kakao')} />
      {error ? <Text color={C.danger}>{error}</Text> : null}
    </Screen>
  );
}
