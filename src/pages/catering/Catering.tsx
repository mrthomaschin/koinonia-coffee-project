import React from 'react';
import './Catering.css';
import { FlashquotesEmbed } from '../../components/FlashquotesEmbed';
import SEO from '../../components/SEO';
import { Eyebrow } from '../../components/ui/Typography';
import Button from '../../components/ui/Button';

const cateringFaqs = [
  {
    question: 'Where do you cater?',
    answer: 'We cater events throughout the greater Los Angeles area, including Los Angeles County, Orange County, and the Inland Empire.',
  },
  {
    question: 'Is there a travel fee?',
    answer: 'Travel is $1 per mile, round trip from our base in Lawndale, and is included in your custom quote. For most events in Los Angeles, that comes to about $20–$40.',
  },
  {
    question: 'What kinds of events do you cater?',
    answer: 'Our mobile coffee cart is available for weddings, markets, corporate events, private gatherings, and more.',
  },
  {
    question: 'How do you price your packages?',
    answer: 'Pricing is based on guest count, service length, and travel, and includes the staffing, equipment, and ingredients your event needs. Most events range from $800 to $3,000. Please choose your full service time when you request a quote.',
  },
  {
    question: 'How far in advance should I book?',
    answer: 'We recommend booking as early as you can, since each date can only go to one event. We need at least 4 days’ notice to prepare your coffee bar, and events booked within 10 days of the event date include a 10% short-notice fee.',
  },
  {
    question: 'What add-ons are available?',
    answer: 'You can add our Selah Decaf Blend, an additional barista, custom cups, custom cart branding, or a latte printer. Select them in the quote form and we’ll include them in your custom quote.',
  },
  {
    question: 'What is included in the coffee bar?',
    answer: 'Our standard espresso bar includes hot and iced lattes, mochas, Americanos, and hot chocolate, plus whole milk, oat milk, house-made vanilla syrup, and Lactaid. Our freshly-made matcha and hojicha lattes are included as well. We provide the ingredients and materials and take care of setup, service, and tear-down.',
  },
  {
    question: 'Can you set up outside?',
    answer: 'Yes! Our cart is fully self-contained with portable power included, so we can set up almost anywhere, no outlet needed.',
  },
  {
    question: 'Do you offer service for night events?',
    answer: 'Yes. We serve both daytime and evening events. For later gatherings, add our Selah Decaf Blend, served alongside our Koin Blend, so guests can enjoy the same coffee bar experience without the caffeine.',
  },
  {
    question: 'How do I get a quote?',
    answer: 'Fill out the quote form with a few details about your event, and we’ll follow up with a custom quote.',
  },
];

interface AreaServed {
  '@type': 'AdministrativeArea' | 'City' | 'Place';
  name: string;
}

export interface CateringPageConfig {
  /** Visible h1 on the page. */
  title: string;
  /** <title> tag / og:title. */
  seoTitle: string;
  description: string;
  path: string;
  /** Short label used in the breadcrumb trail, e.g. "Weddings". */
  breadcrumbName?: string;
  serviceType?: string;
  areaServed?: AreaServed[];
}

const SITE_URL = 'https://koinoniacoffeeproject.com';
const HERO_IMAGE = `${SITE_URL}/assets/images/koinonia-29.jpg`;

const defaultAreaServed: AreaServed[] = [
  { '@type': 'AdministrativeArea', name: 'Los Angeles County' },
  { '@type': 'AdministrativeArea', name: 'Orange County' },
  { '@type': 'AdministrativeArea', name: 'Inland Empire' },
];

const hubPage: CateringPageConfig = {
  title: 'Coffee cart catering for your next event.',
  seoTitle: 'Coffee Cart Catering Los Angeles | Koinonia Coffee Project',
  description: 'Book a mobile coffee cart for weddings, corporate events, and private gatherings in Los Angeles, Orange County, and the Inland Empire.',
  path: '/catering',
};

const buildStructuredData = (page: CateringPageConfig) => {
  const url = `${SITE_URL}${page.path}`;
  const breadcrumbs = [
    { name: 'Home', item: `${SITE_URL}/` },
    { name: 'Catering', item: `${SITE_URL}/catering` },
    ...(page.breadcrumbName ? [{ name: page.breadcrumbName, item: url }] : []),
  ];

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Caterer',
      name: 'Koinonia Coffee Project',
      url,
      image: HERO_IMAGE,
      description: page.description,
      areaServed: page.areaServed ?? defaultAreaServed,
      serviceType: page.serviceType ?? 'Mobile coffee cart catering',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map(({ name, item }, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name,
        item,
      })),
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
};

interface CateringProps {
  availableHeight: number;
  page?: CateringPageConfig;
}

