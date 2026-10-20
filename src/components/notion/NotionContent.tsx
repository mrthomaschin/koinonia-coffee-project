import React from 'react';
import './NotionContent.css';
import { ContentBlock, splitIntoSections } from './types';
import NotionBlocks from './NotionBlocks';
import NotionRichText from './NotionRichText';

interface NotionContentProps {
  blocks: ContentBlock[];
  /** Start a full-width section with its own background at each h2. */
  sectioned?: boolean;
  className?: string;
}

/**
 * Standalone renderer for structured Notion content (see ./types).
 * Plain mode renders the blocks inline; sectioned mode turns every h2 into its own
 * full-width band. The first band uses the page background, then bands alternate with a tint.
 */
const NotionContent: React.FC<NotionContentProps> = ({ blocks, sectioned = false, className = '' }) => {
  if (!sectioned) {
    return <div className={`notion-content ${className}`.trim()}><NotionBlocks blocks={blocks} /></div>;
  }

  const sections = splitIntoSections(blocks);

  return (
    <div className={`notion-content notion-content--sectioned ${className}`.trim()}>
      {sections.map((section, index) => (
        // The first section keeps the page background; later sections alternate with a tinted band.
        <section key={index} className={`notion-section${index % 2 === 1 ? ' notion-section--tinted' : ''}`}>
          {section.heading && <h2 className="notion-section-heading"><NotionRichText spans={section.heading} /></h2>}
          <div className="notion-section-body"><NotionBlocks blocks={section.blocks} /></div>
        </section>
      ))}
    </div>
  );
};

export default NotionContent;
