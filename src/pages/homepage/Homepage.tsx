import React from 'react';
import { Link } from 'react-router-dom';
import './Homepage.css';
import SEO from '../../components/SEO';
import { Eyebrow } from '../../components/ui/Typography';

interface HomepageProps {
  availableHeight: number;
}

const Homepage: React.FC<HomepageProps> = ({ availableHeight: _availableHeight }) => {
  return (
    <main className="homepage">
      <SEO title="Koinonia Coffee Project" description="Specialty coffee, community, and mobile coffee cart experiences from Koinonia Coffee Project." path="/" structuredData={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Koinonia Coffee Project',
        url: 'https://koinoniacoffeeproject.com/',
        logo: 'https://koinoniacoffeeproject.com/assets/logos/logo_square.png',
        sameAs: ['https://www.instagram.com/koinoniacoffeeproject'],
      }} />
      <section className="homepage-hero">
        <video className="homepage-hero-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
          <source src="/assets/images/Banner.mp4" type="video/mp4" />
        </video>
        <div className="homepage-hero-overlay" />
        <div className="homepage-hero-copy">
          <img className="homepage-hero-logo" src="/assets/logos/koinoniacp_logomark-black.svg" alt="Koinonia Coffee Project" />
          <h1>Cultivating community, <br />one cup at a time.</h1>
          <p className="hero-description">From carefully roasted beans to a coffee cart that meets people where they are, Koinonia uses coffee to make room for meaningful connection.</p>
          <Link className="button-link" to="/about">EXPLORE KOINONIA</Link>
        </div>
      </section>

      <section className="homepage-about" id="homepage-content">
        <div className="about-art"><img src="/assets/images/koinonia-49-1.png" alt="Koinonia coffee and community" /></div>
        <div className="about-copy"><div className="word-note"><strong className="word-note-term">κοινωνία</strong><span className="word-note-details">[koy-nohn-ee'-ah]</span><strong className="word-note-definition"><em>(n.) communion, fellowship</em></strong></div><p className="mission-copy">Koinonia Coffee Project exists to create spaces for meaningful connection through the joy of good coffee.</p><Link to="/about" className="text-link">LEARN MORE ABOUT KOINONIA</Link></div>
      </section>

      <section className="homepage-pillars">
        <article className="pillar"><Eyebrow>02 / CATERING</Eyebrow><h2>Plan your next event with Koinonia.</h2><p>Enjoy excellent beverages and services at your event.</p><Link to="/catering" className="text-link">BOOK NOW</Link></article>
        <article className="pillar"><Eyebrow>02 / ROASTERY</Eyebrow><h2>Enjoy your morning coffee from the first sip to the last.</h2><p>Specialty coffee, roasted with your enjoyment in mind. Whether you're a home barista or you're just looking to up your coffee game, there's a coffee for everyone.</p><Link to="/shop" className="text-link">SHOP COFFEE</Link></article>
        <article className="pillar"><Eyebrow>03 / EVENTS</Eyebrow><h2>Join us on our next adventure.</h2><p>From pop-ups to everyday moments, see what we're up to next.</p><Link to="/events" className="text-link">SEE THE CALENDAR</Link></article>
      </section>

      {/* <section className="homepage-catering">
        <div className="catering-intro"><p className="eyebrow">COME SAY HELLO</p><h2>Meet us around<br />town.</h2><p>Find the cart at our next pop-up, market, or community gathering.</p></div>
        <div className="catering-list"><div className="catering-row"><span>SEP 14</span><strong>Sunday Market</strong><span>TORONTO, CA</span></div><div className="catering-row"><span>SEP 21</span><strong>Community Coffee</strong><span>TORONTO, CA</span></div><div className="catering-row"><span>OCT 04</span><strong>Fall Gathering</strong><span>TORONTO, CA</span></div><Link to="/catering" className="text-link">VIEW CATERING</Link></div>
      </section> */}
    </main >
  );
};

export default Homepage;
