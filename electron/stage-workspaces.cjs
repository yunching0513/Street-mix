// Streetmix+ Innovation — Workspace staging
//
// npm workspaces create symlinks at `node_modules/@streetmix/<name>`
// pointing to `packages/<name>/`. electron-builder copies the symlink
// without (or while breaking) its target, so the packaged app has a
// dangling `node_modules/@streetmix/parts/` that Node cannot resolve.
//
// Fix: just before electron-builder runs, replace each workspace
// symlink with a real directory containing the workspace's
// `package.json` plus every path the package needs at runtime. The
// runtime `node_modules/@streetmix/*` then looks identical to a
// normally-installed package.
//
// Note that `build/` alone is not enough for every package:
//   - parts: export-image's build output imports
//     `@streetmix/parts/src/segment-lookup.json` directly
//   - i18n: the `/api/v1/translate` endpoint reads `locales/*.json`
//   - illustrations: export-image resolves
//     `@streetmix/illustrations/images/**.svg` via import.meta.resolve
//     (no build step at all — it's an artwork-only package)
//
// Tradeoff: this leaves the source repo's node_modules with real
// dirs instead of symlinks. A fresh `npm install` restores the
// symlinks; until then, edits inside `packages/<name>/build/` won't
// be picked up by `npm start`. That's fine for the one-shot
// Mac-app build flow.

const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

// For each workspace, the paths (relative to the package root) that
// must exist in the staged copy. Every listed path is required.
const WORKSPACES = {
  types: ['build'],
  utils: ['build'],
  parts: ['build', 'src/segment-lookup.json'],
  i18n: ['build', 'locales'],
  'export-image': ['build'],
  illustrations: ['images'],
}

let replaced = 0
for (const [name, paths] of Object.entries(WORKSPACES)) {
  const target = path.join(repoRoot, 'node_modules', '@streetmix', name)
  const source = path.join(repoRoot, 'packages', name)

  if (!fs.existsSync(source)) {
    console.error(`[stage-workspaces] missing source: ${source}`)
    process.exit(1)
  }
  for (const p of paths) {
    if (!fs.existsSync(path.join(source, p))) {
      console.error(`[stage-workspaces] missing ${p} in: ${source}`)
      process.exit(1)
    }
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
  for (const p of paths) {
    fs.cpSync(path.join(source, p), path.join(target, p), {
      recursive: true,
    })
  }
  console.log(`[stage-workspaces] staged @streetmix/${name}`)
  replaced++
}

console.log(`[stage-workspaces] done (${replaced} packages)`)
