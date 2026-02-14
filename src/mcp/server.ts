import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerMemoryTools } from './tools/memory'
import { registerSchedulerTools } from './tools/scheduler'
import { registerWatcherTools } from './tools/watcher'
import { registerWorkerTools } from './tools/workers'

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'daymon',
    version: '0.1.0'
  })

  registerMemoryTools(server)
  registerSchedulerTools(server)
  registerWatcherTools(server)
  registerWorkerTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Daymon MCP server started (stdio)')
}

main().catch((error) => {
  console.error('Fatal error in Daymon MCP server:', error)
  process.exit(1)
})
