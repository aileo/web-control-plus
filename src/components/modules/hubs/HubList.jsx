import React, { Component } from 'react';
import { branch } from 'baobab-react/higher-order';
import { values } from 'lodash';
import classnames from 'classnames';
import AddCircle from '@material-ui/icons/AddCircle';

import actionsWrapper from '../../../utils/mixin.actions.branch';

import Hub from './Hub';

class HubList extends Component {
  constructor() {
    super();
    this.add = this.add.bind(this);
  }

  add() {
    const { actions } = this.props;
    actions.hubs.add();
  }

  render() {
    const { hubs, classNames } = this.props;
    return (
      <div className={ classnames('hubs', 'list-group', classNames) }>
        {
          [
            (
              <button
                key="add"
                type="button"
                className="list-group-item add"
                onClick={ this.add }
              >
                <AddCircle />
              </button>
            ),
          ].concat(
            values(hubs)
              .filter(h => h)
              .map(hub => (<Hub key={ hub.uuid } { ...hub } />))
          )
        }
      </div>
    );
  }
}

export default branch({
  hubs: ['hubs'],
}, actionsWrapper(['hubs'], HubList));
