import { setupServer } from 'msw/node'
import { createHandlers } from './handlers'

export const startMockServer = (baseUrl: string): void => {
  setupServer(...createHandlers(baseUrl, { adoptUnknownDevices: true })).listen({ onUnhandledRequest: 'bypass' })
  console.log(`[mock] API mocked at ${baseUrl}`)
}
