// Streetmix+ Innovation — Electron main process
//
// Boots the Streetmix Express server as a child Node process on a
// free localhost port, then opens a BrowserWindow pointing at it.
// Server lifecycle is tied to the Electron app: window closes →
// app quits → server is killed.
//
// This file is intentionally `.cjs` so Electron's main process can
// require() it without ESM/CJS dance. The server itself is TS and
// runs via `node --experimental-strip-types` in the child (the Node
// version bundled with Electron 35+ supports type stripping natively).

const { app, BrowserWindow, dialog, shell, Menu } = require('electron')
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

let serverProcess = null
let mainWindow = null
let serverPort = null

/**
 * Find a free port on 127.0.0.1 by binding to port 0 and letting
 * the OS pick.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

/**
 * Project root differs in dev vs packaged. In dev it's the repo
 * root. In a packaged .dmg the app code is inside
 * `Resources/app.asar` (or `app.asar.unpacked` for files we need
 * to access on the filesystem).
 */
function projectRoot() {
  if (app.isPackaged) {
    // electron-builder places resources under process.resourcesPath
    // and our package.json `directories.app` setting puts the app
    // contents one level down.
    return path.join(process.resourcesPath, 'app.asar')
  }
  return path.join(__dirname, '..')
}

async function startServer() {
  serverPort = await findFreePort()
  const root = projectRoot()

  // Use Electron's own binary running as plain Node via
  // ELECTRON_RUN_AS_NODE so we don't depend on a system Node install
  // on the user's Mac.
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(serverPort),
    OFFLINE_MODE: 'true',
    NODE_ENV: 'production',
    COOKIE_SESSION_SECRET: 'streetmix-electron-local-only',
  }

  serverProcess = spawn(
    process.execPath,
    ['--experimental-strip-types', 'index.ts'],
    {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  serverProcess.stdout.on('data', (d) => {
    process.stdout.write(`[server] ${d}`)
  })
  serverProcess.stderr.on('data', (d) => {
    process.stderr.write(`[server-err] ${d}`)
  })
  serverProcess.on('exit', (code) => {
    console.log(`[server] exited with code ${code}`)
    if (mainWindow !== null) app.quit()
  })

  await waitForReady(serverPort, 30_000)
}

function waitForReady(port, timeoutMs) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ port, host: '127.0.0.1' }, () => {
        sock.end()
        resolve()
      })
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server did not start within ' + timeoutMs + 'ms'))
          return
        }
        setTimeout(tryOnce, 250)
      })
    }
    tryOnce()
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Streetmix+ Innovation',
    backgroundColor: '#f4f1ec',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Open external links in the user's browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('http://127.0.0.1') ||
      url.startsWith(`http://localhost`)
    ) {
      return { action: 'allow' }
    }
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`)
}

app.whenReady().then(async () => {
  try {
    await startServer()
    await createWindow()

    // macOS — re-create window on dock click if all closed
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    dialog.showErrorBox(
      'Streetmix+ failed to start',
      err && err.stack ? err.stack : String(err)
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('quit', () => {
  if (serverProcess !== null && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
})
