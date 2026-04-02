import React from 'react';
import { ASSETS, COLORS, FONTS } from '../constants';
import './BottomBar.css';

const BottomBar = () => {
  const openInstagram = () => {
    window.open('https://www.instagram.com/koinoniacoffeeproject', '_blank');
  };

  const openEmail = () => {
    window.location.href = 'mailto:hello@koinoniacoffeeproject.com';
  };

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-content">
        <img
          src={ASSETS.logoMark}
          alt="Koinonia Coffee Project"
          className="bottom-bar-logo"
        />
        
        <div className="bottom-bar-spacer" />
        
        <div className="bottom-bar-section">
          <h3 className="section-title">FOLLOW ALONG</h3>
          <div className="section-link" onClick={openInstagram}>
            <img
              src={ASSETS.instagramIcon}
              alt="Instagram"
              className="social-icon"
            />
            <span className="link-text">Instagram</span>
          </div>
        </div>
        
        <div className="bottom-bar-section">
          <h3 className="section-title">CONTACT US</h3>
          <div className="section-link" onClick={openEmail}>
            <img
              src={ASSETS.emailIcon}
              alt="Email"
              className="email-icon"
            />
            <span className="link-text">hello@koinoniacoffeeproject.com</span>
          </div>
        </div>
      </div>
      
      <div className="bottom-bar-footer">
        <p className="copyright-text">
          © 2026 KOINONIA COFFEE PROJECT | ALL RIGHTS RESERVED
        </p>
      </div>
    </div>
  );
};

export default BottomBar;
