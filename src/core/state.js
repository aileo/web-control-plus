import Baobab from 'baobab';

const state = new Baobab(
  {
    navigation: {
      page: 'main',
      modal: {
        name: null,
        context: {},
      },
    },
    hubs: [],
    devices: [],
    controls: [],
  },
  {
    cursorSingletons: false,
  }
);

export default state;
