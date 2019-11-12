import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isArray, pick } from 'lodash';

export default function (_sections, WrapComponent) {
  const sections = isArray(_sections) ? _sections : [_sections];
  const name = WrapComponent.name || WrapComponent.displayName || 'Component';

  const ComposedComponent = class extends Component {
    constructor() {
      super();
      this.handleChildRef = this.handleChildRef.bind(this);
    }

    getDecoratedComponentInstance() {
      return this.decoratedComponentInstance;
    }

    handleChildRef(component) {
      this.decoratedComponentInstance = component;
    }

    // Render shim
    render() {
      const { actions } = this.context;
      return (
        <WrapComponent
          { ...this.props }
          actions={ pick(actions, sections) }
          ref={ this.handleChildRef }
        />
      );
    }
  };

  ComposedComponent.displayName = `ActionRoot${name}`;
  ComposedComponent.contextTypes = {
    actions: PropTypes.object,
  };

  return ComposedComponent;
}
