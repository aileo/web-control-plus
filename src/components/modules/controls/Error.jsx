import React from 'react';

export default props => {
  const { errors } = props;

  return (
    <div className="error control-display">
      <div style={ { fontSize: '1rem' } }>
        {
          errors.map(({ id, label, code }) => (
            <p key={ `err-${id}` }>
              { `${label}: ${code}` }
            </p>
          ))
        }
      </div>
    </div>
  );
};
