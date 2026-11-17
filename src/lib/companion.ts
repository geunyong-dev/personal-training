// PC 로컬 동기화 서버(server/)와의 동기화
// 앱은 기기 JSON에 먼저 저장하고, 서버 주소가 설정돼 있으면 같은 와이파이의 PC 서버로 올린다.
// 서버는 같은 데이터를 MCP로 Claude에게 보여 주고, Claude가 고친 주간 계획을 돌려준다.
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
  mcp: Omit<McpStatus, 'serverReachable' | 'checkedAt'>;
  serverTime: string;
};

const TIMEOUT_MS = 5000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const base = useApp.getState().serverUrl;
  if (!base) throw new Error('서버 주소가 없어요');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
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
  if (!st.user || !st.serverUrl) return;
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
    useApp.getState().setMcpStatus({ ...res.mcp, serverReachable: true, checkedAt: new Date().toISOString() });
  } catch {
    useApp.getState().setMcpStatus({ ...useApp.getState().mcp, serverReachable: false, checkedAt: new Date().toISOString() });
  }
}

/** 앱 실행 중 주기적 동기화 + 계획·기록이 바뀌면 곧바로 동기화 */
export function startSyncLoop(intervalMs = 30_000): () => void {
  const tick = () => void syncNow();
  const id = setInterval(tick, intervalMs);
  let prev = useApp.getState();
  const unsub = useApp.subscribe((next) => {
    const finishedChanged = next.sessions.filter((s) => s.endedAt).length !== prev.sessions.filter((s) => s.endedAt).length;
    if (next.plan !== prev.plan || finishedChanged || next.serverUrl !== prev.serverUrl || next.deletedSessionIds !== prev.deletedSessionIds) {
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
