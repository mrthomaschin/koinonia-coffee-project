import React from 'react';
import './Button.css';
import './Typography.css';

export type ButtonVariant = 'primary' | 'outline' | 'text';

type ButtonOwnProps<E extends React.ElementType> = {
  as?: E;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
};

export type ButtonProps<E extends React.ElementType> = ButtonOwnProps<E> &
  Omit<React.ComponentPropsWithoutRef<E>, keyof ButtonOwnProps<E>>;

const classesFor = (variant: ButtonVariant, className: string): string =>
  variant === 'text'
    ? `ui-text-link ${className}`.trim()
    : `ui-button ui-button--${variant} ${className}`.trim();

/**
 * Shared CTA/link component. Renders a <button> by default; pass `as="a"`
 * or `as={Link}` (react-router) to render a different element while
 * keeping the same visual variants. See Button.css / Typography.css for
 * the underlying styles, which are driven by src/styles/tokens.css.
 */
export function Button<E extends React.ElementType = 'button'>({
  as,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonProps<E>): React.ReactElement {
  const Component = (as || 'button') as React.ElementType;
  return (
    <Component className={classesFor(variant, className)} {...rest}>
      {children}
    </Component>
  );
}

export default Button;
