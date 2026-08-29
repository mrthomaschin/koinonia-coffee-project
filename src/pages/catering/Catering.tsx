import React from 'react';
import './Catering.css';
import { FlashquotesEmbed } from '../../components/FlashquotesEmbed';
import SEO from '../../components/SEO';

interface CateringProps {
  availableHeight: number;
}

const Catering: React.FC<CateringProps> = ({ availableHeight: _availableHeight }) => {
  return (
    <main className="catering-page">
      <SEO title="Mobile Coffee Cart Catering | Koinonia Coffee Project" description="Book Koinonia Coffee Project for weddings, markets, corporate events, and private gatherings with a mobile coffee cart." path="/catering" />
      <section className="catering-hero">
        <div className="catering-hero-copy">
          <p className="catering-eyebrow">BRING THE CART TO YOU</p>
          <h1>Host your event<br />with good coffee.</h1>
          <p>We bring quality coffee, thoughtful hospitality, and a little more room for connection to your next gathering.</p>
          <a className="catering-button" href="#catering-inquiry">START A CONVERSATION</a>
        </div>
        <div className="catering-cart-art" role="img" aria-label="Koinonia coffee cart illustration">
          <span>GOOD COFFEE / GOOD COMPANY</span>
        </div>
      </section>

      <section className="catering-introduction">
        <h2>A coffee<br />experience<br />people<br />remember.</h2>
        <p>Koinonia Coffee Project is proud to bring coffee and community to you. As a fully self-contained mobile coffee cart for weddings, markets, private gatherings, corporate events, and the moments in between. We take care of the coffee so you can stay present with your people.</p>
      </section>

      <section className="catering-pillars">
        <article><p className="catering-eyebrow">01 / HOSPITALITY</p><h3>Warm service</h3><p>Professional, welcoming, and built to keep the line moving without losing the human touch.</p></article>
        <article><p className="catering-eyebrow">02 / CRAFT</p><h3>Good coffee</h3><p>Lattes, Americanos, hot chocolate, and thoughtful add-ons made with quality ingredients.</p></article>
        <article><p className="catering-eyebrow">03 / EASE</p><h3>All handled</h3><p>Ingredients, materials, setup, tear-down, and service are included in one simple experience.</p></article>
      </section>

      <section className="catering-experience">
        <div className="experience-copy"><p className="catering-eyebrow">THE EXPERIENCE</p><h2>Everything you need,<br />thoughtfully covered.</h2><p>Our standard espresso bar includes hot and iced lattes and Americanos, whole and oat milk, vanilla syrup, and a non-caffeinated hot chocolate option.</p></div>
        <div className="experience-details">
          <div><strong>Espresso bar</strong><span>Included</span></div>
          <div><strong>Unlimited drinks</strong><span>During service</span></div>
          <div><strong>Matcha bar</strong><span>Add-on</span></div>
          <div><strong>Additional hours</strong><span>Add-on</span></div>
          <div><strong>Typical range</strong><span>$700–$2,500</span></div>
        </div>
      </section>

      <section className="catering-inquiry" id="catering-inquiry">
        <div className="inquiry-copy"><p className="catering-eyebrow">LET&apos;S GATHER</p><h2>Tell us about your<br />event.</h2><p>Share a few details and we&apos;ll follow up with a custom quote for your gathering.</p></div>
        <div className="catering-form-embed"><FlashquotesEmbed /></div>
      </section>
    </main>
  );
};

export default Catering;
