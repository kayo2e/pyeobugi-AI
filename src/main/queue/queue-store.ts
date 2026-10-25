import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppEvent } from '../../shared/events'

export type QueueStore = { load: () => AppEvent[]; save: (queue: AppEvent[]) => void }

export const createFileQueueStore = (dir: string): QueueStore => {
  const file = join(dir, 'event-queue.json')
  return {
    load: () => {
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
        return Array.isArray(parsed) ? (parsed as AppEvent[]) : []
      } catch {
        return []
      }
    },
    save: (queue) => {
      // Write-then-rename so a crash mid-write never leaves a truncated queue
      writeFileSync(`${file}.tmp`, JSON.stringify(queue))
      renameSync(`${file}.tmp`, file)
    },
  }
}
