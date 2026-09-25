export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export const consoleLogger: Logger = {
  info: (message) => console.info(`[easy-cms] ${message}`),
  warn: (message) => console.warn(`[easy-cms] ${message}`),
  error: (message) => console.error(`[easy-cms] ${message}`),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }
