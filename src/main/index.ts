import { app, BrowserWindow, ipcMain, powerMonitor, session, systemPreferences } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AppEvent } from '../shared/events'
import { IPC } from '../shared/ipc'
import type { Transition } from '../shared/posture/engine'
import { createApiClient } from './api/client'
import { loadOrCreateDeviceId } from './device'
import { toReportResult } from './report'
import { createFileQueueStore } from './queue/queue-store'
import { createSender } from './queue/sender'
import { createUsageTracker } from './usage/tracker'

const MOCK_BASE_URL = 'https://api.pyeobugi.mock'
const QUIT_FLUSH_MS = 1500
const REPORT_FLUSH_MS = 2000

const baseUrl = import.meta.env.MAIN_VITE_API_BASE_URL ?? MOCK_BASE_URL
const userData = app.getPath('userData')
const api = createApiClient(baseUrl, loadOrCreateDeviceId(userData))
const sender = createSender(createFileQueueStore(userData), api.postEvents)

let mainWindow: BrowserWindow | null = null
let quitting = false

const emit = (event: AppEvent): void => {
  sender.enqueue(event)
  if (import.meta.env.DEV) console.log('[event]', JSON.stringify(event))
  // Closing the window flushes the last segment after its webContents is gone; sending then throws and aborts quit
  if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(IPC.eventEmitted, event)
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
    mainWindow = null
    tracker.stop()
  })

  if (process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.on(IPC.transitions, (_event, transitions: Transition[]) => {
  if (!quitting) tracker.transitions(transitions)
})
ipcMain.on(IPC.calibrated, (_event, isRecalibration: boolean) =>
  tracker.record({ type: 'CALIBRATION_COMPLETED', payload: { isRecalibration } }),
)

ipcMain.handle(IPC.getReport, async () => {
  // The spec closes the open segment and flushes before reading, so the report includes the last minute
  tracker.flush()
  await sender.flush(REPORT_FLUSH_MS)
  const result = toReportResult(await api.getSummary())
  if (!result.ok) console.error('[report] failed', result.status, result.code, `traceId=${result.traceId ?? '-'}`)
  return result
})

app.whenReady().then(async () => {
  if (import.meta.env.DEV && baseUrl === MOCK_BASE_URL) {
    const { startMockServer } = await import('./mock/server')
    startMockServer(MOCK_BASE_URL)
  }
  sender.start()
  void sender.send()

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

app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  tracker.stop()
  tracker.record({ type: 'SESSION_END', payload: {} })
  sender.stop()
  // Unsent events stay in the persistent queue and go out on the next launch. exit() instead of a second quit():
  // re-entering quit after preventDefault stalls on macOS once the windows close
  void sender.flush(QUIT_FLUSH_MS).finally(() => app.exit(0))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
