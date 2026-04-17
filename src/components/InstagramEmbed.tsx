import React, { useEffect } from 'react';
import './InstagramEmbed.css';

const InstagramEmbed: React.FC = () => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '//www.instagram.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="instagram-embed-container">
      <blockquote
        className="instagram-media"
        data-instgrm-permalink="https://www.instagram.com/koinoniacoffeeproject/?utm_source=ig_embed&utm_campaign=loading"
        data-instgrm-version="14"
      >
        <div style={{ padding: '16px' }}>
          <a
            href="https://www.instagram.com/koinoniacoffeeproject/?utm_source=ig_embed&utm_campaign=loading"
            target="_blank"
            rel="noopener noreferrer"
          >
            View this profile on Instagram
          </a>
          <p>
            <a href="https://www.instagram.com/koinoniacoffeeproject/?utm_source=ig_embed&utm_campaign=loading" target="_blank" rel="noopener noreferrer">Koinonia Coffee Project</a> (@<a href="https://www.instagram.com/koinoniacoffeeproject/?utm_source=ig_embed&utm_campaign=loading" target="_blank" rel="noopener noreferrer">koinoniacoffeeproject</a>) • Instagram photos and videos
          </p>
        </div>
      </blockquote>
    </div>
  );
};

export default InstagramEmbed;
