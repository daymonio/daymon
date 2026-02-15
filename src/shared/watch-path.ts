import { homedir } from 'os'
import { resolve } from 'path'

const SENSITIVE_HOME_SUFFIXES = ['/.ssh', '/.gnupg', '/.aws', '/.env']

export function validateWatchPath(watchPath: string): string | null {
  const resolved = resolve(watchPath)
  if (!resolved.startsWith('/')) {
    return 'Path must be absolute.'
  }

  const home = homedir()
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp')) {
    return `Path must be within your home directory (${home}) or /tmp.`
  }

  for (const suffix of SENSITIVE_HOME_SUFFIXES) {
    if (resolved.startsWith(home + suffix)) {
      return `Cannot watch sensitive directory: ${suffix}`
    }
  }

  return null
}
