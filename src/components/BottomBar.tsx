import React from 'react';
import { Link } from 'react-router-dom';
import { ICONS, PAGES } from '../util/constants';
import './BottomBar.css';

const BottomBar: React.FC = () => (
  <footer className="bottom-bar">
    <div className="bottom-bar-content">
      <Link to="/" className="bottom-bar-brand" aria-label="Koinonia Coffee Project home">
        <img src={ICONS.logoMark} alt="Koinonia Coffee Project" className="bottom-bar-logo" />
      </Link>

      <nav className="bottom-bar-section" aria-label="Company">
        <h2 className="section-title">COMPANY</h2>
        <Link className="section-link" to={`/${PAGES.ABOUT}`}>About</Link>
      </nav>

      <nav className="bottom-bar-section" aria-label="Account">
        <h2 className="section-title">ACCOUNT</h2>
        <Link className="section-link" to={`/${PAGES.CONTACT}`}>Contact us</Link>
        <Link className="section-link" to="/account-login">Login</Link>
        <Link className="section-link" to="/create-account">Sign up</Link>
      </nav>

      <nav className="bottom-bar-section" aria-label="Categories">
        <h2 className="section-title">CATEGORIES</h2>
        <Link className="section-link" to={`/${PAGES.CATERING}`}>Catering</Link>
        <Link className="section-link" to={`/${PAGES.SHOP}`}>Store</Link>
        <Link className="section-link" to={`/${PAGES.EVENTS}`}>Event calendar</Link>
      </nav>
    </div>

    <div className="bottom-bar-footer">
      <p className="copyright-text">© 2026 KOINONIA COFFEE PROJECT | ALL RIGHTS RESERVED</p>
      <nav className="legal-links" aria-label="Legal information">
        <Link to="/terms-of-service">Terms of service</Link>
        <Link to="/privacy-policy">Privacy policy</Link>
        <Link to="/refund-policy">Refund policy</Link>
      </nav>
    </div>
  </footer>
);

export default BottomBar;
