import React from "react";
import { Link } from "react-router-dom";
import "./Catering.css";
import { FlashquotesEmbed } from "../../components/FlashquotesEmbed";
import SEO from "../../components/SEO";
import trackingService from "../../services/trackingService";
import { Eyebrow } from "../../components/ui/Typography";
import Button from "../../components/ui/Button";
import {
  CateringPageConfig,
  HERO_IMAGE,
  buildStructuredData,
  cityPages,
  eventPages,
  faqsFor,
  hubPage,
} from "./cateringPages";

export type { CateringPageConfig } from "./cateringPages";

interface CateringProps {
  availableHeight: number;
  page?: CateringPageConfig;
}

const Catering: React.FC<CateringProps> = ({
  availableHeight: _availableHeight,
  page = hubPage,
}) => {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const structuredData = React.useMemo(() => buildStructuredData(page), [page]);
  const handleQuoteClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    trackingService.trackButtonClick(
      event.currentTarget.textContent ?? "quote",
      page.path,
    );
    const inquirySection = document.getElementById("catering-inquiry");
    if (inquirySection) {
      const targetPosition =
        inquirySection.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: targetPosition, behavior: "smooth" });
    }
  };

  return (
    <main className="catering-page">
      <SEO
        title={page.seoTitle}
        description={page.description}
        path={page.path}
        image={HERO_IMAGE}
        structuredData={structuredData}
      />
      <section className="catering-hero">
        <div className="catering-hero-copy">
          <Eyebrow>BRING KOINONIA COFFEE PROJECT TO YOU</Eyebrow>
          <h1>{page.title}</h1>
          <h2>{page.heroSubtitle}</h2>
          <p>{page.intro[0]}</p>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>
            GET YOUR CUSTOM QUOTE
          </Button>
        </div>
        <div className="catering-hero-image">
          <img
            src="/assets/images/koinonia-29.jpg"
            alt="Koinonia coffee cart team serving an event"
          />
        </div>
      </section>

      <section className="catering-inquiry" id="catering-inquiry">
        <div className="inquiry-copy">
          <Eyebrow>GET STARTED</Eyebrow>
          <h2>Get your custom quote in less than a day.</h2>
          <p>
            We know event planning can be overwhelming, so we make it easy to
            get your coffee cart booked for your event. Experience the
            convenience of our mobile coffee service from booking to completion,
            with quotes received within 24-hours and a planning team ready to
            help your event be a success.
          </p>
          <p>
            Share a few details about your event in the form on the right, and
            we'll follow up with your custom quote.
          </p>
          <p>
            Not sure about every detail yet? That's okay! Share what you know,
            and we'll help work out the rest together.
          </p>
        </div>
        <div className="catering-form-embed">
          <FlashquotesEmbed />
        </div>
      </section>

      {page.highlights && (
        <section className="catering-highlights">
          <div className="catering-highlights-intro">
            <Eyebrow>{page.highlights.eyebrow}</Eyebrow>
            <h2>{page.highlights.heading}</h2>
            {page.intro.slice(1).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="catering-highlights-grid">
            {page.highlights.items.map(({ title, body }) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="catering-introduction">
        <div className="catering-introduction-image">
          <img
            src="/assets/images/koinonia-53.jpg"
            alt="Guests enjoying Koinonia coffee at an event"
          />
        </div>
        <div className="catering-introduction-copy">
          <h2>A coffee experience to remember.</h2>
          <p>
            Weddings, corporate events, baby showers and more, we're all for it.
            Regardless of the occasion, a great cup of coffee can bring people
            together.
          </p>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>
            GET YOUR QUOTE
          </Button>
          <div className="catering-pillars">
            <article>
              <Eyebrow>01 / CARE</Eyebrow>
              <h3>Smiles only.</h3>
              <p>
                We put you and your guests first, from the moment you book with
                us to the last drink served. We're here to make your and your
                guests' day special on your special day.
              </p>
            </article>
            <article>
              <Eyebrow>02 / CRAFT</Eyebrow>
              <h3>Excellent coffee.</h3>
              <p>
                Every drink is made from our signature speciality coffee beans,
                roasted fresh for optimal goodness. We also source high-quality
                ceremonial grade matcha. Your guests will get to taste the
                drinks we make for ourselves!
              </p>
            </article>
            <article>
              <Eyebrow>03 / CONVENIENCE</Eyebrow>
              <h3>Hands-off, worry-free.</h3>
              <p>
                Booking, ingredients, setup, tear-down, and service are all
                covered on our end, start to finish, so you don't need to worry
                about a thing. All you need to do is tell us where to be and
                we'll be there.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="catering-experience">
        <div className="experience-copy">
          <Eyebrow>THE EXPERIENCE</Eyebrow>
          <h2>A premium café on wheels.</h2>
          <p>
            Our standard espresso bar features hot and iced lattes, mochas, and
            Americanos, as well as matcha and hojicha drinks. We offer whole and
            oat milk, house-made vanilla syrup, and a caffeine-free hot
            chocolate option, with Lactaid available for guests with lactose
            intolerance. Yes, you read that right.
          </p>
          <div className="experience-details">
            <div className="experience-details-heading">
              <Eyebrow>INCLUDED</Eyebrow>
            </div>
            <div>
              <strong>Espresso bar</strong>
            </div>
            <div>
              <strong>Unlimited drinks</strong>
            </div>
            <div>
              <strong>Matcha / Hojicha Bar</strong>
            </div>
            <div>
              <strong>Flexible location setup</strong>
            </div>
            <div className="experience-details-heading experience-addons-heading">
              <Eyebrow>OPTIONAL ADD-ONS</Eyebrow>
            </div>
            <div>
              <strong>Selah Decaf Blend</strong>
            </div>
            <div>
              <strong>Additional Barista</strong>
            </div>
            <div>
              <strong>Custom Cups</strong>
            </div>
            <div>
              <strong>Custom Branded Cart</strong>
            </div>
            <div>
              <strong>Latte Printer</strong>
            </div>
          </div>
        </div>
        <div className="experience-image">
          <img
            src="/assets/images/koinonia-84.jpg"
            alt="Guests gathering around the Koinonia Coffee Project cart"
            loading="lazy"
          />
        </div>
      </section>

      <nav className="catering-links" aria-label="Catering service areas and events">
        <div>
          <Eyebrow>WHERE WE SERVE</Eyebrow>
          <h2>{page.kind === "city" ? "Other areas we serve." : "Cities we serve."}</h2>
          <ul>
            {cityPages
              .filter(({ path }) => path !== page.path)
              .map(({ path, navLabel }) => (
                <li key={path}>
                  <Link to={path}>{navLabel}</Link>
                </li>
              ))}
          </ul>
          <p>Have an event somewhere else in Southern California? Ask us, we’re happy to travel.</p>
        </div>
        <div>
          <Eyebrow>WHAT WE CATER</Eyebrow>
          <h2>{page.kind === "event" ? "Other events we cater." : "Events we cater."}</h2>
          <ul>
            {eventPages
              .filter(({ path }) => path !== page.path)
              .map(({ path, navLabel }) => (
                <li key={path}>
                  <Link to={path}>{navLabel}</Link>
                </li>
              ))}
          </ul>
        </div>
      </nav>

      <section className="catering-faq" aria-labelledby="catering-faq-title">
        <div className="catering-faq-intro">
          <Eyebrow>GOOD TO KNOW</Eyebrow>
          <h2 id="catering-faq-title">Frequently asked questions</h2>
          <Button as="a" href="#catering-inquiry" onClick={handleQuoteClick}>
            BOOK YOUR EVENT
          </Button>
          <img
            className="catering-faq-image"
            src="/assets/images/koinonia-18.jpg"
            alt="Guests gathering around the Koinonia Coffee Project cart"
            loading="lazy"
          />
        </div>
        <div className="catering-faq-list">
          {faqsFor(page).map(({ question, answer }, index) => (
            <div
              className={`catering-faq-item${openFaq === index ? " is-open" : ""}`}
              key={question}
            >
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
    </main>
  );
};

export default Catering;
