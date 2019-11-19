import React, { Component } from 'react';
import { transform, includes } from 'lodash';
import { branch } from 'baobab-react/higher-order';

import { branch as actionsWrapper } from '../high-order/actions';
import resize from '../high-order/resize';

import Control, { components } from '../modules/controls/Control';
import Size from '../modules/controls/Size';

class CreateControl extends Component {
  constructor() {
    super();
    this.setControl = this.setControl.bind(this);
    this.close = this.close.bind(this);

    this.state = {
      control: null,
    };
  }

  getHub() {
    const { mac, actions } = this.props;
    return actions.hubs.selectByMac({ mac }).get() || {};
  }

  getDevice() {
    const { mac, portName: port, actions } = this.props;
    return actions.devices.select({ mac, port }).get() || {};
  }

  getCompatibleControls() {
    const device = this.getDevice();

    // get compatible controls with selected device (by type)
    const controls = transform(
      components,
      (proposals, { devices }, controlType) => {
        devices.forEach((input, index) => {
          if (includes(input.type, device.type.num)) {
            const proposalDevices = [];
            proposalDevices[index] = {
              mac: device.mac,
              port: device.port,
            };

            proposals.push({
              type: controlType,
              devices: proposalDevices,
            });
          }
        });

        return proposals;
      },
      []
    );

    return controls;
  }

  setControl(control) {
    this.setState({ control });
  }

  setSize(size) {
    const { actions } = this.props;
    const { control } = this.state;

    actions.grid.addControl(
      { control: { ...control, ...size } },
      () => {
        actions.navigation.closeModal();
      }
    );
  }

  close() {
    const { actions } = this.props;
    actions.navigation.closeModal();
  }

  renderControlSelect(unit) {
    const controls = this.getCompatibleControls();

    if (!controls.length) {
      return <div>No control availlable for this device.</div>;
    }

    return controls.map(control => (
      <button
        key={ control.type }
        type="button"
        onClick={ () => this.setControl(control) }
      >
        <Control
          unit={ unit }
          x={ 0 }
          y={ 0 }
          w={ 1 }
          h={ 1 }
          { ...control }
        />
      </button>
    ));
  }

  renderSizeSelect(unit) {
    const { control } = this.state;
    const { actions } = this.props;
    const maxSizes = actions.grid.getMaxSizes();


    return components[control.type].sizes
      .filter(size => maxSizes[size.h] >= size.w)
      .map(size => (
        <button
          key={ `${size.w}-${size.h}` }
          type="button"
          onClick={ () => this.setSize(size) }
        >
          <Size
            unit={ unit }
            x={ 0 }
            y={ 0 }
            { ...size }
          />
        </button>
      ));
  }

  render() {
    const { control } = this.state;
    const hub = this.getHub();
    const device = this.getDevice();
    const unit = Math.max(Math.min(window.innerWidth / 10, 200), 100);

    return (
      <div className="modal-content control-add">
        <div className="modal-header">
          <h4>{ `${hub.name} > ${device.port}` }</h4>
        </div>
        <div className="modal-body">
          {
            control
              ? this.renderSizeSelect(unit)
              : this.renderControlSelect(unit)
          }
        </div>
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

export default branch(
  {
    devices: ['devices'],
  },
  actionsWrapper(
    ['navigation', 'devices', 'hubs', 'grid'],
    resize(CreateControl)
  )
);
