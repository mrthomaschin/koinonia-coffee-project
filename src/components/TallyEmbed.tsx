import React, { useEffect } from 'react';

const TALLY_SCRIPT_SRC = 'https://tally.so/widgets/embed.js';

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void };
  }
}

interface TallyEmbedProps {
  formId: string;
  title: string;
  /** Initial height before Tally's dynamic resizing kicks in. */
  height?: number;
}

const loadTallyEmbeds = (): void => {
  if (window.Tally) {
    window.Tally.loadEmbeds();
    return;
  }
  document.querySelectorAll<HTMLIFrameElement>('iframe[data-tally-src]:not([src])').forEach((iframe) => {
    iframe.src = iframe.dataset.tallySrc ?? '';
  });
};

export const TallyEmbed: React.FC<TallyEmbedProps> = ({ formId, title, height = 600 }) => {
  useEffect(() => {
    if (document.querySelector(`script[src="${TALLY_SCRIPT_SRC}"]`)) {
      loadTallyEmbeds();
      return;
    }
    const script = document.createElement('script');
    script.src = TALLY_SCRIPT_SRC;
    script.async = true;
    script.onload = loadTallyEmbeds;
    script.onerror = loadTallyEmbeds;
    document.body.appendChild(script);
  }, [formId]);

  return (
    <iframe
      data-tally-src={`https://tally.so/embed/${formId}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`}
      loading="lazy"
      width="100%"
      height={height}
      frameBorder={0}
      marginHeight={0}
      marginWidth={0}
      title={title}
      style={{ display: 'block', width: '100%', border: 'none' }}
    />
  );
};

export default TallyEmbed;
