import React from 'react';
import './Events.css';
import { FlashquotesEmbed } from '../../components/FlashquotesEmbed';

interface EventsProps {
  availableHeight: number;
}

const Events: React.FC<EventsProps> = ({ availableHeight }) => {
  return (
    <div className="events-container" style={{ height: availableHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <FlashquotesEmbed />
    </div>
  );
};

export default Events;
