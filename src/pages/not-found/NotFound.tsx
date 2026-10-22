import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../components/SEO";
import { ICONS } from "../../util/constants";
import "../../components/ComingSoon.css";
import "./NotFound.css";

interface NotFoundProps {
  availableHeight: number;
}

const NotFound: React.FC<NotFoundProps> = ({ availableHeight }) => (
  <main className="coming-soon" style={{ minHeight: availableHeight }}>
    <SEO
      title="Page Not Found | Koinonia Coffee Project"
      description="The page you're looking for doesn't exist."
      path="/404"
      noIndex
    />
    <img
      src={ICONS.logoMark}
      alt="Koinonia Coffee Project"
      className="coming-soon-logo"
    />
    <h1 className="coming-soon-title">Page not found</h1>
    <p className="not-found-text">
      The page you're looking for doesn't exist or has moved.
    </p>
    <nav className="not-found-links" aria-label="Popular pages">
      <Link to="/">Home</Link>
      <Link to="/catering">Coffee cart catering</Link>
      <Link to="/shop">Shop coffee</Link>
    </nav>
  </main>
);

export default NotFound;
