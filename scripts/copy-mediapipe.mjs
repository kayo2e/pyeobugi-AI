import { cpSync, existsSync } from 'node:fs'

const src = 'node_modules/@mediapipe/tasks-vision/wasm'
if (existsSync(src)) cpSync(src, 'src/renderer/public/mediapipe', { recursive: true })
