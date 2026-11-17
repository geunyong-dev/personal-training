import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { currentUserId, signInWith, supabase, type SocialProvider } from '@/lib/supabase';
import { Button, Card, Icon, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/** 시작 화면: 서비스 소개 → 14세 이상·안전 고지 확인 → 소셜 로그인 (5.1, 5.8) */
export default function Welcome() {
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 이미 로그인돼 있으면 바로 프로필 단계로
    void currentUserId().then((uid) => uid && router.replace('/onboarding/profile'));
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === 'SIGNED_IN') router.replace('/onboarding/profile');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const login = async (p: SocialProvider) => {
    setError(null);
    const res = await signInWith(p);
    if (!res.ok) setError(res.error ?? '로그인에 실패했어요');
  };

  const ready = agreeAge && agreeSafety;
  return (
    <Screen>
      <View style={{ gap: S.sm, marginTop: S.xxl }}>
        <Text v="h1">기록하면, Claude가{'\n'}다음 운동을 같이 짜 줘요</Text>
        <Text dim>세트를 기록하고, 휴식은 잠금화면 타이머로 보고, 루틴은 Claude와 함께 관리하세요.</Text>
      </View>

      <Card>
        <Check checked={agreeAge} onPress={() => setAgreeAge(!agreeAge)} label="만 14세 이상이에요" />
        <Check
          checked={agreeSafety}
          onPress={() => setAgreeSafety(!agreeSafety)}
          label="질환·부상이 있다면 운동 전 전문가와 상담할게요. 앱과 Claude의 제안은 참고용이며 의료 조언이 아니에요."
        />
      </Card>

      <View style={{ gap: S.sm }}>
        <Button title="Apple로 계속하기" disabled={!ready} onPress={() => void login('apple')} />
        <Button kind="secondary" title="Google로 계속하기" disabled={!ready} onPress={() => void login('google')} />
        <Button kind="secondary" title="카카오로 계속하기" disabled={!ready} onPress={() => void login('kakao')} />
      </View>
      {error ? <Text color={C.danger}>{error}</Text> : null}
      <Text v="small" faint>
        이 앱은 Claude 사용자를 위한 앱이에요. 다음 단계에서 Claude 연결이 필요해요.
      </Text>
    </Screen>
  );
}

function Check({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Row style={{ alignItems: 'flex-start' }} gap={S.md}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: checked ? C.accent : C.textFaint,
            backgroundColor: checked ? C.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {checked ? <Icon name={IC.check} size={14} color={C.accentInk} /> : null}
        </View>
        <Text style={{ flex: 1 }}>{label}</Text>
      </Row>
    </Pressable>
  );
}
