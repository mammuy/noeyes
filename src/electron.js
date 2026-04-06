const { app, BrowserWindow, nativeTheme, systemPreferences, Menu, ipcMain, screen, powerMonitor, Tray, session } = require('electron')
const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { addDisplayChangeListener } = require("win32-displayconfig")
const Color = require('color')
const Logger = require('./Logger')

// --- Configuration & State ---
const isDev = app.commandLine.hasSwitch("dev")
const configFilesDir = app.getPath("userData")
const settingsPath = path.join(configFilesDir, `settings${isDev ? "-dev" : ""}.json`)
const knownDisplaysPath = path.join(configFilesDir, `known-displays${isDev ? "-dev" : ""}.json`)

let settings = {
  theme: "dark",
  updateInterval: 500,
  isDev: isDev,
  names: {},
  order: [],
  remaps: {}
}

let monitors = {}
let tray = null
let panelWindow = null
let settingsWindow = null
let monitorsThread = null


// 2. Global Session-Level Network Block (Kill-Switch)
// This applies to the entire application session.
app.on('ready', () => {
  // 1. Global Session-Level Network Block (Kill-Switch)
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = details.url;
    // Only allow local file access and localhost (for development)
    if (url.startsWith('file://') || url.startsWith('http://localhost') || url.startsWith('ws://localhost')) {
      callback({ cancel: false });
    } else {
      Logger.warn(`Blocked external request: ${url}`);
      callback({ cancel: true });
    }
  });

  // 2. Global CSP Hardening (Applies to all windows in the session)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline';"]
      }
    })
  })

  Logger.info("Application starting up with full network isolation and CSP enabled.")
  loadSettings()
  startMonitorThread()
  createTray()
  addEventListeners()
  refreshMonitors(true)
})

// 3. Single Instance Lock
const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.exit()
} else {
  app.on('second-instance', () => { if (panelWindow) toggleTray(true); })
}

app.on('window-all-closed', (e) => e.preventDefault())

// --- Core Functions ---

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath))
      settings = { ...settings, ...data }
    }
  } catch (e) { console.error("Failed to load settings", e) }
}

function saveSettings(newSettings = {}) {
  settings = { ...settings, ...newSettings }
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    sendToAllWindows('settingsUpdated', settings)
  } catch (e) { console.error("Failed to save settings", e) }
}

function startMonitorThread() {
  monitorsThread = fork(path.join(__dirname, 'Monitors.js'), [isDev ? '--isdev=true' : ''], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
  monitorsThread.on('message', (data) => {
    if (data.type === 'refreshMonitors') {
      monitors = data.monitors
      sendToAllWindows('monitorsUpdated', monitors)
    }
  })
  monitorsThread.send({ type: 'settings', settings })
}

async function refreshMonitors(full = false) {
  if (monitorsThread) {
    monitorsThread.send({ type: 'refreshMonitors', fullRefresh: full })
  }
}

// --- Windows ---

function createPanel() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  panelWindow = new BrowserWindow({
    width: 350,
    height: 500,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  })


  panelWindow.loadURL(isDev ? "http://localhost:3000/index.html" : `file://${path.join(__dirname, "../build/index.html")}`)
  panelWindow.on('blur', () => panelWindow.hide())
}

function toggleTray(forceShow = false) {
  if (!panelWindow) createPanel()
  if (panelWindow.isVisible() && !forceShow) {
    panelWindow.hide()
  } else {
    const trayBounds = tray.getBounds()
    const { width, height } = panelWindow.getBounds()
    panelWindow.setPosition(trayBounds.x - (width / 2) + (trayBounds.width / 2), trayBounds.y - height - 10)
    panelWindow.show()
  }
}

function createSettings() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
      additionalArguments: ["jsVars" + Buffer.from(JSON.stringify({ settings, settingsPath, appName: "Curtin" })).toString('base64')]
    }
  })
  
  // Navigation & New Window Hardening
  const blockNavigation = (e, url) => {
    if (url.startsWith('file://') || (isDev && url.startsWith('http://localhost'))) return;
    e.preventDefault();
    Logger.warn(`Blocked navigation attempt to: ${url}`);
  };
  settingsWindow.webContents.on('will-navigate', blockNavigation);
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    Logger.warn(`Blocked attempt to open new window for: ${url}`);
    return { action: 'deny' };
  });
  settingsWindow.loadURL(isDev ? "http://localhost:3000/settings.html" : `file://${path.join(__dirname, "../build/settings.html")}`)
  settingsWindow.on('closed', () => settingsWindow = null)
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/logo.ico'))
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Refresh Monitors', click: () => refreshMonitors(true) },
    { label: 'Settings', click: createSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('Curtin')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleTray())
}

function sendToAllWindows(channel, data) {
  if (panelWindow) panelWindow.webContents.send(channel, data)
  if (settingsWindow) settingsWindow.webContents.send(channel, data)
}

// --- IPC Handlers ---

ipcMain.on('request-monitors', () => {
  if (monitorsThread) monitorsThread.send({ type: 'refreshMonitors' })
  sendToAllWindows('monitorsUpdated', monitors)
})

ipcMain.on('request-settings', () => {
  sendToAllWindows('settingsUpdated', settings)
})

ipcMain.on('update-brightness', (event, { id, brightness }) => {
  // Validate brightness parameters
  if (typeof id !== 'string' || typeof brightness !== 'number' || brightness < 0 || brightness > 100 || !Number.isFinite(brightness)) {
    Logger.error(`Invalid brightness parameters: id=${id}, brightness=${brightness}`)
    return
  }
  if (monitorsThread) monitorsThread.send({ type: 'brightness', id, brightness })
})

ipcMain.on('save-settings', (event, newSettings) => {
  // Validate settings object
  if (typeof newSettings !== 'object' || newSettings === null) {
    Logger.error('Invalid settings object received via save-settings')
    return
  }
  saveSettings(newSettings)
})

ipcMain.on('window-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win) win.close()
})

// --- System Events ---

function addEventListeners() {
  addDisplayChangeListener(() => refreshMonitors(true))
  powerMonitor.on('resume', () => {
    setTimeout(() => refreshMonitors(true), 5000)
  })
}
