import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AppEvent } from '../shared/events'
import { IPC } from '../shared/ipc'
import type { PyeobugiApi } from '../shared/ipc'

const subscribe = <T extends unknown[]>(channel: string, listener: (...args: T) => void) => {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: PyeobugiApi = {
  sendTransitions: (transitions) => ipcRenderer.send(IPC.transitions, transitions),
  calibrationCompleted: (isRecalibration) => ipcRenderer.send(IPC.calibrated, isRecalibration),
  onResetEngine: (listener) => subscribe(IPC.resetEngine, listener),
  onEvent: (listener) => subscribe<[AppEvent]>(IPC.eventEmitted, listener),
}

contextBridge.exposeInMainWorld('pyeobugi', api)
