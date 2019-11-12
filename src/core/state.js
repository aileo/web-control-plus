import Baobab from 'baobab';

const state = new Baobab({
  navigation: {
    page: 'main',
    modal: {
      name: null,
      context: {},
    },
  },
  hubs: {},
});

export default state;
