/**
 * Logger utilitário para serviços
 */

export class Logger {
  constructor(name) {
    this.name = name;
  }

  info(message) {
    console.log(`[${this.name}][INFO] ${message}`);
  }

  warn(message) {
    console.warn(`[${this.name}][WARN] ${message}`);
  }

  error(message) {
    console.error(`[${this.name}][ERROR] ${message}`);
  }

  debug(message) {
    if (process.env.DEBUG === 'true') {
      console.log(`[${this.name}][DEBUG] ${message}`);
    }
  }
}
