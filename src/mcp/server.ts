import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerMemoryTools } from './tools/memory'
import { registerSchedulerTools } from './tools/scheduler'
import { registerWatcherTools } from './tools/watcher'

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'daymon',
    version: '0.1.0'
  })

  registerMemoryTools(server)
  registerSchedulerTools(server)
  registerWatcherTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr — stdout is reserved for MCP JSON-RPC protocol
  console.error('Daymon MCP server started')
}

main().catch((error) => {
  console.error('Fatal error in Daymon MCP server:', error)
  process.exit(1)
})
