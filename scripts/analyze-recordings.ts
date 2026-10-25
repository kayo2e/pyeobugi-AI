import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { analyze } from '../src/eval/analyze'
import { formatReport } from '../src/eval/format'
import type { Recording } from '../src/shared/recording'

const defaultDir = (): string =>
  process.platform === 'win32'
    ? join(process.env['APPDATA'] ?? '', 'pyeobugi-ai', 'recordings')
    : join(homedir(), 'Library', 'Application Support', 'pyeobugi-ai', 'recordings')

const expand = (path: string): string[] => {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(path, f))
}

const paths = (process.argv.length > 2 ? process.argv.slice(2) : [defaultDir()]).flatMap(expand)
if (paths.length === 0) {
  console.error('No recordings found. Record in the app (demo mode) or pass files/directories.')
  process.exit(1)
}

const recordings = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')) as Recording)
console.log(`Analyzed ${recordings.length} recordings\n`)
console.log(formatReport(analyze(recordings)))
