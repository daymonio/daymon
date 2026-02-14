import { spawn, execSync } from 'child_process'

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  timedOut: boolean
}

export interface ProgressUpdate {
  fraction: number | null  // 0.0 to 1.0 if estimable, null = indeterminate
  message: string
}

export type ProgressCallback = (progress: ProgressUpdate) => void

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function checkClaudeCliAvailable(): { available: boolean; version?: string; error?: string } {
  try {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const version = execSync('claude --version', { encoding: 'utf-8', env, timeout: 5000 }).trim()
    return { available: true, version }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      return { available: false, error: 'Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code' }
    }
    return { available: false, error: msg }
  }
}

export function executeClaudeCode(
  prompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  onProgress?: ProgressCallback
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let lastResultText = ''

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    // Use stream-json when we have a progress callback for real-time updates
    const outputFormat = onProgress ? 'stream-json' : 'text'
    const proc = spawn('claude', ['-p', prompt, '--output-format', outputFormat], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs
    })

    if (onProgress) {
      let buffer = ''
      let toolCallCount = 0

      proc.stdout!.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            const progress = parseStreamEvent(event, toolCallCount)
            if (progress) {
              if (progress.isToolUse) toolCallCount++
              onProgress({ fraction: progress.fraction, message: progress.message })
            }
            // Capture the final result text
            if (event.type === 'result' && event.result) {
              lastResultText = event.result
            }
          } catch {
            // Not valid JSON line, skip
          }
        }
      })
    } else {
      proc.stdout!.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }

    proc.stderr!.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timer = setTimeout(() => {
      if (!settled) {
        timedOut = true
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }
    }, timeoutMs)

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout: onProgress && lastResultText ? lastResultText.trim() : stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        durationMs: Date.now() - startTime,
        timedOut
      })
    })

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const isNotFound = err.code === 'ENOENT'
      resolve({
        stdout: '',
        stderr: isNotFound
          ? 'Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code'
          : `Failed to spawn claude CLI: ${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - startTime,
        timedOut: false
      })
    })
  })
}

export interface ParsedProgress {
  fraction: number | null
  message: string
  isToolUse: boolean
}

export function parseStreamEvent(event: Record<string, unknown>, toolCallCount: number): ParsedProgress | null {
  const type = event.type as string | undefined

  if (type === 'content_block_start') {
    const block = event.content_block as Record<string, unknown> | undefined
    if (block?.type === 'tool_use') {
      const toolName = (block.name as string) ?? 'tool'
      return {
        fraction: null,
        message: `Step ${toolCallCount + 1}: Using ${toolName}...`,
        isToolUse: true
      }
    }
  }

  if (type === 'result') {
    return {
      fraction: 1.0,
      message: 'Completed',
      isToolUse: false
    }
  }

  return null
}
