// 동기화 서버 (요구사항 10·11·12). 인터넷에 공개해서 쓰는 것을 전제로 한다.
// 실행: npm run server  (배포: README "서버 배포")
//
//   GET  /api/health                         상태 확인 (인증 없음)
//   POST /api/devices/:id/sync               앱 ↔ 서버 동기화         Authorization: Bearer <기기 비밀키>
//   GET  /api/devices/:id/status             Claude 연결 상태          Authorization: Bearer <기기 비밀키>
//   POST /api/devices/:id/mcp-token          Claude 연결 토큰 재발급   Authorization: Bearer <기기 비밀키>
//   POST /mcp/:token  또는  POST /mcp        Claude용 MCP              (토큰은 경로 또는 Authorization: Bearer <MCP 토큰>)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createMcpHandler } from '@modelcontextprotocol/server';

import type { LocalUser } from '../src/domain/types';
import { buildMcpServer } from './mcp';
import { mcpStatus, Store } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const MAX_BODY = 5_000_000;

/** 아주 단순한 IP별 분당 요청 제한 (공개 서버 기본 보호) */
function rateLimiter(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + 60_000 });
      if (hits.size > 10_000) hits.clear();
      return true;
    }
    h.n += 1;
    return h.n <= perMinute;
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApp(store = new Store(), opts: { perMinute?: number } = {}) {
  const allow = rateLimiter(opts.perMinute ?? Number(process.env.RATE_LIMIT_PER_MIN ?? 120));

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (c: string) => {
        data += c;
        if (data.length > MAX_BODY) {
          reject(new HttpError(413, '요청이 너무 커요'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

  const bearer = (req: IncomingMessage) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
  };

  /** MCP 요청을 Web 표준 Request/Response로 바꿔 넘긴다. 토큰으로 사용자를 정해 그 사람 데이터만 보이게 */
  const serveMcp = async (req: IncomingMessage, res: ServerResponse, url: URL, deviceId: string) => {
    const handler = createMcpHandler(() => buildMcpServer(store, () => deviceId));
    const raw = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'authorization') headers.set(k, v);
    const r = await handler.fetch(new Request(url, { method: req.method, headers, body: raw }));
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    if (r.body) {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  };

  return createServer(async (req, res) => {
    // 웹 미리보기(Expo web)에서도 부를 수 있게. 인증은 쿠키가 아닌 Bearer 헤더라 * 로 열어도 된다
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-expose-headers', 'mcp-session-id');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    // 프록시(Cloudflare, Fly, Render 등) 뒤에 있으면 원래 IP
    const ip = String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    if (!allow(ip)) return send(res, 429, { error: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.' });

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, name: 'personal-training', time: new Date().toISOString() });

      // ---------- 앱 API ----------
      const m = url.pathname.match(/^\/api\/devices\/([0-9a-f-]{8,64})\/(sync|status|mcp-token)$/i);
      if (m) {
        const [, id, action] = m;
        const secret = bearer(req);

        if (action === 'sync') {
          if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
          const body = JSON.parse(await readBody(req)) as {
            user?: LocalUser;
            plan?: never;
            sessions?: unknown[];
            deletedSessionIds?: unknown[];
          };
          if (!body.user || body.user.id !== id || typeof body.user.nickname !== 'string') return send(res, 400, { error: 'user가 올바르지 않아요' });
          const auth = store.authenticate(body.user, secret); // 처음이면 이 비밀키로 등록
          if (!auth.ok) return send(res, auth.status, { error: auth.error });
          const d = store.sync(auth.data, {
            user: body.user,
            plan: body.plan ?? auth.data.plan,
            sessions: (Array.isArray(body.sessions) ? body.sessions : []) as never,
            deletedSessionIds: (Array.isArray(body.deletedSessionIds) ? body.deletedSessionIds : []).filter((x): x is string => typeof x === 'string'),
          });
          return send(res, 200, { plan: d.plan, mcp: mcpStatus(d), mcpToken: d.auth.mcpToken, registered: auth.registered, serverTime: new Date().toISOString() });
        }

        const auth = store.verify(id, secret);
        if (!auth.ok) return send(res, auth.status, { error: auth.error });
        if (action === 'status') return send(res, 200, { ...mcpStatus(auth.data), mcpToken: auth.data.auth.mcpToken });
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        return send(res, 200, { mcpToken: store.rotateMcpToken(id) });
      }

      // ---------- Claude MCP ----------
      const mm = url.pathname.match(/^\/mcp(?:\/([A-Za-z0-9_-]{16,128}))?\/?$/);
      if (mm) {
        const deviceId = store.deviceByMcpToken(mm[1] ?? bearer(req));
        if (!deviceId) {
          return send(res, 401, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32001, message: 'MCP 토큰이 없거나 맞지 않아요. 앱 설정의 "Claude 연결 주소"를 그대로 쓰세요.' },
          });
        }
        return void (await serveMcp(req, res, url, deviceId));
      }

      send(res, 404, { error: 'not found' });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof SyntaxError) return send(res, 400, { error: 'JSON 형식이 아니에요' });
      send(res, 500, { error: '서버 오류' });
      console.error(e);
    }
  });
}

if (require.main === module) {
  const store = new Store();
  createApp(store).listen(PORT, HOST, () => {
    console.log(`운동앱 동기화 서버 실행 중: http://${HOST}:${PORT}  (데이터: ${store.dir})`);
    console.log('  앱 설정에는 이 서버의 공개 주소(https://…)를 입력하세요.');
  });
}
