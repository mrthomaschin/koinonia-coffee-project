import React, { HTMLAttributes, ReactNode } from 'react';
import './Typography.css';

type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'a';

interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: TextElement;
  children: ReactNode;
}

const Typography: React.FC<TypographyProps> = ({ as = 'p', children, className = '', ...props }) =>
  React.createElement(as, { ...props, className: className ? `ui-text ${className}` : 'ui-text' }, children);

export const Eyebrow: React.FC<TypographyProps> = (props) => <Typography {...props} className={`ui-eyebrow ${props.className || ''}`} />;

export const BodyText: React.FC<TypographyProps> = (props) => <Typography {...props} className={`ui-body-text ${props.className || ''}`} />;

export const DisplayHeading: React.FC<Omit<TypographyProps, 'as'>> = (props) => <Typography {...props} as="h1" className={`ui-display-heading ${props.className || ''}`} />;

export const SectionHeading: React.FC<Omit<TypographyProps, 'as'>> = (props) => <Typography {...props} as="h2" className={`ui-section-heading ${props.className || ''}`} />;

export const TextLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({ children, className = '', ...props }) => (
  <a {...props} className={`ui-text-link ${className}`.trim()}>{children}</a>
);

export default Typography;
