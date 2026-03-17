// Logger que solo imprime en modo desarrollo
// En producción (EAS build) los logs se suprimen automáticamente

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: any[]) => { if (isDev) console.log(...args); },
  warn: (...args: any[]) => { if (isDev) console.warn(...args); },
  error: (...args: any[]) => {
    // Los errores siempre se loguean (incluso en producción)
    // En el futuro aquí se puede conectar Sentry o similar
    console.error(...args);
  },
  info: (...args: any[]) => { if (isDev) console.info(...args); },
};
