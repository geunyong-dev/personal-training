import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';

import { sessionVolume } from '@/domain/calc';
import { planSetCount, WEEKDAY_KO, WEEKDAYS, weekdayOf } from '@/domain/plan';
import { formatWeight } from '@/domain/rules';
import { isInsecureRemote, pingServer, rotateMcpToken, syncNow } from '@/lib/companion';
import { exportCsv } from '@/lib/export';
import { findExercise, selectFinishedSessions, useApp } from '@/store/app-store';
import { confirm, notice } from '@/ui/confirm';
import { Button, Card, Chip, Field, Icon, Row, Screen, Section, Text } from '@/ui/kit';
import { IC } from '@/ui/icons';
import { C, R, S } from '@/ui/theme';

const REST_OPTIONS = [60, 90, 120, 150, 180];

/** 설정 (요구사항 11): 내 운동 기록 · MCP 연결 유무 · 내가 설정한 운동 계획 */
export default function Settings() {
  const st = useApp();
  const finished = selectFinishedSessions(st);
  const [url, setUrl] = useState(st.serverUrl);
  const [checking, setChecking] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const today = weekdayOf();

  const connect = async () => {
    const u = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(u)) return notice('주소를 확인해 주세요', '예: https://your-server.fly.dev');
    setChecking(true);
    const ok = await pingServer(u);
    setChecking(false);
    if (!ok) return notice('서버에 연결할 수 없어요', '주소와 인터넷 연결을 확인해 주세요.');
    st.setServerUrl(u);
    await syncNow();
    const err = useApp.getState().mcp.error;
    notice(err ? '연결은 됐지만 동기화에 실패했어요' : '동기화 서버에 연결했어요', err);
  };

  const mcp = st.mcp;
  // 렌더 중 getState()를 부르면 React Compiler가 값을 고정해 버리므로 구독한 상태에서 만든다
  const mcpUrl = st.serverUrl && st.mcpToken ? `${st.serverUrl}/mcp/${st.mcpToken}` : null;
  const status = !st.serverUrl
    ? { color: C.textFaint, text: '동기화 서버 미설정' }
    : !mcp.serverReachable || mcp.error
      ? { color: C.warn, text: mcp.serverReachable ? '동기화 실패' : '서버에 연결할 수 없음' }
      : mcp.connected
        ? { color: C.good, text: 'Claude 연결됨' }
        : { color: C.info, text: '서버 연결됨 · Claude 호출 기록 없음' };

  return (
    <Screen>
      <Text v="h1">설정</Text>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text v="h3">{st.user?.nickname}</Text>
            <Text v="small" faint>
              이 기기로 인증됨 · {st.user ? new Date(st.user.createdAt).toLocaleDateString('ko-KR') : ''}
            </Text>
          </View>
          <Icon name={IC.check} color={C.good} />
        </Row>
      </Card>

      {/* MCP 연결 유무 */}
      <Section title="Claude (MCP) 연결">
        <Card>
          <Row>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: status.color }} />
            <Text v="h3" style={{ flex: 1 }}>
              {status.text}
            </Text>
          </Row>
          {mcp.error && st.serverUrl ? (
            <Text v="small" color={C.warn}>
              {mcp.error}
            </Text>
          ) : null}
          {mcp.lastCallAt ? (
            <Text v="small" dim>
              마지막 Claude 호출: {new Date(mcp.lastCallAt).toLocaleString('ko-KR')}
            </Text>
          ) : null}
          {mcp.recentCalls.slice(0, 5).map((c) => (
            <Row key={c.at + c.tool} style={{ justifyContent: 'space-between' }}>
              <Text v="small">{TOOL_KO[c.tool] ?? c.tool}</Text>
              <Text v="small" faint>
                {new Date(c.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ·{' '}
                {c.ok ? '성공' : '실패'}
              </Text>
            </Row>
          ))}

          {mcpUrl ? (
            <View style={{ gap: S.xs, marginTop: S.xs }}>
              <Text v="small" dim>
                Claude 연결 주소 (나만 쓰는 주소예요. 공유하지 마세요)
              </Text>
              <Text v="small" selectable numberOfLines={showUrl ? undefined : 1} style={{ fontFamily: 'monospace' }}>
                {showUrl ? mcpUrl : `${st.serverUrl}/mcp/••••••••`}
              </Text>
              <Row>
                <Button
                  small
                  style={{ flex: 1 }}
                  icon={IC.link}
                  title="주소 복사"
                  onPress={async () => {
                    await Clipboard.setStringAsync(mcpUrl);
                    notice('복사했어요', 'Claude 설정 → 커넥터 → 커스텀 커넥터 추가에 붙여 넣으세요.');
                  }}
                />
                <Button small kind="secondary" title={showUrl ? '가리기' : '보기'} onPress={() => setShowUrl(!showUrl)} />
                <Button
                  small
                  kind="secondary"
                  title="재발급"
                  onPress={async () => {
                    if (!(await confirm('연결 주소 재발급', '지금 주소로 연결된 Claude는 끊겨요. 새 주소를 Claude에 다시 등록해야 해요.', '재발급', true))) return;
                    try {
                      await rotateMcpToken();
                      notice('새 주소를 발급했어요');
                    } catch {
                      notice('재발급에 실패했어요', '인터넷 연결을 확인해 주세요.');
                    }
                  }}
                />
              </Row>
            </View>
          ) : null}

          <Field
            label="동기화 서버 주소"
            placeholder="https://your-server.fly.dev"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {isInsecureRemote(url.trim()) ? (
            <Text v="small" color={C.warn}>
              인터넷에서 쓰려면 https:// 주소가 필요해요 (http는 iOS에서 막혀요).
            </Text>
          ) : null}
          <Button small title={checking ? '확인 중…' : '연결·동기화'} disabled={checking} onPress={() => void connect()} />
          <Text v="small" faint>
            기록은 이 기기에 먼저 저장되고, 인터넷이 될 때 서버로 올라가요. 어디서든(LTE·다른 와이파이) 동기화돼요
            {st.lastSyncedAt ? ` · 마지막 동기화 ${new Date(st.lastSyncedAt).toLocaleString('ko-KR')}` : ''}.
          </Text>
        </Card>
      </Section>

      {/* 내가 설정한 운동 계획 */}
      <Section
        title="내 운동 계획"
        right={
          <Pressable onPress={() => router.navigate('/plan')}>
            <Text v="small" color={C.accent}>
              편집
            </Text>
          </Pressable>
        }>
        <Card>
          {WEEKDAYS.map((d) => {
            const p = st.plan.days[d];
            return (
              <Pressable key={d} onPress={() => router.push({ pathname: '/plan/[day]', params: { day: String(d) } })}>
                <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                  <Row gap={S.sm}>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: R.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: d === today ? C.accent : C.surface2,
                      }}>
                      <Text v="small" color={d === today ? C.accentInk : C.text}>
                        {WEEKDAY_KO[d]}
                      </Text>
                    </View>
                    <Text color={p ? C.text : C.textFaint} numberOfLines={1} style={{ maxWidth: 200 }}>
                      {p ? (p.title ?? p.items.map((i) => findExercise(st, i.exerciseId)?.nameKo).join(', ')) : '휴식일'}
                    </Text>
                  </Row>
                  <Text v="small" faint>
                    {p ? `${p.items.length}종목 · ${planSetCount(p)}세트${p.source === 'claude' ? ' · Claude' : ''}` : ''}
                  </Text>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      </Section>

      {/* 내 운동 기록 */}
      <Section
        title={`내 운동 기록 (${finished.length})`}
        right={
          <Pressable onPress={() => router.navigate('/history')}>
            <Text v="small" color={C.accent}>
              전체 보기
            </Text>
          </Pressable>
        }>
        <Card>
          {finished.length === 0 ? (
            <Text v="small" faint>
              아직 완료한 운동이 없어요
            </Text>
          ) : (
            finished.slice(0, 5).map((s) => (
              <Pressable key={s.id} onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}>
                <Row style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                  <Text numberOfLines={1} style={{ flex: 1 }}>
                    {new Date(s.startedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })} ·{' '}
                    {s.title ?? s.exercises.map((e) => findExercise(st, e.exerciseId)?.nameKo).join(', ')}
                  </Text>
                  <Text v="small" faint>
                    {formatWeight(sessionVolume(s), st.settings.unit)}
                  </Text>
                </Row>
              </Pressable>
            ))
          )}
          <Text v="small" faint>
            기록은 이 기기의 JSON 파일에 저장되고, 동기화 서버를 통해 Claude가 읽을 수 있어요.
          </Text>
          <Button small kind="secondary" title="전체 기록 CSV로 내보내기" onPress={() => void exportCsv()} />
        </Card>
      </Section>

      <Section title="휴식 타이머">
        <Card>
          <Text v="small" dim>
            기본 휴식 시간 (운동·계획에 설정이 없을 때)
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {REST_OPTIONS.map((s) => (
              <Chip key={s} label={`${s}초`} selected={st.settings.defaultRestSec === s} onPress={() => st.updateSettings({ defaultRestSec: s })} />
            ))}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>세트 완료 시 자동 시작</Text>
            <Switch
              value={st.settings.autoStartRest}
              onValueChange={(v) => st.updateSettings({ autoStartRest: v })}
              trackColor={{ true: C.accent, false: C.surface2 }}
              thumbColor="#ffffff"
            />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text>종료 소리</Text>
            <Switch
              value={st.settings.restSound}
              onValueChange={(v) => st.updateSettings({ restSound: v })}
              trackColor={{ true: C.accent, false: C.surface2 }}
              thumbColor="#ffffff"
            />
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

      <Button
        kind="danger"
        title="이 기기 데이터 초기화"
        onPress={async () => {
          if (await confirm('데이터 초기화', '이 기기의 인증·계획·기록이 모두 지워져요. 서버에 올라간 데이터는 남아요.', '초기화', true)) {
            st.resetAll();
            router.replace('/auth');
          }
        }}
      />
      <Text v="small" faint>
        운동 기록과 Claude의 계획은 참고용이며 의료 조언이 아니에요. 질환이나 부상이 있다면 전문가와 상담하세요.
      </Text>
    </Screen>
  );
}

const TOOL_KO: Record<string, string> = {
  get_weekly_plan: '계획 조회',
  create_day_plan: '계획 작성',
  update_day_plan: '계획 수정',
  list_workout_records: '기록 조회',
  search_exercises: '운동 검색',
};
