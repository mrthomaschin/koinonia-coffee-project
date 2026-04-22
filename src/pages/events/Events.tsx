import React from 'react';
import './Events.css';
import { FlashquotesEmbed } from '../../components/FlashquotesEmbed';

interface EventsProps {
  availableHeight: number;
}

const TextSection: React.FC = () => {
  return (
    <div className="events-text-section">
      <h1 className="events-title">Host your event with great coffee.</h1>
      <p className="events-description">
        Koinonia Coffee Project is proud to bring coffee and community to you. As a mobile coffee cart, we serve quality drinks at rapid speeds, providing you with the best experience for your event. Fill out this form to get a quote and we'll get back to you shortly!
      </p>

      <h2 className="events-subtitle">What's Included</h2>
      <p className="events-description">
        All ingredients & materials covered<br />
        Unlimited drinks during service window<br />
        Fast, professional service to accommodate for all guests<br />
        Fully self-contained mobile coffee cart (no external power required — can be set up anywhere)<br />
        Setup & Tear-down time/labor included
      </p>

      <h2 className="events-subtitle">Espresso Bar (Standard in All Packages)</h2>
      <p className="events-description">
        Lattes & Americanos (Iced/Hot)<br />
        Whole & Oat Milk<br />
        Vanilla Syrup<br />
        Hot Chocolate (non-caffeine option)
      </p>

      <h2 className="events-subtitle">Add Ons</h2>
      <p className="events-description">
        Matcha Bar<br />
        Additional hours
      </p>
    </div>
  );
};

const Events: React.FC<EventsProps> = ({ availableHeight }) => {
  return (
    <div className="events-container" style={{ minHeight: availableHeight }}>
      <div className="events-content">
        <div className="events-left">
          <TextSection />
        </div>
        <div className="events-right">
          <FlashquotesEmbed />
        </div>
      </div>
    </div>
  );
};

export default Events;
