const config = {
  level: 7,
  colors: {
    date: 'gray',
    message: 'black',
    details: 'gray',
  },
};

const levels = {
  emerg: 'magenta',
  alert: 'magenta',
  crit: 'magenta',
  error: 'red',
  warning: 'orrange',
  notice: 'green',
  info: 'blue',
  debug: 'gray',
};

const helpers = {
  /**
   * Get logging level from name
   * @param {String} search
   */
  getLevelFromName(search) {
    return Object.keys(levels).reduce(
      (result, name, level) => (search === name ? level : result),
      Object.keys(levels).length
    );
  },

  /**
   * Get current date
   */
  now() {
    return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  },

  /**
   * Log message at level with details
   * @param {String} level
   * @param {String} message
   * @param {Object} details
   */
  log(level, message, details) {
    if (helpers.getLevelFromName(level) > config.level) {
      return undefined;
    }
    const colors = [
      config.colors.date,
      levels[level],
      config.colors.message,
    ];
    const parts = [helpers.now(), `[${level}]`, message];

    return window.console.log.apply(
      window.console.log,
      [
        parts.map(part => `%c${part}`).join(' '),
      ].concat(
        colors.map(color => `color: ${color}`)
      ).concat(details)
    );
  },
};

/**
 * Set logger level by name
 * @param {String} name
 */
export function setLevel(name) {
  config.level = helpers.getLevelFromName(name);
}

/**
 * Export shorthands to log at differents levels
 */
export default Object.keys(levels).reduce(
  (logger, key) => {
    logger[key] = (message, ...details) => {
      helpers.log(key, message, details.length ? details : null);
    };
    return logger;
  },
  {}
);
