import React, { useEffect, useRef, useState } from 'react';

interface ParallaxBackgroundProps {
  imageData?: string;
  dimming?: number;
}

const MAX_SHIFT_PX = 18;
const IMAGE_SCALE = 1.08;

export const ParallaxBackground: React.FC<ParallaxBackgroundProps> = ({
  imageData = '',
  dimming = 20,
}) => {
  const imgLayerRef = useRef<HTMLDivElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const hasActiveImage = Boolean(imageData && !imageFailed);
  const safeDimming = Math.max(0, Math.min(60, Math.round(Number.isFinite(dimming) ? dimming : 20)));

  useEffect(() => {
    setImageFailed(false);
  }, [imageData]);

  useEffect(() => {
    const layer = imgLayerRef.current;
    if (!hasActiveImage || !layer) return;

    const resetTransform = () => {
      layer.style.transform = `translate3d(0px, 0px, 0) scale(${IMAGE_SCALE})`;
    };

    resetTransform();

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchDeviceQuery = window.matchMedia('(hover: none), (pointer: coarse)');

    if (reducedMotionQuery.matches || touchDeviceQuery.matches) {
      return;
    }

    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;
    let rafId: number | null = null;
    let lastTime = 0;

    const tick = (now: number) => {
      if (reducedMotionQuery.matches || touchDeviceQuery.matches) {
        currentX = 0;
        currentY = 0;
        targetX = 0;
        targetY = 0;
        resetTransform();
        rafId = null;
        return;
      }

      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
      lastTime = now;
      const factor = 1 - Math.exp(-6.5 * dt);

      currentX += (targetX - currentX) * factor;
      currentY += (targetY - currentY) * factor;

      const dx = targetX - currentX;
      const dy = targetY - currentY;

      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        currentX = targetX;
        currentY = targetY;
        layer.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) scale(${IMAGE_SCALE})`;
        rafId = null;
        lastTime = 0;
        return;
      }

      layer.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) scale(${IMAGE_SCALE})`;
      rafId = window.requestAnimationFrame(tick);
    };

    const ensureAnimating = () => {
      if (rafId === null) {
        lastTime = 0;
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || reducedMotionQuery.matches || touchDeviceQuery.matches) {
        return;
      }
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const nx = Math.max(-1, Math.min(1, (e.clientX / vw - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (e.clientY / vh - 0.5) * 2));
      const maxOffset = Math.min(MAX_SHIFT_PX, Math.max(8, Math.floor(Math.min(vw, vh) * 0.03)));
      targetX = -nx * maxOffset;
      targetY = -ny * maxOffset;
      ensureAnimating();
    };

    const handlePointerLeave = () => {
      targetX = 0;
      targetY = 0;
      ensureAnimating();
    };

    const handlePreferenceChange = () => {
      if (reducedMotionQuery.matches || touchDeviceQuery.matches) {
        currentX = 0;
        currentY = 0;
        targetX = 0;
        targetY = 0;
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        resetTransform();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave, { passive: true });
    reducedMotionQuery.addEventListener?.('change', handlePreferenceChange);
    touchDeviceQuery.addEventListener?.('change', handlePreferenceChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
      reducedMotionQuery.removeEventListener?.('change', handlePreferenceChange);
      touchDeviceQuery.removeEventListener?.('change', handlePreferenceChange);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [hasActiveImage]);

  if (!hasActiveImage) {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full blur-3xl login-glow-orb" />
        <div className="absolute -bottom-36 left-1/3 w-[420px] h-[420px] rounded-full blur-3xl opacity-25 bg-sky-500/20" />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={imgLayerRef}
        className="absolute inset-0 w-full h-full will-change-transform"
        style={{ transform: `translate3d(0px, 0px, 0) scale(${IMAGE_SCALE})` }}
      >
        <img
          src={imageData}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="w-full h-full object-cover object-center select-none"
        />
      </div>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0, 0, 0, ${safeDimming / 100})` }}
      />
    </div>
  );
};
