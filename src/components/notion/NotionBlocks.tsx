import React from 'react';
import { ContentBlock } from './types';
import NotionRichText from './NotionRichText';

/** Renders a list of Notion content blocks with the site's typography. */
const NotionBlocks: React.FC<{ blocks: ContentBlock[] }> = ({ blocks }) => (
  <>
    {blocks.map((block, index) => <NotionBlock key={index} block={block} />)}
  </>
);

const NotionBlock: React.FC<{ block: ContentBlock }> = ({ block }) => {
  switch (block.type) {
    case 'heading': {
      const Tag = (block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4';
      return <Tag className={`notion-heading notion-heading--${block.level}`}><NotionRichText spans={block.text} /></Tag>;
    }
    case 'paragraph':
      return <p className="notion-paragraph"><NotionRichText spans={block.text} /></p>;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className="notion-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <NotionRichText spans={item.text} />
              {item.children.length > 0 && <NotionBlocks blocks={item.children} />}
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote className="notion-quote">
          <p><NotionRichText spans={block.text} /></p>
          {block.children.length > 0 && <NotionBlocks blocks={block.children} />}
        </blockquote>
      );
    case 'callout':
      return (
        <aside className="notion-callout">
          {block.icon && <span className="notion-callout-icon" aria-hidden="true">{block.icon}</span>}
          <div>
            <p><NotionRichText spans={block.text} /></p>
            {block.children.length > 0 && <NotionBlocks blocks={block.children} />}
          </div>
        </aside>
      );
    case 'toggle':
      return (
        <details className="notion-toggle">
          <summary><NotionRichText spans={block.summary} /></summary>
          <div className="notion-toggle-body"><NotionBlocks blocks={block.children} /></div>
        </details>
      );
    case 'code':
      return <pre className="notion-code"><code>{block.code}</code></pre>;
    case 'image':
      return (
        <figure className="notion-image">
          <img src={block.url} alt={block.caption.map(span => span.text).join('')} loading="lazy" />
          {block.caption.length > 0 && <figcaption><NotionRichText spans={block.caption} /></figcaption>}
        </figure>
      );
    case 'columns':
      return (
        <div className="notion-columns" style={{ '--notion-column-count': block.columns.length } as React.CSSProperties}>
          {block.columns.map((column, index) => (
            <div className="notion-column" key={index}><NotionBlocks blocks={column} /></div>
          ))}
        </div>
      );
    case 'divider':
      return <hr className="notion-divider" />;
    default:
      return null;
  }
};

export default NotionBlocks;
