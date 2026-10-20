import React from "react";
import NewsletterForm from "./NewsletterForm";
import "./NewsletterSignup.css";

/** The footer's newsletter column. */
const NewsletterSignup: React.FC = () => (
  <section
    className="newsletter-signup"
    aria-labelledby="newsletter-signup-title"
  >
    <h2 id="newsletter-signup-title" className="section-title">
      NEWSLETTER
    </h2>
    <p className="newsletter-signup-copy">
      Get <b>10% off your first order</b> when you subscribe to Koinonia's
      newsletter.
    </p>
    <NewsletterForm source="footer" />
  </section>
);

export default NewsletterSignup;
