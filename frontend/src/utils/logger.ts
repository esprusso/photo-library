const DEBUG = ((import.meta as any)?.env?.VITE_DEBUG === 'true')

type LogMethod = (...args: any[]) => void

const noop: LogMethod = () => {}

const logger = {
  debug: DEBUG ? console.debug.bind(console) : noop,
  info: DEBUG ? console.info?.bind(console) || console.log.bind(console) : noop,
  warn: DEBUG ? console.warn.bind(console) : noop,
  error: DEBUG ? console.error.bind(console) : noop,
}

export default logger