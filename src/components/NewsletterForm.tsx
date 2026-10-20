import React, { FormEvent, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  NewsletterSignupSource,
  subscribeToNewsletter,
} from "../services/newsletterService";
import "./NewsletterForm.css";

interface NewsletterFormProps {
  // Recorded with the subscriber's consent, to show where they signed up.
  source: NewsletterSignupSource;
  className?: string;
}

/** Email field and subscribe button for the monthly newsletter. Callers supply the heading and copy. */
const NewsletterForm: React.FC<NewsletterFormProps> = ({
  source,
  className,
}) => {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      await subscribeToNewsletter({ email, source, website });
      setStatus("done");
    } catch (requestError) {
      setError((requestError as Error).message);
      setStatus("idle");
    }
  };

  const classes = ["newsletter-form", className].filter(Boolean).join(" ");

  if (status === "done") {
    return (
      <p className={`${classes} newsletter-form-done`} role="status">
        Almost there! Check your inbox and confirm your email to get 10% off
        your first order.
      </p>
    );
  }

  return (
    <form className={classes} onSubmit={handleSubmit}>
      <div className="newsletter-form-row">
        <label htmlFor={inputId} className="newsletter-form-hidden">
          Email address
        </label>
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        {/* Hidden from people; bots that fill every field reveal themselves here. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          className="newsletter-form-hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Signing up…" : "Subscribe"}
        </button>
      </div>
      {/* <p className="newsletter-form-fineprint">
        Unsubscribe anytime. See our{" "}
        <Link to="/privacy-policy">privacy policy</Link>.
      </p> */}
      {error && (
        <p className="newsletter-form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
};

export default NewsletterForm;
