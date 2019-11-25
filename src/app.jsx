import React from 'react';
import ReactDOM from 'react-dom';
import { root as baobabRoot } from 'baobab-react/higher-order';

import { root as actionRoot } from './components/high-order/actions';
import state from './core/state';
import clients from './core/clients';
import actions from './core/actions';
import bindings from './core/bindings';

import Layout from './components/Layout';

window.app = {
  clients,
  actions,
  state,
};

bindings(state, actions);

const Root = baobabRoot(state, actionRoot(actions, Layout));
ReactDOM.render(<Root />, document.getElementById('root'));
