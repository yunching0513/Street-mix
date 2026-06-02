// Streetmix+ Innovation — Workspace staging
//
// npm workspaces create symlinks at `node_modules/@streetmix/<name>`
// pointing to `packages/<name>/`. electron-builder copies the symlink
// without (or while breaking) its target, so the packaged app has a
// dangling `node_modules/@streetmix/parts/` that Node cannot resolve.
//
// Fix: just before electron-builder runs, replace each workspace
// symlink with a real directory containing the workspace's
// `package.json` and `build/`. The runtime `node_modules/@streetmix/*`
// then looks identical to a normally-installed package.
//
// Tradeoff: this leaves the source repo's node_modules with real
// dirs instead of symlinks. A fresh `npm install` restores the
// symlinks; until then, edits inside `packages/<name>/build/` won't
// be picked up by `npm start`. That's fine for the one-shot
// Mac-app build flow.

const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const WORKSPACES = ['types', 'utils', 'parts', 'i18n', 'export-image']

let replaced = 0
for (const name of WORKSPACES) {
  const target = path.join(repoRoot, 'node_modules', '@streetmix', name)
  const source = path.join(repoRoot, 'packages', name)

  if (!fs.existsSync(source)) {
    console.error(`[stage-workspaces] missing source: ${source}`)
    process.exit(1)
  }
  if (!fs.existsSync(path.join(source, 'build'))) {
    console.error(`[stage-workspaces] missing build/: ${source}`)
    process.exit(1)
  }

  // Detect a symlink and replace it. If it's already a real directory
  // (e.g. previous run already staged it), refresh contents anyway so
  // a stale build doesn't ship.
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
  fs.mkdirSync(target, { recursive: true })

  fs.cpSync(
    path.join(source, 'package.json'),
    path.join(target, 'package.json')
  )
  fs.cpSync(path.join(source, 'build'), path.join(target, 'build'), {
    recursive: true,
  })
  console.log(`[stage-workspaces] staged @streetmix/${name}`)
  replaced++
}

console.log(`[stage-workspaces] done (${replaced} packages)`)
