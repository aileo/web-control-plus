/* eslint max-classes-per-file: off */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isArray, pick } from 'lodash';

export function root(actions, Wrapped) {
  const name = Wrapped.name || Wrapped.displayName || 'Component';

  const ComposedComponent = class extends Component {
    // Handling child context
    getChildContext() {
      return {
        actions,
      };
    }

    // Render shim
    render() {
      return <Wrapped { ...this.props } />;
    }
  };

  ComposedComponent.displayName = `ActionRoot${name}`;
  ComposedComponent.childContextTypes = {
    actions: PropTypes.object,
  };

  return ComposedComponent;
}

export function branch(_sections, Wrapped) {
  const sections = isArray(_sections) ? _sections : [_sections];
  const name = Wrapped.name || Wrapped.displayName || 'Component';

  class ComposedComponent extends Component {
    constructor() {
      super();

      this.displayName = `ActionBranch${name}`;
    }

    render() {
      const { actions } = this.context;
      return <Wrapped { ...this.props } actions={ pick(actions, sections) } />;
    }
  }

  ComposedComponent.contextTypes = {
    actions: PropTypes.object,
  };

  return ComposedComponent;
}
