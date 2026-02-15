import { describe, expect, it } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import { validateWatchPath } from '../watch-path'

describe('validateWatchPath', () => {
  it('accepts a path inside home directory', () => {
    const path = join(homedir(), 'Documents')
    expect(validateWatchPath(path)).toBeNull()
  })

  it('accepts a path inside /tmp', () => {
    expect(validateWatchPath('/tmp/daymon-test')).toBeNull()
  })

  it('rejects a path outside allowed roots', () => {
    expect(validateWatchPath('/etc')).toMatch(/home directory/)
  })

  it('rejects sensitive home directories', () => {
    expect(validateWatchPath(join(homedir(), '.ssh'))).toMatch(/sensitive directory/)
  })
})
