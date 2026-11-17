// Claude Desktop용 MCP (stdio). 동기화 서버와 같은 data 폴더를 읽고 쓴다.
// claude_desktop_config.json 예:
//   "personal-training": { "command": "npx", "args": ["tsx", "<repo>/server/stdio.ts"] }
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { buildMcpServer } from './mcp';
import { Store } from './store';

const store = new Store();
serveStdio(() => buildMcpServer(store));
