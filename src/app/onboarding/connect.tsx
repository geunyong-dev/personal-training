import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { checkClaudeConnected, MCP_URL } from '@/lib/supabase';
import { useApp } from '@/store/app-store';
import { Button, Card, Row, Screen, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, S } from '@/ui/theme';

const STEPS = [
  'Claude 앱(또는 claude.ai)에서 설정 → 커넥터로 이동',
  '커스텀 커넥터 추가(Add custom connector)를 누르고 아래 주소를 붙여넣기',
  '로그인 창이 뜨면 이 앱과 같은 계정으로 로그인하고 "허용"',
  'Claude에서 "내 최근 운동 기록 보여줘"라고 한 번 물어보기',
  '이 화면으로 돌아와 "연결 확인" 누르기',
];

/** 온보딩 필수 단계: Claude 연결 (7장 결정). MCP 서버가 첫 호출 때 남기는 연결 기록으로 확인한다 */
export default function ConnectClaude() {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const verify = async () => {
    setChecking(true);
    setFailed(false);
    const ok = await checkClaudeConnected();
    setChecking(false);
    if (ok) {
      const st = useApp.getState();
      st.setClaudeConnected(true);
      st.completeOnboarding(); // → 루트 가드가 탭 화면으로 전환
    } else setFailed(true);
  };

  // Claude 앱에 다녀오면 자동으로 한 번 확인
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void verify());
    return () => sub.remove();
  }, []);

  return (
    <Screen edges={['bottom']}>
      <Text v="h2">Claude와 연결해 주세요</Text>
      <Text dim>연결하면 Claude가 내 기록을 보고 루틴을 제안해요. 제안은 앱에서 승인해야 반영되고, Claude는 기존 기록을 고치거나 지울 수 없어요.</Text>

      <Card>
        {STEPS.map((s, i) => (
          <Row key={s} style={{ alignItems: 'flex-start' }} gap={S.md}>
            <Text v="h3" color={C.accent}>{i + 1}</Text>
            <Text style={{ flex: 1 }}>{s}</Text>
          </Row>
        ))}
      </Card>

      <Card>
        <Text v="small" dim>커넥터 주소</Text>
        <Text selectable>{MCP_URL}</Text>
        <Button
          small
          kind="secondary"
          icon={IC.link}
          title={copied ? '복사했어요' : '주소 복사'}
          onPress={async () => {
            await Clipboard.setStringAsync(MCP_URL);
            setCopied(true);
          }}
        />
      </Card>

      <Button kind="secondary" title="Claude 열기" onPress={() => void Linking.openURL('https://claude.ai')} />
      <Button title={checking ? '확인 중…' : '연결 확인'} disabled={checking} onPress={() => void verify()} />
      {failed ? (
        <Text color={C.warn}>아직 연결 기록이 없어요. Claude에서 4번(기록 물어보기)까지 했는지 확인해 주세요.</Text>
      ) : null}
    </Screen>
  );
}
