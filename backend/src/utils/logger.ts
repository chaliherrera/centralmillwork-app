import winston from 'winston'

const isProd = process.env.NODE_ENV === 'production'

// Logger central. En producción emite JSON (parseable por sistemas de logs
// externos), en desarrollo emite texto colorizado para legibilidad.
// Usalo así:
//   logger.info('algo pasó', { metadata: 'opcional', requestId: req.id })
//   logger.error('algo falló', { err })
//   logger.warn('aviso', {...})
export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
          return `${String(timestamp)} ${level}: ${String(message)}${metaStr}`
        }),
      ),
  transports: [
    new winston.transports.Console(),
  ],
})
