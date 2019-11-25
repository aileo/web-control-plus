import React, { Component } from 'react';
import { branch } from 'baobab-react/higher-order';

import { branch as actionsWrapper } from '../high-order/actions';

class HubConfig extends Component {
  constructor() {
    super();
    this.close = this.close.bind(this);
  }

  close() {
    const { actions } = this.props;
    actions.navigation.closeModal();
  }

  render() {
    return (
      <div className="modal-content control-modal">
        <div className="modal-header">
          <h4>Control configuration</h4>
        </div>
        <form className="modal-body" />
        <div className="modal-footer">
          <button
            className="btn btn-primary"
            type="button"
            onClick={ this.close }
          >
            Close
          </button>
        </div>
      </div>
    );
  }
}

export default branch({
  controls: ['controls'],
}, actionsWrapper(['controls', 'navigation'], HubConfig));
