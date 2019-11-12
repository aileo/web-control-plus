
export default {
  /**
   * Open modal and store contextual information
   * @param {String} name
   * @param {Object} context
   */
  openModal({ state }, { name, context }) {
    state.set(['navigation', 'modal'], { name, context });
  },

  /**
   * Close open modal if any
   */
  closeModal({ state }) {
    state.set(['navigation', 'modal'], { name: null, context: {} });
  },
};
