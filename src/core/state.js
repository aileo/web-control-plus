import Baobab, { monkey } from 'baobab';

const state = new Baobab({
  navigation: {
    page: {
      type: null,
      uuid: null,
      action: null,
    },
    modal: {
      name: null,
      context: {},
    },
  },
  page: monkey({
    cursors: {
      type: ['navigation', 'page', 'type'],
      action: ['navigation', 'page', 'action'],
    },
    get({ type, action }) {
      if (type) {
        if (action) {
          return `${type}-${action}`;
        }
        return type;
      }

      return 'default';
    },
  }),
  hubs: {},
});

export default state;
