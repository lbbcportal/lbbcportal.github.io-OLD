import React from 'react';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'accent' | 'contrast' | 'current';
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'w-3.5 h-3.5 border-[2px]',
  sm: 'w-4 h-4 border-[2px]',
  md: 'w-5 h-5 border-[2px]',
  lg: 'w-8 h-8 border-[2.5px]'
};

const DOTS_CLASSES: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'text-[11px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg'
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'sm',
  variant = 'accent',
  label = 'Loading',
  className = ''
}) => {
  const trackAndArcStyle: React.CSSProperties | undefined =
    variant === 'contrast' || variant === 'current'
      ? {
          borderColor: 'color-mix(in srgb, currentColor 28%, transparent)',
          borderTopColor: 'currentColor',
        }
      : {
          borderColor: 'var(--accent-tint-strong)',
          borderTopColor: 'var(--accent-ink)',
        };

  const dotsColor =
    variant === 'contrast' || variant === 'current'
      ? 'text-current'
      : 'text-accent';

  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
    >
      <span
        aria-hidden="true"
        style={trackAndArcStyle}
        className={`motion-reduce:hidden inline-block rounded-full border-solid animate-spin ${SIZE_CLASSES[size]}`}
      />
      <span
        aria-hidden="true"
        className={`hidden motion-reduce:inline-block font-bold tracking-widest leading-none select-none ${DOTS_CLASSES[size]} ${dotsColor}`}
      >
        ...
      </span>
    </span>
  );
};

export interface PageLoadingProps {
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({
  label = 'Loading...',
  fullScreen = false,
  className = ''
}) => {
  if (fullScreen) {
    return (
      <div
        className={`min-h-screen w-full flex flex-col items-center justify-center p-4 bg-canvas text-main gap-3 ${className}`}
      >
        <Spinner size="lg" variant="accent" label={label} />
        <p className="text-sm font-medium text-sec">{label}</p>
      </div>
    );
  }

  return (
    <div
      className={`w-full py-16 sm:py-24 px-4 flex flex-col items-center justify-center gap-3 text-center ${className}`}
    >
      <Spinner size="lg" variant="accent" label={label} />
      <p className="text-sm font-medium text-sec">{label}</p>
    </div>
  );
};
