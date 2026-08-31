import React from 'react';
import ReactMarkdown from 'react-markdown';
import './NotionBody.css';

interface NotionBodyProps {
  content: string;
  className?: string;
  fallback?: string;
}

const websiteDescriptionOnly = (content: string): string => {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex((line) => /^#\s+Website Description\s*$/i.test(line.trim()));
  if (headingIndex >= 0) {
    const remaining = lines.slice(headingIndex + 1);
    const nextHeadingIndex = remaining.findIndex((line) => /^#\s+/.test(line.trim()));
    return remaining.slice(0, nextHeadingIndex < 0 ? undefined : nextHeadingIndex).join('\n').trim();
  }

  // Preserve already-normalized plain text responses. If markdown headings
  // exist without Website Description, do not expose another section such as Summary.
  return /^#\s+/.test(content.trim()) ? '' : content;
};

/** Renders markdown returned from a Notion page with the shared body treatment. */
const NotionBody: React.FC<NotionBodyProps> = ({ content, className = '', fallback = '' }) => (
  <div className={`notion-body ${className}`.trim()}>
    <ReactMarkdown>{websiteDescriptionOnly(content) || fallback}</ReactMarkdown>
  </div>
);

export default NotionBody;
