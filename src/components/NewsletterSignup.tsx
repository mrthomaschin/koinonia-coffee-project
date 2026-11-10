import React from "react";
import NewsletterForm from "./NewsletterForm";
import { WELCOME_PERCENT_OFF } from "../services/newsletterService";
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
      Get <b>{WELCOME_PERCENT_OFF}% off your first order</b> when you subscribe to Koinonia's
      newsletter.
    </p>
    <NewsletterForm source="footer" />
  </section>
);

export default NewsletterSignup;
