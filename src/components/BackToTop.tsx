import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface BackToTopProps {
  hidden?: boolean;
}

const SHOW_SCROLL_THRESHOLD = 400;
const HIDE_SCROLL_THRESHOLD = 280;
const MIN_OVERFLOW_FOR_LONG_PAGE = 450;

function hasVisibleModalOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  const candidates = document.querySelectorAll<HTMLElement>(
    '.fixed.inset-0, [role="dialog"][aria-modal="true"]'
  );
  for (let i = 0; i < candidates.length; i += 1) {
    const el = candidates[i];
    if (el.getClientRects().length === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }
    return true;
  }
  return false;
}

function getMainScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const mainEl = document.querySelector<HTMLElement>('main');
  if (!mainEl) return null;
  const style = window.getComputedStyle(mainEl);
  const canScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
  if (canScroll && mainEl.scrollHeight > mainEl.clientHeight + 20) {
    return mainEl;
  }
  return null;
}

export const BackToTop: React.FC<BackToTopProps> = ({ hidden = false }) => {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const activeScrollerRef = useRef<HTMLElement | null>(null);

  const evaluateVisibility = useCallback(() => {
    if (typeof window === 'undefined' || hidden || hasVisibleModalOverlay()) {
      if (visibleRef.current) {
        visibleRef.current = false;
        setVisible(false);
      }
      return;
    }

    const mainScroller = getMainScrollContainer();
    const docEl = document.documentElement;
    const winScrollTop = window.scrollY || docEl.scrollTop || document.body.scrollTop || 0;
    const winScrollHeight = Math.max(docEl.scrollHeight, document.body.scrollHeight);
    const winClientHeight = window.innerHeight || docEl.clientHeight;

    let scrollTop = winScrollTop;
    let scrollHeight = winScrollHeight;
    let clientHeight = winClientHeight;
    activeScrollerRef.current = null;

    if (mainScroller && mainScroller.scrollTop > 0 && winScrollTop === 0) {
      scrollTop = mainScroller.scrollTop;
      scrollHeight = mainScroller.scrollHeight;
      clientHeight = mainScroller.clientHeight;
      activeScrollerRef.current = mainScroller;
    }

    const isLongPage = scrollHeight > clientHeight + MIN_OVERFLOW_FOR_LONG_PAGE;
    if (!isLongPage) {
      if (visibleRef.current) {
        visibleRef.current = false;
        setVisible(false);
      }
      return;
    }

    const nextVisible = visibleRef.current
      ? scrollTop > HIDE_SCROLL_THRESHOLD
      : scrollTop >= SHOW_SCROLL_THRESHOLD;

    if (nextVisible !== visibleRef.current) {
      visibleRef.current = nextVisible;
      setVisible(nextVisible);
    }
  }, [hidden]);

  useEffect(() => {
    let rafId = 0;
    const scheduleEvaluate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        evaluateVisibility();
      });
    };

    evaluateVisibility();

    window.addEventListener('scroll', scheduleEvaluate, { passive: true });
    window.addEventListener('resize', scheduleEvaluate, { passive: true });

    const mainEl = document.querySelector<HTMLElement>('main');
    if (mainEl) {
      mainEl.addEventListener('scroll', scheduleEvaluate, { passive: true });
    }

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleEvaluate)
        : null;
    if (resizeObserver) {
      resizeObserver.observe(document.body);
      if (mainEl) resizeObserver.observe(mainEl);
    }

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(scheduleEvaluate)
        : null;
    if (mutationObserver) {
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden', 'aria-modal'],
      });
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleEvaluate);
      window.removeEventListener('resize', scheduleEvaluate);
      if (mainEl) {
        mainEl.removeEventListener('scroll', scheduleEvaluate);
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [evaluateVisibility]);

  const handleScrollToTop = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const scroller = activeScrollerRef.current;
    if (scroller && scroller.scrollTop > 0) {
      scroller.scrollTo({ top: 0, behavior });
      return;
    }

    window.scrollTo({ top: 0, behavior });
    if (document.documentElement.scrollTop > 0) {
      document.documentElement.scrollTo({ top: 0, behavior });
    }
    if (document.body.scrollTop > 0) {
      document.body.scrollTo({ top: 0, behavior });
    }
  };

  return (
    <div
      className="fixed left-0 right-0 z-30 flex justify-center pointer-events-none px-4"
      style={{ top: 'max(77px, calc(env(safe-area-inset-top, 0px) + 12px))' }}
    >
      <button
        type="button"
        onClick={handleScrollToTop}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        aria-label="Back to top"
        className={`back-to-top-pill inline-flex items-center justify-center gap-1 sm:gap-1.5 h-7 px-2.5 text-[11px] sm:h-[34px] sm:px-3.5 sm:text-xs font-semibold rounded-full select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
          visible ? 'is-visible' : ''
        }`}
      >
        <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
        <span>Back to top</span>
      </button>
    </div>
  );
};
