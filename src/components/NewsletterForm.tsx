import React, { FormEvent, useId, useState } from "react";
import {
  NewsletterSignupSource,
  savePendingDiscountCode,
  subscribeToNewsletter,
  WelcomeDiscount,
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
  const [discount, setDiscount] = useState<WelcomeDiscount | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const welcomeDiscount = await subscribeToNewsletter({
        email,
        source,
        website,
      });
      // The cart applies the code automatically; the rules are checked there.
      if (welcomeDiscount) savePendingDiscountCode(welcomeDiscount.code);
      setDiscount(welcomeDiscount);
      setStatus("done");
    } catch (requestError) {
      setError((requestError as Error).message);
      setStatus("idle");
    }
  };

  const classes = ["newsletter-form", className].filter(Boolean).join(" ");

  const copyCode = async (): Promise<void> => {
    if (!discount) return;
    try {
      await navigator.clipboard.writeText(discount.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the code stays visible to copy by hand.
    }
  };

  if (status === "done") {
    return (
      <div className={`${classes} newsletter-form-done`} role="status">
        {discount && (
          <div className="newsletter-form-code">
            <span>{discount.code}</span>
            <button
              type="button"
              onClick={copyCode}
              aria-label={copied ? "Copied" : `Copy code ${discount.code}`}
              title={copied ? "Copied" : "Copy code"}
            >
              {copied ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
              )}
            </button>
          </div>
        )}
        <p>
          {discount
            ? `Subscribed! ${discount.percentOff}% off your first order, applied automatically at checkout.`
            : "Subscribed! Thanks for following along the journey."}
        </p>
      </div>
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
