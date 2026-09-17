import React from 'react';
import './Catering.css';
import { FlashquotesEmbed } from '../../components/FlashquotesEmbed';
import SEO from '../../components/SEO';
import { Eyebrow } from '../../components/ui/Typography';

const cateringFaqs = [
  {
    question: 'Where do you cater?',
    answer: 'We cater events throughout the greater Los Angeles area, including Los Angeles County, Orange County, and the Inland Empire.',
  },
  {
    question: 'What kinds of events do you cater?',
    answer: 'Our mobile coffee cart is available for weddings, markets, corporate events, private gatherings, and more.',
  },
  {
    question: 'How do you price your packages?',
    answer: 'Pricing is tailored to your event based on service length, guest count, and destination. Add-ons can be included in your custom quote, along with the equipment, travel, and staffing needed for your event.',
  },
  {
    question: 'What add-ons are available?',
    answer: 'You can add a Matcha / Hojicha Bar, custom cups, portable power, or additional service hours. Share your preferences in the quote form and we’ll include them in your custom quote.',
  },
  {
    question: 'What is included in the coffee bar?',
    answer: 'Our standard espresso bar includes hot and iced lattes, mochas, Americanos, and hot chocolate, plus whole milk, oat milk, house-made vanilla syrup, and Lactaid. We provide the ingredients and materials and take care of setup, service, and tear-down.',
  },
  {
    question: 'Can you set up outside?',
    answer: 'Yes. Our mobile coffee cart can set up at outdoor events. Portable power is available when an outlet is not accessible.',
  },
  {
    question: 'How do I get a quote?',
    answer: 'Fill out the quote form with a few details about your event, and we’ll follow up with a custom quote.',
  },
];

const cateringStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Caterer',
    name: 'Koinonia Coffee Project',
    url: 'https://koinoniacoffeeproject.com/catering',
    image: 'https://koinoniacoffeeproject.com/assets/images/koinonia-29.jpg',
    description: 'Mobile coffee cart catering for weddings, corporate events, markets, and private gatherings in Los Angeles, Orange County, and the Inland Empire.',
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Los Angeles County' },
      { '@type': 'AdministrativeArea', name: 'Orange County' },
      { '@type': 'AdministrativeArea', name: 'Inland Empire' },
    ],
    serviceType: 'Mobile coffee cart catering',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: cateringFaqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  },
];

interface CateringProps {
  availableHeight: number;
}

