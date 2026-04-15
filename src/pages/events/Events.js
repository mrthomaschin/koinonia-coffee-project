import React from 'react';
import './Events.css';

const Events = ({ availableHeight }) => {
  return (
    <div className="events-page" style={{ minHeight: availableHeight }}>
      <img
        src="/assets/images/DSCF3464.jpg"
        alt="Koinonia Coffee Project Events"
        className="events-image"
      />
    </div>
  );
};

export default Events;
