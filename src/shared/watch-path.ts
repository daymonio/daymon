import { homedir } from 'os'
import { resolve, sep } from 'path'
import { realpathSync } from 'fs'

const SENSITIVE_HOME_SUFFIXES = [
  '/.ssh',
  '/.gnupg',
  '/.aws',
  '/.env',
  '/.kube',
  '/.docker',
  '/.npmrc',
  '/.config/gh',
  '/Library/Keychains'
]

export function validateWatchPath(watchPath: string): string | null {
  const resolved = resolve(watchPath)
  if (!resolved.startsWith(sep)) {
    return 'Path must be absolute.'
  }

  // Resolve symlinks to prevent bypassing sensitive directory checks
  let realPath: string
  try {
    realPath = realpathSync(resolved)
  } catch {
    // Path doesn't exist yet — validate the literal path
    realPath = resolved
  }

  const home = homedir()
  if (!realPath.startsWith(home) && !realPath.startsWith('/tmp')) {
    return `Path must be within your home directory (${home}) or /tmp.`
  }

  for (const suffix of SENSITIVE_HOME_SUFFIXES) {
    if (realPath.startsWith(home + suffix)) {
      return `Cannot watch sensitive directory: ${suffix}`
    }
  }

  return null
}
