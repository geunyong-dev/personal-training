// Claude Desktop용 MCP (stdio). 동기화 서버와 같은 data 폴더를 읽고 쓴다.
// claude_desktop_config.json 예:
//   "personal-training": { "command": "npx", "args": ["tsx", "<repo>/server/stdio.ts"] }
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { buildMcpServer } from './mcp';
import { Store } from './store';

const store = new Store();
// 로컬 PC에서만 쓰는 연결이라 토큰 대신 WORKOUT_DEVICE_ID 또는 마지막 동기화 기기를 쓴다
serveStdio(() => buildMcpServer(store, () => store.activeId()));
