import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Button, Card, Row, Screen, Text } from '@/ui/kit';
import { C } from '@/ui/theme';

type Details = { client: { name: string }; redirect_uri: string; scope: string };

/**
 * Claude 연결 동의 화면 (웹). Supabase OAuth 2.1 서버가 ?authorization_id=... 로 보낸다.
 * 로그인돼 있지 않으면 /login 으로 보냈다가 다시 돌아온다.
 */
export default function OAuthConsent() {
  const { authorization_id: authId } = useLocalSearchParams<{ authorization_id?: string }>();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!authId) return setError('authorization_id가 없어요');
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        router.replace({ pathname: '/login', params: { next: `/oauth/consent?authorization_id=${authId}` } });
        return;
      }
      const { data, error: e } = await supabase.auth.oauth.getAuthorizationDetails(authId);
      if (e) return setError(e.message);
      if (!('authorization_id' in data)) {
        // 이미 동의한 클라이언트
        globalThis.location.href = data.redirect_url;
        return;
      }
      setDetails(data as unknown as Details);
    })();
  }, [authId]);

  const decide = async (approve: boolean) => {
    if (!authId) return;
    const fn = approve ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error: e } = await fn.call(supabase.auth.oauth, authId);
    if (e) return setError(e.message);
    globalThis.location.href = data.redirect_url;
  };

  if (error) return <Screen><Text color={C.danger}>{error}</Text></Screen>;
  if (!details) return <Screen><Text>불러오는 중…</Text></Screen>;

  return (
    <Screen>
      <Text v="h2">{details.client.name}이(가) 운동 기록에 접근하려고 해요</Text>
      <Card>
        <Text v="h3">허용하면 할 수 있는 일</Text>
        <Text dim>· 프로필 요약(목표·경력·주 횟수·장비), 최근 12주 운동 기록, 루틴, 회복 상태 보기</Text>
        <Text dim>· 루틴을 &lsquo;제안&rsquo;으로 보내기 (앱에서 승인해야 반영돼요)</Text>
        <Text dim>· 세션에 메모 남기기</Text>
        <Text v="h3" style={{ marginTop: 8 }}>할 수 없는 일</Text>
        <Text dim>· 기존 기록 수정·삭제, 실명·이메일·연락처 보기</Text>
      </Card>
      <Text v="small" faint>
        AI 제안은 참고용이며 의료 조언이 아니에요. 연결은 앱 설정에서 언제든 해제할 수 있어요.
      </Text>
      <Row>
        <Button kind="secondary" title="거부" onPress={() => void decide(false)} />
        <Button style={{ flex: 1 }} title="허용" onPress={() => void decide(true)} />
      </Row>
    </Screen>
  );
}
