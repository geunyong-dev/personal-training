// PC 로컬 동기화 서버 (요구사항 10·11·12)
// 실행: npm run server   →  http://<PC IP>:8787
//   GET  /api/health                     앱 설정에서 연결 확인
//   POST /api/devices/:id/sync           앱 → 서버 기록·계획 올리기, 서버 → 앱 계획·MCP 상태 내려받기
//   GET  /api/devices/:id/status         MCP 연결 상태
//   POST /mcp                            Claude용 MCP (Streamable HTTP)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

import { createMcpHandler } from '@modelcontextprotocol/server';

import { buildMcpServer } from './mcp';
import { mcpStatus, Store } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

export function createApp(store = new Store()) {
  const mcp = createMcpHandler(() => buildMcpServer(store));

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        data += c;
        if (data.length > 10_000_000) reject(new Error('too large'));
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

  return createServer(async (req, res) => {
    // 웹 미리보기(Expo web)에서도 부를 수 있게
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, mcp-protocol-version, mcp-session-id, accept');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, name: 'personal-training', time: new Date().toISOString() });

      const m = url.pathname.match(/^\/api\/devices\/([0-9a-f-]+)\/(sync|status)$/i);
      if (m) {
        const [, id, action] = m;
        if (action === 'status') return send(res, 200, mcpStatus(store.load(id)));
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        const body = JSON.parse(await readBody(req));
        if (body?.user?.id !== id) return send(res, 400, { error: 'user.id mismatch' });
        const d = store.sync({
          user: body.user,
          plan: body.plan,
          sessions: Array.isArray(body.sessions) ? body.sessions : [],
          deletedSessionIds: Array.isArray(body.deletedSessionIds) ? body.deletedSessionIds : [],
        });
        return send(res, 200, { plan: d.plan, mcp: mcpStatus(d), serverTime: new Date().toISOString() });
      }

      if (url.pathname === '/mcp') {
        const raw = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const r = await mcp.fetch(new Request(url, { method: req.method, headers, body: raw }));
        res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
        if (r.body) {
          const reader = r.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        return void res.end();
      }

      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

if (require.main === module) {
  const store = new Store();
  createApp(store).listen(PORT, HOST, () => {
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n!.address);
    console.log(`운동앱 동기화 서버 실행 중 (데이터: ${store.dir})`);
    console.log(`  앱 설정에 입력할 주소: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  또는  ') || `http://localhost:${PORT}`}`);
    console.log(`  Claude MCP 주소:       http://localhost:${PORT}/mcp`);
  });
}
