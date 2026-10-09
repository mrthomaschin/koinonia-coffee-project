import React from 'react';
import { Link } from 'react-router-dom';
import './ChurchPartnership.css';
import SEO, { SITE_URL } from '../../components/SEO';
import TallyEmbed from '../../components/TallyEmbed';
import { Eyebrow } from '../../components/ui/Typography';
import Button from '../../components/ui/Button';
import { PAGES } from '../../util/constants';

// Tally form ID: the part after tally.so/r/ in the form's share link.
const TALLY_FORM_ID = '';

const PAGE_PATH = `/${PAGES.CHURCH_PARTNERSHIP}`;
const HERO_IMAGE = `${SITE_URL}/assets/images/koinonia-53.jpg`;
const SEO_TITLE = 'Church Coffee Ministry Partnership | Koinonia Coffee Project';
const SEO_DESCRIPTION = 'Wholesale coffee, barista training, and a custom coffee ministry playbook for churches and ministries in Los Angeles, Orange County, and the Inland Empire.';

const struggles = [
  {
    label: '01 / BUDGET',
    title: 'Free coffee, tight budgets',
    copy: 'Most coffee ministries serve for free, funded by a line item or the offering plate. When budgets tighten, the coffee is often the first thing to go.',
  },
  {
    label: '02 / PEOPLE',
    title: 'Willing, but untrained',
    copy: 'Coffee ministries run on faithful volunteers who often learn as they go. Without training or a clear system, quality slips and serving starts to wear people out.',
  },
  {
    label: '03 / GROWTH',
    title: 'Hard to grow',
    copy: 'Stretched budgets and stretched teams make it hard to move past the Sunday morning urn into youth nights, small groups, or church-wide events.',
  },
];

const offerings = [
  { title: 'Discounted wholesale coffee', copy: 'Freshly roasted bulk coffee, including our Cima Café and Ekklesia Offering, at partner pricing.' },
  { title: 'Barista training', copy: 'Hands-on training that gives your volunteers the skills and confidence to serve well.' },
  { title: 'Coffee ministry playbook', copy: 'A custom playbook for your church, with manuals, SOPs, recipes, and how-tos your team can come back to.' },
  { title: 'Ongoing consulting', copy: 'Ongoing tips and support from our team as your ministry grows, whether that is new equipment, new events, or new volunteers.' },
  { title: 'Equipment rentals', copy: 'Espresso machines, grinders, batch brewers, and brewing tools, so your church can serve better without a large upfront cost.' },
  { title: 'Discounted event catering', copy: 'Partner pricing on our mobile coffee cart for church-wide events, retreats, and celebrations.' },
  { title: 'Partner network', copy: 'A community of churches and coffee ministries across Southern California to learn from and encourage.' },
];

interface PartnershipFormat {
  name: string;
  bestFor: string;
  includes: string[];
  commitment: string[];
  featured?: boolean;
}

const formats: PartnershipFormat[] = [
  {
    name: 'Coffee only',
    bestFor: 'Ministries that only need flexible wholesale coffee.',
    includes: ['Wholesale coffee'],
    commitment: ['No minimum'],
  },
  {
    name: 'Coffee & matcha',
    bestFor: 'Ministries that want flexible wholesale coffee and matcha.',
    includes: ['Wholesale coffee', 'Wholesale matcha'],
    commitment: ['1 lb / month minimum'],
  },
  {
    name: 'Active wholesale',
    bestFor: 'Ministries that want to equip their people and grow.',
    includes: ['Wholesale coffee & matcha', 'Custom coffee ministry playbook', 'Barista training', 'Ongoing consulting'],
    commitment: ['10 lb first order', '5 lb / month after that'],
    featured: true,
  },
  {
    name: 'Equipment rentals',
    bestFor: 'Missions, nonprofit programs, and special causes.',
    includes: ['Espresso machines', 'Grinders', 'Fellow Aiden brewers', 'Brewing tools'],
    commitment: ['Monthly rate by equipment', '5 lb / month minimum'],
  },
  {
    name: 'Discounted catering',
    bestFor: 'One-time, church-wide events with specialty coffee service.',
    includes: ['Discounted coffee cart catering'],
    commitment: ['No minimum', 'Discount grows with your monthly coffee commitment', 'Church events only'],
  },
];

