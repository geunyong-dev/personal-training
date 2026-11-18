import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { validateNickname } from '@/domain/rules';
import { Logo } from '@/features/brand/Logo';
import { useApp } from '@/store/app-store';
import { Button, Card, Field, Icon, Row, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

/**
 * 기기 인증 (목업, 요구사항 2)
 * 서버 없이 이 기기에 사용자 ID를 만들어 저장한다. 한 번 인증하면 다시 묻지 않는다.
 */
export default function AuthScreen() {
  const user = useApp((s) => s.user);
  const authenticate = useApp((s) => s.authenticate);
  const [nickname, setNickname] = useState('');
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeSafety, setAgreeSafety] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user && !busy) return <Redirect href="/" />;

  const submit = () => {
    const err = validateNickname(nickname);
    if (err) return setError(err);
    setBusy(true);
    // 목업: 실제 인증 서버 대신 잠깐 기다린 뒤 기기 ID 발급
    setTimeout(() => {
      authenticate(nickname);
      router.replace('/');
    }, 700);
  };

  const ready = agreeAge && agreeSafety && nickname.trim().length > 0 && !busy;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: S.lg, gap: S.lg, justifyContent: 'center' }}>
        <Logo size={72} />
        <Card>
          <Text v="h3">이 기기로 시작하기</Text>
          <Text v="small" dim>
            계정 없이 이 기기에 기록이 저장돼요. 한 번 인증하면 다시 묻지 않아요.
          </Text>
          <Field
            label="닉네임 (2~12자, 한글·영문·숫자·_)"
            value={nickname}
            onChangeText={(t) => {
              setNickname(t);
              setError(null);
            }}
            maxLength={12}
            autoFocus
          />
          {error ? <Text color={C.danger}>{error}</Text> : null}
        </Card>
        <Card>
          <Check checked={agreeAge} onPress={() => setAgreeAge(!agreeAge)} label="만 14세 이상이에요" />
          <Check
            checked={agreeSafety}
            onPress={() => setAgreeSafety(!agreeSafety)}
            label="질환·부상이 있다면 운동 전 전문가와 상담할게요. 앱과 Claude의 제안은 참고용이에요."
          />
        </Card>
        <Button title={busy ? '인증 중…' : '인증하고 시작하기'} disabled={!ready} onPress={submit} />
        {busy ? <ActivityIndicator color={C.accent} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
