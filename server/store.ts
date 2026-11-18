// 동기화 서버 저장소: 기기(사용자)별 JSON 파일
// data/<deviceId>.json  — 앱에서 올라온 계획·기록 + 인증 정보 + MCP 호출 기록
// data/_tokens.json     — MCP 토큰 해시 → 기기 ID (Claude 요청이 누구 것인지 찾기)
// data/_meta.json       — 마지막으로 동기화한 기기 (stdio MCP 기본 사용자)
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { LocalUser, Session, WeeklyPlan } from '../src/domain/types';

export type McpCall = { tool: string; at: string; ok: boolean };

export interface DeviceAuth {
  secretHash: string; // 기기 비밀키의 SHA-256 (원문은 저장하지 않는다)
  mcpToken: string; // Claude 연결용 토큰. 앱에 다시 보여 줘야 해서 원문 보관
  registeredAt: string;
}

export interface DeviceData {
  user: LocalUser;
  auth: DeviceAuth;
  plan: WeeklyPlan;
  sessions: Session[];
  mcp: { firstCallAt?: string; lastCallAt?: string; calls: McpCall[] };
  lastSyncAt?: string;
}

const EMPTY_PLAN: WeeklyPlan = { days: {}, updatedAt: '1970-01-01T00:00:00.000Z' };

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(24).toString('base64url');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type AuthResult = { ok: true; data: DeviceData; registered: boolean } | { ok: false; status: number; error: string };

export class Store {
  readonly dir: string;
  readonly maxDevices: number;

  constructor(dir = process.env.WORKOUT_DATA_DIR ?? join(__dirname, 'data'), maxDevices = Number(process.env.MAX_DEVICES ?? 1000)) {
    this.dir = resolve(dir);
    this.maxDevices = maxDevices;
    mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string) {
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) throw new Error('잘못된 기기 ID');
    return join(this.dir, `${id}.json`);
  }

  private writeJson(path: string, data: unknown) {
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, path); // 중간에 꺼져도 파일이 깨지지 않게
  }

  private readJson<T>(path: string, fallback: T): T {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
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

  // ---------- 인증 ----------

  /**
   * 기기 비밀키 확인. 처음 보는 기기는 이 비밀키로 등록한다
   * (목업 인증: 기기 ID + 비밀키를 처음 등록한 쪽이 그 기록의 주인).
   */
  authenticate(user: LocalUser, secret: string | undefined): AuthResult {
    if (!secret || secret.length < 32) return { ok: false, status: 401, error: '기기 비밀키가 없어요' };
    const cur = this.load(user.id);
    if (cur) {
      return safeEqual(cur.auth.secretHash, sha256(secret))
        ? { ok: true, data: cur, registered: false }
        : { ok: false, status: 401, error: '기기 비밀키가 맞지 않아요' };
    }
    if (this.devices().length >= this.maxDevices) return { ok: false, status: 403, error: '이 서버에 더 이상 기기를 등록할 수 없어요' };
    const now = new Date().toISOString();
    const data: DeviceData = {
      user: { id: user.id, nickname: user.nickname, createdAt: user.createdAt },
      auth: { secretHash: sha256(secret), mcpToken: newToken(), registeredAt: now },
      plan: EMPTY_PLAN,
      sessions: [],
      mcp: { calls: [] },
    };
    this.save(data);
    this.indexToken(data.auth.mcpToken, user.id);
    return { ok: true, data, registered: true };
  }

  /** 이미 등록된 기기만 확인 (상태 조회·토큰 재발급용) */
  verify(id: string, secret: string | undefined): AuthResult {
    const cur = this.load(id);
    if (!cur) return { ok: false, status: 404, error: '등록되지 않은 기기예요' };
    return this.authenticate(cur.user, secret);
  }

  private tokensPath() {
    return join(this.dir, '_tokens.json');
  }

  private indexToken(token: string, id: string, drop?: string) {
    const idx = this.readJson<Record<string, string>>(this.tokensPath(), {});
    if (drop) delete idx[sha256(drop)];
    idx[sha256(token)] = id;
    this.writeJson(this.tokensPath(), idx);
  }

  /** Claude가 보낸 MCP 토큰 → 기기 ID */
  deviceByMcpToken(token: string | undefined): string | null {
    if (!token) return null;
    const idx = this.readJson<Record<string, string>>(this.tokensPath(), {});
    const id = idx[sha256(token)];
    const d = id ? this.load(id) : null;
    return d && safeEqual(d.auth.mcpToken, token) ? id! : null;
  }

  /** Claude 연결 토큰 재발급: 예전 주소로는 더 이상 접근할 수 없다 */
  rotateMcpToken(id: string): string {
    const d = this.load(id);
    if (!d) throw new Error('등록되지 않은 기기예요');
    const old = d.auth.mcpToken;
    d.auth.mcpToken = newToken();
    d.mcp = { calls: [] }; // 연결 상태도 처음부터
    this.save(d);
    this.indexToken(d.auth.mcpToken, id, old);
    return d.auth.mcpToken;
  }

  // ---------- 데이터 ----------

  setActive(id: string) {
    this.writeJson(join(this.dir, '_meta.json'), { activeDeviceId: id });
  }

  /** stdio MCP가 다룰 사용자: 환경변수 → 마지막 동기화 기기 → 하나뿐인 기기 */
  activeId(): string | null {
    if (process.env.WORKOUT_DEVICE_ID) return process.env.WORKOUT_DEVICE_ID;
    const meta = this.readJson<{ activeDeviceId?: string }>(join(this.dir, '_meta.json'), {});
    if (meta.activeDeviceId) return meta.activeDeviceId;
    const all = this.devices();
    return all.length === 1 ? all[0] : null;
  }

  /**
   * 앱 → 서버 동기화 (인증된 기기만)
   * - 기록: id 기준 병합, updatedAt이 최신인 쪽 / 앱에서 지운 기록은 지움
   * - 계획: 마지막 수정 우선 (Claude가 MCP로 고친 게 더 최신이면 서버 것을 유지해 앱에 돌려준다)
   */
  sync(cur: DeviceData, input: { user: LocalUser; plan: WeeklyPlan; sessions: Session[]; deletedSessionIds: string[] }): DeviceData {
    const byId = new Map(cur.sessions.map((s) => [s.id, s]));
    for (const s of input.sessions) {
      const prev = byId.get(s.id);
      if (!prev || s.updatedAt >= prev.updatedAt) byId.set(s.id, s);
    }
    for (const id of input.deletedSessionIds) byId.delete(id);
    const next: DeviceData = {
      ...cur,
      user: { ...cur.user, nickname: input.user.nickname },
      plan: input.plan && input.plan.updatedAt > cur.plan.updatedAt ? input.plan : cur.plan,
      sessions: [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      lastSyncAt: new Date().toISOString(),
    };
    this.save(next);
    this.setActive(cur.user.id);
    return next;
  }

  recordCall(id: string, tool: string, ok: boolean) {
    const d = this.load(id);
    if (!d) return;
    const at = new Date().toISOString();
    d.mcp = { firstCallAt: d.mcp.firstCallAt ?? at, lastCallAt: at, calls: [{ tool, at, ok }, ...d.mcp.calls].slice(0, 50) };
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
