import React from 'react';
import { branch } from 'baobab-react/higher-order';

import modals from './modals/modals';

const Modal = ({ modal }) => {
  if (!modal.name || !modals[modal.name]) {
    return null;
  }
  const Element = modals[modal.name];

  return (
    <nav className="modal fade show">
      <div className="modal-dialog">
        <Element { ...modal.context } />
      </div>
    </nav>
  );
};

export default branch({
  modal: ['navigation', 'modal'],
}, Modal);
