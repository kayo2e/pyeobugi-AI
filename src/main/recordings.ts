import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Recording } from '../shared/recording'

export const recordingsDir = (userData: string): string => {
  const dir = join(userData, 'recordings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const saveRecording = (userData: string, recording: Recording): string => {
  const stamp = recording.startedAt.replace(/[:+]/g, '').replace('T', '-').slice(0, 17)
  const file = join(recordingsDir(userData), `${stamp}-${recording.label.toLowerCase()}.json`)
  writeFileSync(file, JSON.stringify(recording))
  return file
}
