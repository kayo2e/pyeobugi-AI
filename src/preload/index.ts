import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('pyeobugi', { platform: process.platform })
