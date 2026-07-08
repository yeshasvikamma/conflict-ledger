import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

export function Card({ children, padded = true, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`border border-rule bg-paper-raised ${padded ? 'p-5 sm:p-6' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  selected?: boolean;
};

export function CardButton({
  children,
  selected = false,
  className = '',
  ...rest
}: CardButtonProps) {
  return (
    <button
      type="button"
      className={`group border bg-paper-raised p-5 text-left transition-colors sm:p-6 ${
        selected ? 'border-accent' : 'border-rule hover:border-rule-strong'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
