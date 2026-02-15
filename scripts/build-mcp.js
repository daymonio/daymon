const { execSync } = require('child_process')
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
execSync('cd out/mcp && npm install better-sqlite3@11.10.0 @huggingface/transformers', { stdio: 'inherit' })
