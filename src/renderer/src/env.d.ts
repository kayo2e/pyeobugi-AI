import type { PyeobugiApi } from '../../shared/ipc'

declare global {
  interface Window {
    pyeobugi: PyeobugiApi
  }
}
