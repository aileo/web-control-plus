import React from 'react';
import { branch } from 'baobab-react/higher-order';
import AddCircle from '@material-ui/icons/AddCircle';

import PureRenderComponent from '../../utils/PureRender';
import { branch as actionsWrapper } from '../../high-order/actions';

import Hub from './Hub';

class HubList extends PureRenderComponent {
  constructor() {
    super();
    this.add = this.add.bind(this);
  }

  add() {
    const { actions } = this.props;
    actions.hubs.add();
  }

  render() {
    const { hubs } = this.props;
    return (
      <div className="hubs list-group">
        {
          [

            <button
              key="add"
              type="button"
              className="list-group-item add"
              onClick={ this.add }
            >
              <AddCircle />
            </button>,
          ].concat(
            hubs.map(hub => <Hub key={ hub.uuid } { ...hub } />)
          )
        }
      </div>
    );
  }
}

export default branch({
  hubs: ['hubs'],
}, actionsWrapper(['hubs'], HubList));
