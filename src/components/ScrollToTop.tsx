import React, { useEffect, useRef } from 'react';

interface ScrollToTopProps {
  pageKey: string;
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({ pageKey }) => {
  const prevKeyRef = useRef<string>(pageKey);

  useEffect(() => {
    if (prevKeyRef.current === pageKey) return;
    prevKeyRef.current = pageKey;

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const mainEl = document.querySelector<HTMLElement>('main');
      if (mainEl && mainEl.scrollTop > 0) {
        mainEl.scrollTop = 0;
      }
    }
  }, [pageKey]);

  return null;
};
