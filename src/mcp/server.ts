import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerMemoryTools } from './tools/memory'
import { registerSchedulerTools } from './tools/scheduler'
import { registerWatcherTools } from './tools/watcher'
import { registerWorkerTools } from './tools/workers'
import { closeMcpDatabase } from './db'

declare const __APP_VERSION__: string

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'daymon',
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
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
