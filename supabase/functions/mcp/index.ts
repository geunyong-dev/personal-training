// 운동앱 MCP 서버 진입점 (Supabase Edge Function). 도구 정의는 server.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createMcpHandler } from 'npm:@modelcontextprotocol/server@^2.0.0';
import { pipeline } from 'npm:@supabase/middleware@1';
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { buildServer } from './server.ts';

Deno.serve(
  pipeline([withOAuthProtectedResource(), withSupabase({ auth: 'user' })], async (req, { supabase }) => {
    // Edge Function은 상태가 없으므로 요청마다 서버를 새로 만든다
    const handler = createMcpHandler(() => buildServer(supabase as unknown as SupabaseClient));
    return handler.fetch(req);
  }),
);
