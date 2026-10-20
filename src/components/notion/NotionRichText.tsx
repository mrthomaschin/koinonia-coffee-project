import React from 'react';
import { RichTextSpan } from './types';

const isInternal = (href: string): boolean => href.startsWith('/') && !href.startsWith('//');

/** Renders Notion rich text spans, keeping bold, italic, underline, strikethrough, code and links. */
const NotionRichText: React.FC<{ spans: RichTextSpan[] }> = ({ spans }) => (
  <>
    {spans.map((span, index) => {
      let node: React.ReactNode = span.text;
      if (span.code) node = <code className="notion-inline-code">{node}</code>;
      if (span.bold) node = <strong>{node}</strong>;
      if (span.italic) node = <em>{node}</em>;
      if (span.underline) node = <u>{node}</u>;
      if (span.strikethrough) node = <s>{node}</s>;
      if (span.href) {
        node = isInternal(span.href)
          ? <a className="notion-link" href={span.href}>{node}</a>
          : <a className="notion-link" href={span.href} target="_blank" rel="noopener noreferrer">{node}</a>;
      }
      return <React.Fragment key={index}>{node}</React.Fragment>;
    })}
  </>
);

export default NotionRichText;