const partnershipFaqs = [
  {
    question: 'Who is this program for?',
    answer: 'Churches and ministries that want to start or grow a coffee ministry. Most of our partners gather between 50 and 1,000 people, but if your ministry is outside that range, we would still love to hear from you.',
  },
  {
    question: 'Where do you serve?',
    answer: 'The program is focused on churches and ministries in Los Angeles County, Orange County, and the Inland Empire. That lets us train your team in person, deliver equipment, and serve at your events.',
  },
  {
    question: 'We do not have a coffee ministry yet. Can we still apply?',
    answer: 'Yes. Churches starting from scratch are exactly who this program was built for. We will help you choose equipment, set up your station, and train your first volunteers.',
  },
  {
    question: 'What are the minimum order commitments?',
    answer: 'It depends on the format. Coffee only has no minimum. Coffee & matcha is 1 lb per month. Active wholesale starts with a 10 lb first order, then 5 lb per month. Equipment rentals include a 5 lb per month minimum alongside the rental rate.',
  },
  {
    question: 'How is pricing set?',
    answer: 'Partner pricing is tiered by your monthly coffee commitment, so the more your ministry serves, the more you save. We share the full price sheet on your discovery call, before you commit to anything.',
  },
  {
    question: 'How does billing work?',
    answer: 'We check in at the end of each month to settle your minimum order and any equipment rental payments.',
  },
  {
    question: 'Can we cancel our partnership?',
    answer: 'Yes. When you cancel, the current month’s minimum order and any outstanding equipment payments are due. If you booked catering before cancelling for an event after your cancellation date, we will still serve that event.',
  },
  {
    question: 'Is the catering discount available for any event?',
    answer: 'The partner catering discount applies to church events only. For weddings, corporate events, and private gatherings, visit our catering page for a standard quote.',
  },
];

