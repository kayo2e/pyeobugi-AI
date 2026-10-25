import { app, BrowserWindow, session, systemPreferences } from 'electron'
import { join } from 'node:path'

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    title: '펴부기',
    webPreferences: { preload: join(__dirname, '../preload/index.js') },
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'))
  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('camera')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
