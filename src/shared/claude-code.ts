import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface ConsoleLogEvent {
  entryType: 'tool_call' | 'assistant_text' | 'tool_result' | 'result' | 'error'
  content: string
}

export type ConsoleLogCallback = (entry: ConsoleLogEvent) => void

export interface ExecutionOptions {
  timeoutMs?: number
  onProgress?: ProgressCallback
  onConsoleLog?: ConsoleLogCallback
  resumeSessionId?: string
  systemPrompt?: string
  model?: string
}

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  timedOut: boolean
  sessionId: string | null
}

export interface ProgressUpdate {
  fraction: number | null  // 0.0 to 1.0 if estimable, null = indeterminate
  message: string
}

export type ProgressCallback = (progress: ProgressUpdate) => void

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

let cachedClaudePath: string | null = null

/**
 * Resolve the full path to the `claude` CLI binary.
 * Packaged Electron apps don't inherit the user's login shell PATH,
 * so we probe common locations and fall back to a login-shell `which`.
 */
function resolveClaudePath(): string | null {
  if (cachedClaudePath) return cachedClaudePath

  const home = homedir()
  const candidates = [
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ]

  for (const p of candidates) {
    if (existsSync(p)) {
      cachedClaudePath = p
      return p
    }
  }

  // Fall back to login shell resolution (works when PATH is set in .zshrc / .bashrc)
  const shells = ['/bin/zsh', '/bin/bash']
  for (const sh of shells) {
    if (!existsSync(sh)) continue
    try {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const resolved = execSync(`${sh} -l -c 'which claude'`, {
        encoding: 'utf-8',
        env,
        timeout: 5000
      }).trim()
      if (resolved && existsSync(resolved)) {
        cachedClaudePath = resolved
        return resolved
      }
    } catch {
      // Shell not available or claude not in that shell's PATH
    }
  }

  return null
}

export function checkClaudeCliAvailable(): { available: boolean; version?: string; error?: string } {
  try {
    const claudePath = resolveClaudePath()
    if (!claudePath) {
      return { available: false, error: 'Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code' }
    }
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const version = execSync(`"${claudePath}" --version`, { encoding: 'utf-8', env, timeout: 5000 }).trim()
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
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const onProgress = options?.onProgress

  return new Promise((resolve) => {
    const startTime = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let lastResultText = ''
    let capturedSessionId: string | null = null

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE

    // Always use stream-json to capture session_id from result events
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
    if (options?.resumeSessionId) {
      args.push('--resume', options.resumeSessionId)
    }
    if (options?.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt)
    }
    if (options?.model) {
      args.push('--model', options.model)
    }

    const claudePath = resolveClaudePath()
    if (!claudePath) {
      resolve({
        stdout: '',
        stderr: 'Claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code',
        exitCode: 1,
        durationMs: Date.now() - startTime,
        timedOut: false,
        sessionId: null
      })
      return
    }

    const proc = spawn(claudePath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs
    })

    let buffer = ''
    let toolCallCount = 0
    const onConsoleLog = options?.onConsoleLog

    // Block accumulation state for console logging
    let currentBlockType: 'text' | 'tool_result' | null = null
    let blockAccumulator = ''

    function flushBlock(): void {
      if (!onConsoleLog || !currentBlockType || !blockAccumulator) {
        currentBlockType = null
        blockAccumulator = ''
        return
      }
      const maxLen = currentBlockType === 'text' ? 2000 : 500
      const content = blockAccumulator.length > maxLen
        ? blockAccumulator.slice(0, maxLen) + '...'
        : blockAccumulator
      onConsoleLog({
        entryType: currentBlockType === 'text' ? 'assistant_text' : 'tool_result',
        content
      })
      currentBlockType = null
      blockAccumulator = ''
    }

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
          const type = event.type as string | undefined

          // Capture session_id from result event
          if (type === 'result') {
            flushBlock()
            if (event.result) lastResultText = event.result
            if (event.session_id) capturedSessionId = event.session_id as string
            if (onConsoleLog && event.result) {
              const text = String(event.result)
              onConsoleLog({
                entryType: 'result',
                content: text.length > 2000 ? text.slice(0, 2000) + '...' : text
              })
            }
          }

          // Console log: track block starts
          if (type === 'content_block_start') {
            flushBlock()
            const block = event.content_block as Record<string, unknown> | undefined
            if (block?.type === 'text') {
              currentBlockType = 'text'
              blockAccumulator = ''
            } else if (block?.type === 'tool_result') {
              currentBlockType = 'tool_result'
              blockAccumulator = typeof block.content === 'string' ? block.content : ''
            }
          }

          // Console log: accumulate deltas
          if (type === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown> | undefined
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              blockAccumulator += delta.text
            }
          }

          // Console log: flush on block stop
          if (type === 'content_block_stop') {
            flushBlock()
          }

          if (onProgress) {
            const progress = parseStreamEvent(event, toolCallCount)
            if (progress) {
              if (progress.isToolUse) {
                toolCallCount++
                // Also emit console log for tool calls
                if (onConsoleLog) {
                  onConsoleLog({ entryType: 'tool_call', content: progress.message })
                }
              }
              onProgress({ fraction: progress.fraction, message: progress.message })
            }
          }
        } catch {
          // Not valid JSON line, skip
        }
      }
    })

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
        stdout: lastResultText ? lastResultText.trim() : stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        durationMs: Date.now() - startTime,
        timedOut,
        sessionId: capturedSessionId
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
        timedOut: false,
        sessionId: null
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
