import React, { useEffect, useState, useRef, useCallback } from 'react';
import './InstagramEmbed.css';

const InstagramEmbed: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  const loadInstagramScript = useCallback(() => {
    if (scriptLoadedRef.current || (window as any).instgrm) {
      if ((window as any).instgrm) {
        (window as any).instgrm.Embeds.process();
        setIsLoading(false);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = '//www.instagram.com/embed.js';
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      if ((window as any).instgrm) {
        (window as any).instgrm.Embeds.process();
      }
      setIsLoading(false);
    };
    script.onerror = () => {
      setHasError(true);
      setIsLoading(false);
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
            loadInstagramScript();
          }
        });
      },
      {
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [isVisible, loadInstagramScript]);

  return (
    <div ref={containerRef} className="instagram-embed-container">
      {isLoading && (
        <div className="instagram-loading-placeholder">
          <div className="loading-spinner"></div>
          <p>Loading Instagram feed...</p>
        </div>
      )}

      {hasError && (
        <div className="instagram-error-placeholder">
          <p>Unable to load Instagram content</p>
          <a
            href="https://www.instagram.com/koinoniacoffeeproject"
            target="_blank"
            rel="noopener noreferrer"
            className="instagram-fallback-link"
          >
            Visit our Instagram page
          </a>
        </div>
      )}

      {!hasError && (
        <blockquote
          className="instagram-media"
          data-instgrm-permalink="https://www.instagram.com/koinoniacoffeeproject/?utm_source=ig_embed&utm_campaign=loading"
          data-instgrm-version="14"
          style={{ display: isLoading ? 'none' : 'block' }}
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
      )}
    </div>
  );
};

export default InstagramEmbed;