const Catering: React.FC<CateringProps> = ({ availableHeight: _availableHeight }) => {
  const handleQuoteClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const inquirySection = document.getElementById('catering-inquiry');
    if (inquirySection) {
      const targetPosition = inquirySection.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  };

  return (
    <main className="catering-page">
      <SEO title="Coffee Cart Catering Los Angeles | Koinonia Coffee Project" description="Book a mobile coffee cart for weddings, corporate events, and private gatherings in Los Angeles, Orange County, and the Inland Empire." path="/catering" image="https://koinoniacoffeeproject.com/assets/images/koinonia-29.jpg" structuredData={cateringStructuredData} />
      <section className="catering-hero">
        <div className="catering-hero-copy">
          <Eyebrow>BRING KOINONIA COFFEE PROJECT TO YOU</Eyebrow>
          <h1>Coffee cart catering for your next event.</h1>
          <h2>Serving Los Angeles, Orange County, and the Inland Empire.</h2>
          <p>Bring freshly prepared coffee and warm, professional service to your wedding, corporate event, or private gathering.</p>
          <p>Our self-contained mobile coffee cart makes event planning easy, with quick communication and thoughtful service from setup through tear-down.</p>
          <a className="catering-button" href="#catering-inquiry" onClick={handleQuoteClick}>GET YOUR CUSTOM QUOTE</a>
        </div>
        <div className="catering-hero-image">
          <img src="/assets/images/koinonia-29.jpg" alt="Koinonia coffee cart team serving an event" />
        </div>
      </section>

      <section className="catering-inquiry" id="catering-inquiry">
        <div className="inquiry-copy"><Eyebrow>GET STARTED</Eyebrow><h2>Get an instant quote for your next event.</h2><p>Fill out the form to the right and we'll follow up with a custom quote for your event. Once that's done, you'll have unlimited drinks and friendly, professional service at your event, taking it to the next level.</p></div>
        <div className="catering-form-embed"><FlashquotesEmbed /></div>
      </section>

      <section className="catering-introduction">
        <div className="catering-introduction-image">
          <img src="/assets/images/koinonia-53.jpg" alt="Guests enjoying Koinonia coffee at an event" />
        </div>
        <div className="catering-introduction-copy">
          <h2>A coffee experience to remember.</h2>
          <p>Koinonia Coffee Project brings a self-contained mobile espresso bar to weddings, markets, corporate events, and private gatherings. We take care of the coffee, setup, service, and tear-down so you can stay present with your people.</p>
          <a className="catering-button" href="#catering-inquiry" onClick={handleQuoteClick}>GET YOUR QUOTE</a>
        </div>
      </section>

      <section className="catering-pillars">
        <article><Eyebrow>01 / CARE</Eyebrow><h3>Warm service</h3><p>Our staff's goal is to put you and your guests first! We're here for you, and that shows from the moment you book with us to the end of your event.</p></article>
        <article><Eyebrow>02 / CRAFT</Eyebrow><h3>Excellent coffee</h3><p>We strive our best drinks to your event. Made from our own roasted coffee beans, our drinks are sure to bring smiles and caffeine to your guests. A great combo!</p></article>
        <article><Eyebrow>03 / COMFORT</Eyebrow><h3>All handled</h3><p>Speedy bookings, ingredients, materials, setup, tear-down, and service are all taken care of so you can focus on what matters most.</p></article>
      </section>

      <section className="catering-experience">
        <div className="experience-copy">
          <Eyebrow>THE EXPERIENCE</Eyebrow>
          <h2>Everything you need, thoughtfully covered.</h2>
          <p>Our standard espresso bar includes hot and iced lattes, mochas and americanos, whole and oat milk, vanilla syrup, and a non-caffeinated hot chocolate option. We also provide lactaid for those with lactose intolerance. Yep, you read that right.</p>
          <div className="experience-details">
            <div className="experience-details-heading"><Eyebrow>INCLUDED</Eyebrow></div>
            <div><strong>Espresso bar</strong><span>During service</span></div>
            <div><strong>Unlimited drinks</strong><span>For your guests</span></div>
            <div className="experience-details-heading experience-addons-heading"><Eyebrow>OPTIONAL ADD-ONS</Eyebrow></div>
            <div><strong>Matcha / Hojicha Bar</strong><span>Available</span></div>
            <div><strong>Custom Cups</strong><span>Available</span></div>
            <div><strong>Portable Power</strong><span>Available</span></div>
            <div><strong>Additional Hours</strong><span>Available</span></div>
          </div>
        </div>
        <div className="experience-image">
          <img src="/assets/images/koinonia-18.jpg" alt="Guests gathering around the Koinonia Coffee Project cart" loading="lazy" />
        </div>
      </section>

      <section className="catering-faq" aria-labelledby="catering-faq-title">
        <div className="catering-faq-intro">
          <Eyebrow>GOOD TO KNOW</Eyebrow>
          <h2 id="catering-faq-title">Frequently asked questions</h2>
          <a className="catering-button" href="#catering-inquiry" onClick={handleQuoteClick}>BOOK YOUR EVENT</a>
        </div>
        <div className="catering-faq-list">
          {cateringFaqs.map(({ question, answer }) => (
            <article key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="catering-bottom-image" aria-label="Koinonia Coffee Project cart">
        <img src="/assets/images/DSCF3464.jpg" alt="Koinonia Coffee Project mobile coffee cart set up for service" loading="lazy" />
      </section>

    </main>
  );
};

export default Catering;