const buildStructuredData = () => {
  const url = `${SITE_URL}${PAGE_PATH}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Church & Ministry Partnership Program',
      serviceType: 'Church coffee ministry wholesale and training',
      url,
      image: HERO_IMAGE,
      description: SEO_DESCRIPTION,
      audience: { '@type': 'Audience', audienceType: 'Churches and ministries' },
      provider: { '@type': 'Organization', name: 'Koinonia Coffee Project', url: SITE_URL },
      areaServed: [
        { '@type': 'AdministrativeArea', name: 'Los Angeles County' },
        { '@type': 'AdministrativeArea', name: 'Orange County' },
        { '@type': 'AdministrativeArea', name: 'Inland Empire' },
      ],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Partnership formats',
        itemListElement: formats.map(({ name, bestFor }) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name, description: bestFor },
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Church & Ministry Partnerships', item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: partnershipFaqs.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ];
};

const scrollToSection = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  const section = document.getElementById(id);
  if (section) {
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
  }
};

const ChurchPartnership: React.FC = () => {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const structuredData = React.useMemo(buildStructuredData, []);
  const handleApplyClick = scrollToSection('partnership-application');

  return (
    <main className="partnership-page">
      <SEO title={SEO_TITLE} description={SEO_DESCRIPTION} path={PAGE_PATH} image={HERO_IMAGE} structuredData={structuredData} />

      <section className="partnership-hero">
        <div className="partnership-hero-copy">
          <Eyebrow>CHURCH & MINISTRY PARTNERSHIP PROGRAM</Eyebrow>
          <h1>Coffee that gathers the church.</h1>
          <h2>Wholesale coffee, training, and support for church coffee ministries across Los Angeles, Orange County, and the Inland Empire.</h2>
          <p>Whether you are starting a coffee ministry or growing the one you have, we partner with your church to serve great coffee, equip your volunteers, and make room for fellowship.</p>
          <div className="partnership-hero-actions">
            <Button as="a" href="#partnership-application" onClick={handleApplyClick}>APPLY TO PARTNER</Button>
            <Button as="a" variant="outline" href="#partnership-formats" onClick={scrollToSection('partnership-formats')}>SEE PARTNERSHIP OPTIONS</Button>
          </div>
        </div>
        <div className="partnership-hero-image">
          <img src="/assets/images/koinonia-53.jpg" alt="People sharing coffee and conversation together" />
        </div>
      </section>

      <section className="partnership-problem" aria-labelledby="partnership-problem-title">
        <div className="partnership-problem-intro">
          <Eyebrow>THE CHALLENGE</Eyebrow>
          <h2 id="partnership-problem-title">Fellowship happens over coffee. Keeping the coffee going is the hard part.</h2>
          <p>The coffee table is often where newcomers are welcomed, friendships begin, and conversations keep going after the service ends. But many coffee ministries stall, or stop altogether, for the same few reasons.</p>
        </div>
        <div className="partnership-problem-grid">
          {struggles.map(({ label, title, copy }) => (
            <article key={title}>
              <Eyebrow>{label}</Eyebrow>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="partnership-solution" aria-labelledby="partnership-solution-title">
        <div className="partnership-solution-copy">
          <Eyebrow>WHAT WE PROVIDE</Eyebrow>
          <h2 id="partnership-solution-title">Everything your coffee ministry needs to grow.</h2>
          <p>Koinonia is the Greek word for fellowship, the kind of shared life the early church devoted itself to (Acts 2:42). Your coffee ministry exists for the same reason, so we built this program to give it the coffee, training, and support to keep serving.</p>
          <div className="partnership-solution-image">
            <img src="/assets/images/koinonia-84.jpg" alt="A group gathered around the Koinonia Coffee Project coffee bar" loading="lazy" />
          </div>
        </div>
        <ul className="partnership-offerings">
          {offerings.map(({ title, copy }) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="partnership-formats" id="partnership-formats" aria-labelledby="partnership-formats-title">
        <div className="partnership-section-intro">
          <Eyebrow>PARTNERSHIP FORMATS</Eyebrow>
          <h2 id="partnership-formats-title">Choose the format that fits your ministry.</h2>
          <p>Every format includes partner pricing. Minimums are listed below, and we will help you find the right fit on your discovery call.</p>
        </div>
        <div className="partnership-format-grid">
          {formats.map(({ name, bestFor, includes, commitment, featured }) => (
            <article className={`partnership-format${featured ? ' is-featured' : ''}`} key={name}>
              {featured && <span className="partnership-format-badge">MOST SUPPORT</span>}
              <h3>{name}</h3>
              <p className="partnership-format-best">{bestFor}</p>
              <Eyebrow>INCLUDES</Eyebrow>
              <ul>{includes.map((item) => <li key={item}>{item}</li>)}</ul>
              <Eyebrow>COMMITMENT</Eyebrow>
              <ul>{commitment.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="partnership-faq" aria-labelledby="partnership-faq-title">
        <div className="partnership-faq-intro">
          <Eyebrow>GOOD TO KNOW</Eyebrow>
          <h2 id="partnership-faq-title">Frequently asked questions</h2>
          <Button as="a" href="#partnership-application" onClick={handleApplyClick}>APPLY TO PARTNER</Button>
        </div>
        <div className="partnership-faq-list">
          {partnershipFaqs.map(({ question, answer }, index) => (
            <div className={`partnership-faq-item${openFaq === index ? ' is-open' : ''}`} key={question}>
              <button
                className="partnership-faq-question"
                type="button"
                aria-expanded={openFaq === index}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
              >
                {question}
              </button>
              <div className="partnership-faq-answer">
                <p>{answer}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="partnership-application" id="partnership-application" aria-labelledby="partnership-application-title">
        <div className="partnership-application-copy">
          <Eyebrow>APPLY</Eyebrow>
          <h2 id="partnership-application-title">Let’s grow your coffee ministry together.</h2>
          <p>Tell us about your church and what you hope your coffee ministry can become. We will reach out to schedule your discovery call.</p>
        </div>
        <div className="partnership-form-embed">
          {TALLY_FORM_ID ? (
            <TallyEmbed formId={TALLY_FORM_ID} title="Church & Ministry Partnership application" />
          ) : (
            <p>Applications open soon. In the meantime, <Link to={`/${PAGES.CONTACT}`}>contact us</Link> and we will be in touch.</p>
          )}
        </div>
      </section>
    </main>
  );
};

export default ChurchPartnership;
