#!/usr/bin/env node
// Cross-platform dev clean dispatcher
const { execSync } = require('child_process')
const { join } = require('path')

const scriptsDir = __dirname

if (process.platform === 'win32') {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${join(scriptsDir, 'dev-clean.ps1')}"`, { stdio: 'inherit' })
} else {
  execSync(`bash "${join(scriptsDir, 'dev-clean.sh')}"`, { stdio: 'inherit' })
}
