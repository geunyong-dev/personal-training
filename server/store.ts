// 동기화 서버 저장소: 기기(사용자)별 JSON 파일
// data/<deviceId>.json  — 앱에서 올라온 계획·기록 + MCP 호출 기록
// data/_meta.json       — 마지막으로 동기화한 기기 (MCP가 기본으로 다루는 사용자)
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { LocalUser, Session, WeeklyPlan } from '../src/domain/types';

export type McpCall = { tool: string; at: string; ok: boolean };

export interface DeviceData {
  user: LocalUser;
  plan: WeeklyPlan;
  sessions: Session[];
  mcp: { firstCallAt?: string; lastCallAt?: string; calls: McpCall[] };
  lastSyncAt?: string;
}

const EMPTY_PLAN: WeeklyPlan = { days: {}, updatedAt: '1970-01-01T00:00:00.000Z' };

export class Store {
  readonly dir: string;

  constructor(dir = process.env.WORKOUT_DATA_DIR ?? join(__dirname, 'data')) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string) {
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) throw new Error('잘못된 기기 ID');
    return join(this.dir, `${id}.json`);
  }

  private writeJson(path: string, data: unknown) {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, path); // 중간에 꺼져도 파일이 깨지지 않게
  }

  load(id: string): DeviceData | null {
    const f = this.file(id);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as DeviceData) : null;
  }

  save(data: DeviceData) {
    this.writeJson(this.file(data.user.id), data);
  }

  devices(): string[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => f.slice(0, -5));
  }

  setActive(id: string) {
    this.writeJson(join(this.dir, '_meta.json'), { activeDeviceId: id });
  }

  /** MCP가 다룰 사용자: 환경변수 → 마지막 동기화 기기 → 하나뿐인 기기 */
  activeId(): string | null {
    if (process.env.WORKOUT_DEVICE_ID) return process.env.WORKOUT_DEVICE_ID;
    const meta = join(this.dir, '_meta.json');
    if (existsSync(meta)) return (JSON.parse(readFileSync(meta, 'utf8')) as { activeDeviceId?: string }).activeDeviceId ?? null;
    const all = this.devices();
    return all.length === 1 ? all[0] : null;
  }

  /**
   * 앱 → 서버 동기화
   * - 기록: id 기준 병합, updatedAt이 최신인 쪽 / 앱에서 지운 기록은 지움
   * - 계획: 마지막 수정 우선 (Claude가 MCP로 고친 게 더 최신이면 서버 것을 유지해 앱에 돌려준다)
   */
  sync(input: { user: LocalUser; plan: WeeklyPlan; sessions: Session[]; deletedSessionIds: string[] }): DeviceData {
    const now = new Date().toISOString();
    const cur = this.load(input.user.id) ?? { user: input.user, plan: EMPTY_PLAN, sessions: [], mcp: { calls: [] } };
    const byId = new Map(cur.sessions.map((s) => [s.id, s]));
    for (const s of input.sessions) {
      const prev = byId.get(s.id);
      if (!prev || s.updatedAt >= prev.updatedAt) byId.set(s.id, s);
    }
    for (const id of input.deletedSessionIds) byId.delete(id);
    const next: DeviceData = {
      ...cur,
      user: input.user,
      plan: input.plan.updatedAt > cur.plan.updatedAt ? input.plan : cur.plan,
      sessions: [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      lastSyncAt: now,
    };
    this.save(next);
    this.setActive(input.user.id);
    return next;
  }

  recordCall(id: string, tool: string, ok: boolean) {
    const d = this.load(id);
    if (!d) return;
    const at = new Date().toISOString();
    d.mcp = {
      firstCallAt: d.mcp.firstCallAt ?? at,
      lastCallAt: at,
      calls: [{ tool, at, ok }, ...d.mcp.calls].slice(0, 50),
    };
    this.save(d);
  }
}

export function mcpStatus(d: DeviceData | null) {
  return {
    connected: !!d?.mcp.firstCallAt,
    lastCallAt: d?.mcp.lastCallAt,
    recentCalls: d?.mcp.calls.slice(0, 10) ?? [],
  };
}
