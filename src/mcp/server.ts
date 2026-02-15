import { createRequire } from 'module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerMemoryTools } from './tools/memory'
import { registerSchedulerTools } from './tools/scheduler'
import { registerWatcherTools } from './tools/watcher'
import { registerWorkerTools } from './tools/workers'
import { closeMcpDatabase } from './db'

const require = createRequire(import.meta.url ?? __filename)
const pkg = require('../../package.json') as { version: string }

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'daymon',
    version: pkg.version
  })

  registerMemoryTools(server)
  registerSchedulerTools(server)
  registerWatcherTools(server)
  registerWorkerTools(server)

  // Clean up database on process exit
  const cleanup = (): void => {
    closeMcpDatabase()
  }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
  process.on('exit', cleanup)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Daymon MCP server started (stdio)')
}

main().catch((error) => {
  console.error('Fatal error in Daymon MCP server:', error)
  process.exit(1)
})
