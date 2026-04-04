const { app, BrowserWindow, nativeTheme, systemPreferences, Menu, ipcMain, screen, powerMonitor, shell, Tray } = require('electron')
const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { addDisplayChangeListener } = require("win32-displayconfig")
const Color = require('color')

// --- Constants & Global State ---
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

// --- Initialization ---
const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.exit()
} else {
  app.on('second-instance', () => { if (panelWindow) toggleTray(true); })
}

app.on('ready', () => {
  loadSettings()
  startMonitorThread()
  createTray()
  addEventListeners()
  refreshMonitors(true)
})

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
  monitorsThread = fork(path.join(__dirname, 'monitors.js'), [isDev ? '--isdev=true' : ''], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
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
      nodeIntegration: false
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
      additionalArguments: ["jsVars" + Buffer.from(JSON.stringify({ settings, settingsPath, appName: "Twinkle Tray Private" })).toString('base64')]
    }
  })
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
  tray.setToolTip('Twinkle Tray Private')
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
  if (monitorsThread) monitorsThread.send({ type: 'brightness', id, brightness })
})

ipcMain.on('save-settings', (event, newSettings) => {
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
