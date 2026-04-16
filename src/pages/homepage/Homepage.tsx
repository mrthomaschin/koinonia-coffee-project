import React, { useState, useEffect } from 'react';
import { ASSETS } from '../../util/constants';
import './Homepage.css';

interface HomepageProps {
  availableHeight: number;
}

const Homepage: React.FC<HomepageProps> = ({ availableHeight }) => {
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    const handleResize = (): void => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile: boolean = screenWidth < 768;

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
          <div className="definition-container">
            <div className="greek-title">κοινωνία</div>
            <div className="pronunciation">[koy-nohn-ee'-ah]</div>
            <div className="definition-meaning">
              <span className="part-of-speech">(n.)</span> communion, fellowship
            </div>
          </div>

          <div className="mission-statement">
            <p className="mission-text">
              Koinonia Coffee Project exists to create spaces for meaningful connection through the joy of good coffee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
