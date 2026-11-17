import '@/store/storage'; // localStorage 폴리필 (세션 토큰 저장)

import { createClient, type Provider } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key';

export const MCP_URL = `${URL}/functions/v1/mcp`;

export const supabase = createClient(URL, KEY, {
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

export type SocialProvider = Extract<Provider, 'apple' | 'google' | 'kakao'>;

const redirectTo = () =>
  Platform.OS === 'web' ? `${globalThis.location?.origin}/auth-callback` : 'workoutapp://auth-callback';

/** 소셜 로그인 (5.1). 네이티브는 인앱 브라우저 + PKCE 코드 교환 */
export async function signInWith(provider: SocialProvider, webReturnTo?: string): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    const to = webReturnTo ? `${redirectTo()}?next=${encodeURIComponent(webReturnTo)}` : redirectTo();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: to } });
    return { ok: !error, error: error?.message };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectTo(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? '로그인 URL을 받지 못했어요' };
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo());
  if (res.type !== 'success') return { ok: false, error: '로그인이 취소됐어요' };
  const code = new globalThis.URL(res.url).searchParams.get('code');
  if (!code) return { ok: false, error: '인증 코드를 받지 못했어요' };
  const ex = await supabase.auth.exchangeCodeForSession(code);
  return { ok: !ex.error, error: ex.error?.message };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signOut(): Promise<void> {
  const { syncNow } = await import('./sync');
  await syncNow().catch(() => undefined);
  await supabase.auth.signOut();
  const { useApp } = await import('@/store/app-store');
  useApp.getState().resetAll();
}

/** MCP 서버가 첫 인증 호출 때 mcp_connections에 기록한다. 그 행이 있으면 연결된 것 */
export async function checkClaudeConnected(): Promise<boolean> {
  const { data, error } = await supabase.from('mcp_connections').select('user_id').maybeSingle();
  return !error && !!data;
}

export type McpAuditRow = { id: number; tool: string; ok: boolean; called_at: string };

export async function fetchMcpAudit(limit = 10): Promise<McpAuditRow[]> {
  const { data } = await supabase
    .from('mcp_audit_log')
    .select('id, tool, ok, called_at')
    .order('called_at', { ascending: false })
    .limit(limit);
  return (data as McpAuditRow[] | null) ?? [];
}

export async function requestAccountDeletion(): Promise<boolean> {
  const { error } = await supabase.rpc('request_account_deletion');
  if (error) return false;
  await supabase.auth.signOut();
  const { useApp } = await import('@/store/app-store');
  useApp.getState().resetAll();
  return true;
}

export async function isNicknameTaken(nickname: string): Promise<boolean> {
  const uid = await currentUserId();
  const { data } = await supabase.rpc('nickname_taken', { p_nickname: nickname, p_except: uid });
  return data === true;
}

/** Claude 등 이 계정에 OAuth로 연결된 클라이언트 목록 (설정 > Claude 연결) */
export async function listOAuthGrants() {
  const { data } = await supabase.auth.oauth.listGrants();
  return data ?? [];
}

/** 연결 해제: OAuth 권한 회수 + 연결 기록 삭제. 기록·열람은 계속 가능 (5.5) */
export async function revokeOAuthGrant(clientId: string): Promise<boolean> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return false;
  await supabase.from('mcp_connections').delete().not('user_id', 'is', null);
  return true;
}
