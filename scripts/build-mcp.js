const { execSync } = require('child_process')
const { writeFileSync, mkdirSync } = require('fs')
const { version } = require('../package.json')

const esbuildArgs = [
  'src/mcp/server.ts',
  '--bundle',
  '--platform=node',
  '--target=node18',
  '--outfile=out/mcp/server.js',
  '--external:better-sqlite3',
  '--external:@huggingface/transformers',
  '--external:onnxruntime-node',
  `--define:__APP_VERSION__='"${version}"'`
].join(' ')

execSync(`esbuild ${esbuildArgs}`, { stdio: 'inherit' })

// Create package.json so npm install stays in out/mcp/ (not the root)
mkdirSync('out/mcp', { recursive: true })
writeFileSync('out/mcp/package.json', JSON.stringify({
  name: 'daymon-mcp',
  version,
  private: true,
  dependencies: {
    'better-sqlite3': '11.10.0',
    '@huggingface/transformers': '*'
  }
}, null, 2))

execSync('npm install --omit=dev', { cwd: 'out/mcp', stdio: 'inherit' })
