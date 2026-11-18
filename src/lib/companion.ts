// 동기화 서버(server/)와의 동기화
// 앱은 기기 JSON에 먼저 저장하고(오프라인에서도 동작), 인터넷이 되면 서버로 올린다.
// 서버는 같은 데이터를 MCP로 Claude에게 보여 주고, Claude가 고친 주간 계획을 돌려준다.
// 인증: 모든 요청에 기기 비밀키를 Authorization 헤더로 보낸다. 처음 동기화할 때 서버에 등록된다.
import type { Session, WeeklyPlan } from '@/domain/types';
import { useApp, type McpStatus } from '@/store/app-store';

export type SyncRequest = {
  user: { id: string; nickname: string; createdAt: string };
  plan: WeeklyPlan;
  sessions: Session[]; // 완료된 세션만
  deletedSessionIds: string[];
};

export type SyncResponse = {
  plan: WeeklyPlan;
  mcp: Omit<McpStatus, 'serverReachable' | 'checkedAt' | 'error'>;
  mcpToken: string;
  serverTime: string;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 5000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { serverUrl: base, deviceSecret } = useApp.getState();
  if (!base) throw new Error('서버 주소가 없어요');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${deviceSecret ?? ''}`, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const msg = await res.json().then((b: { error?: string }) => b.error, () => undefined);
      throw new ApiError(res.status, msg ?? `서버 오류 ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function pingServer(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<void> {
  const st = useApp.getState();
  if (!st.user || !st.serverUrl || !st.deviceSecret) return;
  const body: SyncRequest = {
    user: st.user,
    plan: st.plan,
    sessions: st.sessions.filter((s) => !!s.endedAt),
    deletedSessionIds: st.deletedSessionIds,
  };
  try {
    const res = await call<SyncResponse>(`/api/devices/${st.user.id}/sync`, { method: 'POST', body: JSON.stringify(body) });
    useApp.getState().applyServerPlan(res.plan);
    useApp.getState().markSynced(res.serverTime, body.deletedSessionIds);
    useApp.getState().setMcpToken(res.mcpToken);
    useApp.getState().setMcpStatus({ ...res.mcp, serverReachable: true, checkedAt: new Date().toISOString() });
  } catch (e) {
    const error =
      e instanceof ApiError
        ? e.status === 401
          ? '이 기기의 인증 정보가 서버와 맞지 않아요'
          : e.message
        : '서버에 연결할 수 없어요 (인터넷 연결을 확인해 주세요)';
    useApp.getState().setMcpStatus({
      ...useApp.getState().mcp,
      serverReachable: e instanceof ApiError,
      error,
      checkedAt: new Date().toISOString(),
    });
  }
}

/** 앱 실행 중 주기적 동기화 + 계획·기록이 바뀌면 곧바로 동기화 */
export function startSyncLoop(intervalMs = 30_000): () => void {
  const tick = () => void syncNow();
  const id = setInterval(tick, intervalMs);
  let prev = useApp.getState();
  const unsub = useApp.subscribe((next) => {
    const finishedChanged = next.sessions.filter((s) => s.endedAt).length !== prev.sessions.filter((s) => s.endedAt).length;
    if (next.user !== prev.user || next.plan !== prev.plan || finishedChanged || next.serverUrl !== prev.serverUrl || next.deletedSessionIds.length > prev.deletedSessionIds.length) {
      setTimeout(tick, 800);
    }
    prev = next;
  });
  tick();
  return () => {
    clearInterval(id);
    unsub();
  };
}

/** Claude 연결 주소 재발급: 예전 주소로 연결된 Claude는 끊긴다 */
export async function rotateMcpToken(): Promise<string> {
  const { user } = useApp.getState();
  if (!user) throw new Error('인증이 필요해요');
  const res = await call<{ mcpToken: string }>(`/api/devices/${user.id}/mcp-token`, { method: 'POST' });
  useApp.getState().setMcpToken(res.mcpToken);
  useApp.getState().setMcpStatus({ ...useApp.getState().mcp, connected: false, lastCallAt: undefined, recentCalls: [] });
  return res.mcpToken;
}

/** Claude에 붙여 넣을 개인 MCP 주소 (토큰이 들어 있으니 남에게 공유하지 않는다) */
export function personalMcpUrl(): string | null {
  const { serverUrl, mcpToken } = useApp.getState();
  return serverUrl && mcpToken ? `${serverUrl}/mcp/${mcpToken}` : null;
}

/** 인터넷에서 쓰려면 https여야 한다 (iOS는 http 차단). 내부 테스트 주소만 예외 */
export function isInsecureRemote(url: string): boolean {
  if (!url.startsWith('http://')) return false;
  const host = url.slice(7).split(/[/:]/)[0];
  return !(host === 'localhost' || host === '127.0.0.1' || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host));
}
