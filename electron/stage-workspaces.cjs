// Streetmix+ Innovation — Workspace staging
//
// npm workspaces create symlinks at `node_modules/@streetmix/<name>`
// pointing to `packages/<name>/` (or `client/`). electron-builder
// copies the symlink without (or while breaking) its target, so the
// packaged app has dangling `node_modules/@streetmix/*` entries that
// Node cannot resolve.
//
// Fix: just before electron-builder runs, replace each workspace
// symlink with a real directory containing the workspace's
// `package.json`, `build/`, and `src/`. `src/` is required because
// some build outputs import source files at runtime, e.g.
// `@streetmix/parts/src/segment-lookup.json` (from
// export-image/build/labels.js) and
// `@streetmix/client/src/users/constants.js` (from
// types/build/index.js).
//
// Tradeoff: this leaves the source repo's node_modules with real
// dirs instead of symlinks. A fresh `npm install` restores the
// symlinks; until then, edits inside workspaces won't be picked up
// by `npm start`. That's fine for the one-shot Mac-app build flow.

const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

// name → source directory relative to repo root
const WORKSPACES = {
  types: 'packages/types',
  utils: 'packages/utils',
  parts: 'packages/parts',
  i18n: 'packages/i18n',
  'export-image': 'packages/export-image',
  client: 'client',
}

let replaced = 0
for (const [name, rel] of Object.entries(WORKSPACES)) {
  const target = path.join(repoRoot, 'node_modules', '@streetmix', name)
  const source = path.join(repoRoot, rel)

  if (!fs.existsSync(source)) {
    console.error(`[stage-workspaces] missing source: ${source}`)
    process.exit(1)
  }

  // Replace symlink (or stale real dir from a previous run) with a
  // fresh real-directory copy so a stale build never ships.
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
  fs.mkdirSync(target, { recursive: true })

  fs.cpSync(
    path.join(source, 'package.json'),
    path.join(target, 'package.json')
  )
  for (const dir of ['build', 'src']) {
    const from = path.join(source, dir)
    if (fs.existsSync(from)) {
      fs.cpSync(from, path.join(target, dir), { recursive: true })
    }
  }
  console.log(`[stage-workspaces] staged @streetmix/${name}`)
  replaced++
}

console.log(`[stage-workspaces] done (${replaced} packages)`)
