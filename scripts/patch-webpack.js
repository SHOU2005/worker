const fs = require('fs')
const path = require('path')

const buildDir = process.env.NEXT_DIST_DIR || '.next'
const runtimePath = path.join(buildDir, 'server/webpack-runtime.js')

if (!fs.existsSync(runtimePath)) {
  console.log('webpack-runtime.js not found at', runtimePath, '— skipping patch')
  process.exit(0)
}

const content = fs.readFileSync(runtimePath, 'utf8')

// Numeric chunks live in chunks/; string-path chunks (vendor-chunks/*) resolve directly
const patched = content.replace(
  'return "" + chunkId + ".js";',
  'return (String(chunkId).indexOf("/") === -1 ? "chunks/" : "") + chunkId + ".js";'
)

if (patched === content) {
  console.error('webpack-runtime.js: pattern not found, skipping patch')
  process.exit(0)
}

fs.writeFileSync(runtimePath, patched)
console.log('webpack-runtime.js patched successfully')
