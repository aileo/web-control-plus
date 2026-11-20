type LogLevel =
  | 'emerg'
  | 'alert'
  | 'crit'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug';
type Logger = Record<
  LogLevel,
  (message: string, ...details: unknown[]) => void
>;

const config = {
  level: 7,
  colors: {
    date: 'gray',
    message: 'black',
    details: 'gray',
  },
};

const levels: Record<LogLevel, string> = {
  emerg: 'magenta',
  alert: 'magenta',
  crit: 'magenta',
  error: 'red',
  warning: 'orrange',
  notice: 'green',
  info: 'blue',
  debug: 'gray',
};

const levelNames = Object.keys(levels) as LogLevel[];

const helpers = {
  // Resolve a named log level to its numeric threshold.
  getLevelFromName(search: string): number {
    return levelNames.reduce(
      (result, name, level) => (search === name ? level : result),
      levelNames.length
    );
  },

  // Format the current time for log output.
  now(): string {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  },

  // Write a message when it meets the configured log threshold.
  log(
    level: LogLevel,
    message: string,
    details: readonly unknown[] = []
  ): void {
    if (helpers.getLevelFromName(level) > config.level) return;
    const colors = [config.colors.date, levels[level], config.colors.message];
    const parts = [helpers.now(), `[${level}]`, message];
    const output: unknown[] = [
      parts.map((part) => `%c${part}`).join(' '),
      ...colors.map((color) => `color: ${color}`),
      ...details,
    ];
    window.console.log(...output);
  },
};

// Set the logger's minimum output level by name.
export function setLevel(name: string): void {
  config.level = helpers.getLevelFromName(name);
}

const logger = Object.fromEntries(
  levelNames.map((level) => [
    level,
    (message: string, ...details: unknown[]) =>
      helpers.log(level, message, details),
  ])
) as Logger;

export default logger;
