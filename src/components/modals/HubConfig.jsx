import React, { Component } from 'react';
import { branch } from 'baobab-react/higher-order';

import Edit from '@material-ui/icons/Edit';
import Check from '@material-ui/icons/Check';
import Close from '@material-ui/icons/Close';

import { branch as actionsWrapper } from '../high-order/actions';

class HubConfig extends Component {
  constructor() {
    super();
    this.edit = this.edit.bind(this);
    this.rename = this.rename.bind(this);
    this.cancel = this.cancel.bind(this);
    this.close = this.close.bind(this);

    this.input = null;

    this.state = {
      editMode: false,
    };
  }

  edit() {
    this.setState({ editMode: true });
    setTimeout(() => this.input.focus());
  }

  rename() {
    const { uuid, actions } = this.props;
    this.setState({ editMode: false });
    actions.hubs.rename({
      uuid,
      name: this.input.value,
    });
  }

  cancel() {
    const { uuid, actions } = this.props;
    const { name } = actions.hubs.selectByUuid({ uuid }).get();
    this.input.value = name;
    this.setState({ editMode: false });
  }

  close() {
    const { actions } = this.props;
    actions.navigation.closeModal();
  }

  render() {
    const { editMode } = this.state;
    const { uuid, actions } = this.props;
    const { mac, name, system } = actions.hubs.selectByUuid({ uuid }).get();

    return (
      <div className="modal-content hub">
        <div className="modal-header">
          <h4>{ mac }</h4>
        </div>
        <form className="modal-body">
          <div className="form-group row">
            <label
              className="col-3 col-form-label"
              htmlFor="name"
            >
              Name
            </label>
            <div className="input-group col-9">
              <input
                id="name"
                className="form-control"
                type="text"
                defaultValue={ name }
                disabled={ !editMode }
                ref={ i => { this.input = i; } }
                maxLength="14"
              />
              <div className="input-group-append">
                {
                  editMode
                    ? [
                      (
                        <button
                          key="cancel"
                          className="btn btn-outline-danger"
                          type="button"
                          onClick={ this.cancel }
                        >
                          <Close />
                        </button>
                      ),
                      (
                        <button
                          key="confirm"
                          className="btn btn-outline-success"
                          type="button"
                          onClick={ this.rename }
                        >
                          <Check />
                        </button>
                      ),
                    ]
                    : (
                      <button
                        key="edit"
                        className="btn btn-outline-primary"
                        type="button"
                        onClick={ this.edit }
                      >
                        <Edit />
                      </button>
                    )
                }
              </div>
            </div>
          </div>
          <div className="form-group row">
            <label
              className="col-3 col-form-label"
              htmlFor="firmware"
            >
              Firmware
            </label>
            <div className="col-9">
              <input
                id="firmware"
                type="text"
                disabled
                className="form-control"
                defaultValue={ system.firmware }
              />
            </div>
          </div>
          <div className="form-group row">
            <label
              className="col-3 col-form-label"
              htmlFor="current"
            >
              Current
            </label>
            <div className="col-9">
              <input
                id="current"
                type="text"
                disabled
                className="form-control"
                defaultValue={ system.current }
              />
            </div>
          </div>
          <div className="form-group row">
            <label
              className="col-3 col-form-label"
              htmlFor="voltage"
            >
              Voltage
            </label>
            <div className="col-9">
              <input
                id="voltage"
                type="text"
                disabled
                className="form-control"
                defaultValue={ system.voltage }
              />
            </div>
          </div>
        </form>
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
  hubs: ['hubs'],
}, actionsWrapper(['hubs', 'navigation'], HubConfig));
