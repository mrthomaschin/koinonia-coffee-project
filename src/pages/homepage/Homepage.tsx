import React from 'react';
import { Link } from 'react-router-dom';
import './Homepage.css';

interface HomepageProps {
  availableHeight: number;
}

const Homepage: React.FC<HomepageProps> = ({ availableHeight: _availableHeight }) => {
  return (
    <main className="homepage">
      <section className="homepage-hero">
        <div className="homepage-hero-copy">
          <h1>Cultivating community, <br />one cup at a time.</h1>
          <p className="hero-description">From carefully roasted beans to a coffee cart that meets people where they are, Koinonia uses coffee to make room for meaningful connection.</p>
          <Link className="button-link" to="/about">EXPLORE KOINONIA</Link>
        </div>
        <div className="coffee-cart-art"><img className="coffee-cart-photo" src="/assets/images/DSCF3464.jpg" alt="Koinonia coffee cart" /><span className="cart-label">KOINONIA / COFFEE CART</span></div>
      </section>

        <section className="homepage-pillars">
        <article className="pillar"><p className="eyebrow">01 / COMMUNITY</p><h2>Make room for people.</h2><p>Partnerships, gatherings, and a future storefront built around belonging.</p><Link to="/about" className="text-link">OUR STORY</Link></article>
        <article className="pillar"><p className="eyebrow">02 / ROASTERY</p><h2>Drink something<br />worth sharing.</h2><p>Thoughtful coffee, roasted with care and made to be enjoyed together.</p><Link to="/shop" className="text-link">SHOP COFFEE</Link></article>
        <article className="pillar"><p className="eyebrow">03 / COFFEE CART</p><h2>Find us in the wild.</h2><p>Pop-ups, markets, and everyday moments around the cart.</p><Link to="/events" className="text-link">SEE THE CALENDAR</Link></article>
      </section>

      <section className="homepage-about">
        <div className="about-copy"><div className="word-note"><strong className="word-note-term">κοινωνία</strong><span className="word-note-details">[koy-nohn-ee'-ah]</span><strong className="word-note-definition"><em>(n.) communion, fellowship</em></strong></div><p className="mission-copy">Koinonia Coffee Project exists to create spaces for meaningful connection through the joy of good coffee.</p><Link to="/about" className="text-link">LEARN MORE ABOUT KOINONIA</Link></div>
        <div className="about-art" aria-label="Soft abstract image placeholder" role="img"><span>PEOPLE / PLACE / PURPOSE</span></div>
      </section>

      {/* <section className="homepage-events">
        <div className="events-intro"><p className="eyebrow">COME SAY HELLO</p><h2>Meet us around<br />town.</h2><p>Find the cart at our next pop-up, market, or community gathering.</p></div>
        <div className="event-list"><div className="event-row"><span>SEP 14</span><strong>Sunday Market</strong><span>TORONTO, CA</span></div><div className="event-row"><span>SEP 21</span><strong>Community Coffee</strong><span>TORONTO, CA</span></div><div className="event-row"><span>OCT 04</span><strong>Fall Gathering</strong><span>TORONTO, CA</span></div><Link to="/events" className="text-link">VIEW ALL EVENTS</Link></div>
      </section> */}
    </main>
  );
};

export default Homepage;
