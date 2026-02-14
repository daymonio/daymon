import { createServer } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { registerMemoryTools } from './tools/memory'
import { registerSchedulerTools } from './tools/scheduler'
import { registerWatcherTools } from './tools/watcher'

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'daymon',
    version: '0.1.0'
  })

  registerMemoryTools(server)
  registerSchedulerTools(server)
  registerWatcherTools(server)

  return server
}

async function startStdio(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Daymon MCP server started (stdio)')
}

async function startHttp(port: number): Promise<void> {
  const httpServer = createServer(async (req, res) => {
    // CORS headers for ChatGPT Desktop
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Stateless mode: create fresh server + transport per request
    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })

    res.on('close', () => {
      transport.close().catch(() => {})
    })

    await server.connect(transport)
    await transport.handleRequest(req, res)
  })

  httpServer.listen(port, () => {
    console.error(`Daymon MCP server started (HTTP on port ${port})`)
  })
}

async function main(): Promise<void> {
  const httpPort = process.env.DAYMON_HTTP_PORT

  if (httpPort) {
    await startHttp(parseInt(httpPort, 10))
  } else {
    await startStdio()
  }
}

main().catch((error) => {
  console.error('Fatal error in Daymon MCP server:', error)
  process.exit(1)
})
