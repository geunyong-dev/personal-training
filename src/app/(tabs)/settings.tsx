import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Switch } from 'react-native';

import { exportCsv } from '@/lib/export';
import { fetchMcpAudit, listOAuthGrants, MCP_URL, revokeOAuthGrant, signOut, type McpAuditRow } from '@/lib/supabase';
import { useApp } from '@/store/app-store';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Chip, Row, Screen, Section, Text } from '@/ui/kit';
import { C } from '@/ui/theme';

const REST_OPTIONS = [60, 90, 120, 150, 180];

export default function Settings() {
  const st = useApp();
  const [audit, setAudit] = useState<McpAuditRow[]>([]);
  const [grants, setGrants] = useState<Awaited<ReturnType<typeof listOAuthGrants>>>([]);

  const load = () => {
    void fetchMcpAudit(10).then(setAudit);
    void listOAuthGrants().then(setGrants);
  };
  useEffect(load, []);

  return (
    <Screen>
      <Text v="h1">설정</Text>

      <Section title="프로필">
        <Card>
          <Text v="h3">{st.profile?.nickname}</Text>
          <Text v="small" dim>
            주 {st.profile?.weeklyFreq}회 · {goalKo(st.profile?.goal)}
          </Text>
          <Button small kind="secondary" title="프로필·목표 수정" onPress={() => router.push('/profile')} />
        </Card>
      </Section>

      <Section title="Claude 연결">
        <Card>
          <Text v="small" dim>
            MCP 서버 주소
          </Text>
          <Text selectable>{MCP_URL}</Text>
          <Text v="small" dim>
            Claude가 최근 조회한 기록 (최근 10건)
          </Text>
          {audit.length === 0 ? (
            <Text v="small" faint>
              아직 호출 기록이 없어요
            </Text>
          ) : (
            audit.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <Text v="small">{a.tool}</Text>
                <Text v="small" faint>
                  {new Date(a.called_at).toLocaleString('ko-KR')} · {a.ok ? '성공' : '실패'}
                </Text>
              </Row>
            ))
          )}
          {grants.map((g) => (
            <Row key={g.client.id} style={{ justifyContent: 'space-between' }}>
              <Text>{g.client.name}</Text>
              <Button
                small
                kind="danger"
                title="연결 해제"
                onPress={async () => {
                  if (!(await confirm('연결 해제', `${g.client.name}의 접근 권한을 회수할까요? 기록과 열람은 계속 쓸 수 있어요.`, '해제', true))) return;
                  if (await revokeOAuthGrant(g.client.id)) {
                    st.setClaudeConnected(false);
                    load();
                  } else notice('해제에 실패했어요');
                }}
              />
            </Row>
          ))}
          {grants.length === 0 ? (
            <Text v="small" faint>
              연결된 Claude가 없어요. 커넥터 주소를 Claude에 추가하면 다시 연결돼요.
            </Text>
          ) : null}
        </Card>
      </Section>

      <Section title="휴식 타이머">
        <Card>
          <Text v="small" dim>
            기본 휴식 시간 (운동·루틴에 설정이 없을 때)
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {REST_OPTIONS.map((s) => (
              <Chip key={s} label={`${s}초`} selected={st.settings.defaultRestSec === s} onPress={() => st.updateSettings({ defaultRestSec: s })} />
            ))}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>세트 완료 시 자동 시작</Text>
            <Switch value={st.settings.autoStartRest} onValueChange={(v) => st.updateSettings({ autoStartRest: v })} trackColor={{ true: C.accent, false: C.surface2 }} thumbColor="#ffffff" />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>종료 소리</Text>
            <Switch value={st.settings.restSound} onValueChange={(v) => st.updateSettings({ restSound: v })} trackColor={{ true: C.accent, false: C.surface2 }} thumbColor="#ffffff" />
          </Row>
          <Button small kind="ghost" title="알림 권한 설정 열기" onPress={() => void Linking.openSettings()} />
        </Card>
      </Section>

      <Section title="단위">
        <Row>
          <Chip label="kg" selected={st.settings.unit === 'kg'} onPress={() => st.updateSettings({ unit: 'kg' })} />
          <Chip label="lb" selected={st.settings.unit === 'lb'} onPress={() => st.updateSettings({ unit: 'lb' })} />
        </Row>
      </Section>

      <Section title="데이터">
        <Button kind="secondary" title="전체 기록 CSV로 내보내기" onPress={() => void exportCsv()} />
      </Section>

      <Section title="계정">
        <Button
          kind="secondary"
          title="로그아웃"
          onPress={async () => {
            if (await confirm('로그아웃', '이 기기의 기록은 서버에 동기화된 뒤 지워져요.', '로그아웃')) await signOut();
          }}
        />
        <Button
          kind="danger"
          title="회원 탈퇴"
          onPress={async () => {
            if (
              await confirm(
                '회원 탈퇴',
                '계정이 바로 비활성화되고 30일 뒤 모든 기록이 영구 삭제돼요. 30일 안에 다시 로그인하면 복구할 수 있어요. 공유 링크와 Claude 연결은 즉시 해제돼요.',
                '탈퇴',
                true,
              )
            ) {
              const { requestAccountDeletion } = await import('@/lib/supabase');
              const ok = await requestAccountDeletion();
              notice(ok ? '탈퇴 처리됐어요' : '탈퇴 요청에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
            }
          }}
        />
        <Text v="small" faint>
          운동 기록은 참고용이며 의료 조언이 아니에요. 질환이나 부상이 있다면 전문가와 상담하세요.
        </Text>
      </Section>
    </Screen>
  );
}

function goalKo(g?: string) {
  return { muscle: '근성장', strength: '근력', fat_loss: '체지방 감량', health: '건강 유지' }[g ?? ''] ?? '';
}