const Catering: React.FC<CateringProps> = ({ availableHeight: _availableHeight, page = hubPage }) => {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const structuredData = React.useMemo(() => buildStructuredData(page), [page]);
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
      <SEO title={page.seoTitle} description={page.description} path={page.path} image={HERO_IMAGE} structuredData={structuredData} />
      <section className="catering-hero">
        <div className="catering-hero-copy">
          <Eyebrow>BRING KOINONIA COFFEE PROJECT TO YOU</Eyebrow>
          <h1>{page.title}</h1>
          <h2>Serving Los Angeles, Orange County, and the Inland Empire.</h2>
          <p>Bring freshly prepared coffee and warm, professional service to your wedding, corporate event, or private gathering.</p>
          <p>Our self-contained mobile coffee cart makes event planning easy, with quick communication and thoughtful service from setup through tear-down.</p>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>GET YOUR CUSTOM QUOTE</Button>
        </div>
        <div className="catering-hero-image">
          <img src="/assets/images/koinonia-29.jpg" alt="Koinonia coffee cart team serving an event" />
        </div>
      </section>

      <section className="catering-inquiry" id="catering-inquiry">
        <div className="inquiry-copy"><Eyebrow>GET STARTED</Eyebrow><h2>Get your custom quote.</h2><p>Share a few details about your event, and we'll follow up with your custom quote, unlimited drinks included.</p></div>
        <div className="catering-form-embed"><FlashquotesEmbed /></div>
      </section>

      <section className="catering-introduction">
        <div className="catering-introduction-image">
          <img src="/assets/images/koinonia-53.jpg" alt="Guests enjoying Koinonia coffee at an event" />
        </div>
        <div className="catering-introduction-copy">
          <h2>A coffee experience to remember.</h2>
          <p>Koinonia Coffee Project brings a self-contained mobile espresso bar to weddings, markets, corporate events, and private gatherings. We take care of the coffee, setup, service, and tear-down so you can stay present with your people.</p>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>GET YOUR QUOTE</Button>
        </div>
      </section>

      <section className="catering-pillars">
        <article><Eyebrow>01 / CARE</Eyebrow><h3>Warm service</h3><p>We put you and your guests first, from the moment you book with us to the last drink served.</p></article>
        <article><Eyebrow>02 / CRAFT</Eyebrow><h3>Excellent coffee</h3><p>Every drink is made from beans we roast ourselves, brought to your event with the same care we'd give a cup for a friend.</p></article>
        <article><Eyebrow>03 / COMFORT</Eyebrow><h3>All handled</h3><p>Booking, ingredients, setup, tear-down, and service are all covered on our end, start to finish.</p></article>
      </section>

      <section className="catering-experience">
        <div className="experience-copy">
          <Eyebrow>THE EXPERIENCE</Eyebrow>
          <h2>Everything you need, thoughtfully covered.</h2>
          <p>Our standard espresso bar features hot and iced lattes, mochas, and Americanos, as well as matcha and hojicha drinks. We offer whole and oat milk, house-made vanilla syrup, and a caffeine-free hot chocolate option, with Lactaid available for guests with lactose intolerance.</p>
          <div className="experience-details">
            <div className="experience-details-heading"><Eyebrow>INCLUDED</Eyebrow></div>
            <div><strong>Espresso bar</strong></div>
            <div><strong>Unlimited drinks</strong></div>
            <div><strong>Matcha / Hojicha Bar</strong></div>
            <div><strong>Portable Power</strong></div>
            <div className="experience-details-heading experience-addons-heading"><Eyebrow>OPTIONAL ADD-ONS</Eyebrow></div>
            <div><strong>Selah Decaf Blend</strong></div>
            <div><strong>Additional Barista</strong></div>
            <div><strong>Custom Cups</strong></div>
            <div><strong>Custom Branded Cart</strong></div>
            <div><strong>Latte Printer</strong></div>
          </div>
        </div>
        <div className="experience-image">
          <img src="/assets/images/koinonia-84.jpg" alt="Guests gathering around the Koinonia Coffee Project cart" loading="lazy" />
        </div>
      </section>

      <section className="catering-faq" aria-labelledby="catering-faq-title">
        <div className="catering-faq-intro">
          <Eyebrow>GOOD TO KNOW</Eyebrow>
          <h2 id="catering-faq-title">Frequently asked questions</h2>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>BOOK YOUR EVENT</Button>
          <img className="catering-faq-image" src="/assets/images/koinonia-18.jpg" alt="Guests gathering around the Koinonia Coffee Project cart" loading="lazy" />
        </div>
        <div className="catering-faq-list">
          {cateringFaqs.map(({ question, answer }, index) => (
            <div className={`catering-faq-item${openFaq === index ? ' is-open' : ''}`} key={question}>
              <button
                className="catering-faq-question"
                type="button"
                aria-expanded={openFaq === index}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
              >
                {question}
              </button>
              <div className="catering-faq-answer">
                <p>{answer}</p>
              </div>
            </div>
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
