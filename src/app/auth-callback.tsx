import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { Screen, Text } from '@/ui/kit';

/** 웹 소셜 로그인 복귀 지점. supabase-js가 URL의 code를 세션으로 바꾼 뒤 next로 보낸다 */
export default function AuthCallback() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  useEffect(() => {
    const go = () => router.replace((next && next.startsWith('/') ? next : '/') as never);
    void supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data } = supabase.auth.onAuthStateChange((e) => e === 'SIGNED_IN' && go());
    return () => data.subscription.unsubscribe();
  }, [next]);
  return (
    <Screen>
      <Text>로그인 중…</Text>
    </Screen>
  );
}
