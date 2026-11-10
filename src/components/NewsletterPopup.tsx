import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NewsletterForm from "./NewsletterForm";
import {
  getPendingDiscountCode,
  WELCOME_PERCENT_OFF,
} from "../services/newsletterService";
import "./NewsletterPopup.css";

const OPEN_DELAY_MS = 5000;
const DISMISS_DAYS = 30;
// Per-browser memory of the popup; a blocked storage just means it may show again.
const DISMISSED_AT_KEY = "newsletter_popup_dismissed_at";
const SUBSCRIBED_KEY = "newsletter_popup_subscribed";

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the popup then may show on a later visit.
  }
};

/** Skips visitors who signed up, hold a code already, or closed the popup recently. */
const shouldShow = (): boolean => {
  if (navigator.webdriver) return false;
  if (readStorage(SUBSCRIBED_KEY) || getPendingDiscountCode()) return false;
  const dismissedAt = Number(readStorage(DISMISSED_AT_KEY));
  return !dismissedAt || Date.now() - dismissedAt > DISMISS_DAYS * 864e5;
};

/** Newsletter signup offered once on the homepage, a few seconds after it opens. */
const NewsletterPopup: React.FC = () => {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shouldShow()) return;
    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    if (!readStorage(SUBSCRIBED_KEY)) {
      writeStorage(DISMISSED_AT_KEY, String(Date.now()));
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div
      className="newsletter-popup-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="newsletter-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          ref={closeRef}
          type="button"
          className="newsletter-popup-close"
          onClick={close}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <img
          className="newsletter-popup-image"
          src="/assets/images/koinonia-18.jpg"
          alt=""
        />
        <div className="newsletter-popup-body">
          <p className="ui-eyebrow">The Newsletter</p>
          <h2 id={titleId} className="newsletter-popup-title">
            {WELCOME_PERCENT_OFF}% off your first order
          </h2>
          <p className="newsletter-popup-copy">
            Join the Koinonia newsletter for new coffees, pop-ups, and stories
            from the roastery, once a month.
          </p>
          <NewsletterForm
            source="homepage"
            className="newsletter-popup-form"
            onSubscribed={() => writeStorage(SUBSCRIBED_KEY, "1")}
          />
          <button
            type="button"
            className="newsletter-popup-decline"
            onClick={close}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default NewsletterPopup;
