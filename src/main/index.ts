import { app, BrowserWindow, ipcMain, powerMonitor, session, systemPreferences } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AppEvent } from '../shared/events'
import { IPC } from '../shared/ipc'
import type { Transition } from '../shared/posture/engine'
import { createUsageTracker } from './usage/tracker'

let mainWindow: BrowserWindow | null = null

const outbox: AppEvent[] = []

const emit = (event: AppEvent): void => {
  outbox.push(event)
  console.log('[event]', JSON.stringify(event))
  mainWindow?.webContents.send(IPC.eventEmitted, event)
}

const tracker = createUsageTracker(randomUUID(), emit)

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    title: '펴부기',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), backgroundThrottling: false },
  })
  // Usage only counts while a renderer is detecting, so any reload or loss of the window closes the segment
  mainWindow.webContents.on('did-start-loading', () => {
    tracker.stop()
    tracker.start()
  })
  mainWindow.webContents.on('render-process-gone', () => tracker.stop())
  mainWindow.on('closed', () => {
    tracker.stop()
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.on(IPC.transitions, (_event, transitions: Transition[]) => tracker.transitions(transitions))
ipcMain.on(IPC.calibrated, (_event, isRecalibration: boolean) =>
  tracker.record({ type: 'CALIBRATION_COMPLETED', payload: { isRecalibration } }),
)

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'))
  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('camera')

  tracker.record({ type: 'SESSION_START', payload: {} })

  // Timers freeze during sleep, so close the segment first or the sleep time would be counted as usage
  powerMonitor.on('suspend', () => tracker.stop())
  powerMonitor.on('resume', () => {
    if (!mainWindow) return
    tracker.start()
    mainWindow.webContents.send(IPC.resetEngine)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  tracker.stop()
  tracker.record({ type: 'SESSION_END', payload: {} })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
