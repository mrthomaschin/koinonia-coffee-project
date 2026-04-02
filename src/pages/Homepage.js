import React, { useState, useEffect } from 'react';
import { ASSETS, COLORS, FONTS } from '../constants';
import './Homepage.css';

const Homepage = ({ availableHeight }) => {
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = screenWidth < 768;

  return (
    <div className="homepage">
      <div 
        className="hero-section"
        style={{ 
          height: availableHeight,
          backgroundImage: `url(${ASSETS.heroImage})`
        }}
      >
        <div className="hero-content">
          <img
            src={ASSETS.logoMark}
            alt="Koinonia Coffee Project"
            className="hero-logo"
            style={{ height: isMobile ? '60px' : '80px' }}
          />
          <h1 
            className="hero-title"
            style={{ fontSize: isMobile ? '28px' : '50px' }}
          >
            Cultivating community, one cup at a time.
          </h1>
        </div>
      </div>

      <div className="description-section">
        <div className="description-content">
          <p className="koinonia-text">
            "Koinonia" (κοινωνία) [koy-nohn-ee'-ah]: (n.) communion, fellowship
          </p>
          <p className="description-text">
            Koinonia Coffee is a community-driven coffee shop that sources directly from 
            smallholder farmers in Central America and East Africa. We believe in building 
            sustainable relationships with our farmers and creating a space where people 
            can come together over great coffee.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
