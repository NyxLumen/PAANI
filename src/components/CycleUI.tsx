import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface CycleUIProps {
  sceneId: 'cloudAscent' | 'clouds' | 'rain';
  onAdvance: () => void;
}

export const CycleUI: React.FC<CycleUIProps> = ({ sceneId, onAdvance }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;

    gsap.set(el, { opacity: 0, y: 12, filter: 'blur(6px)' });

    // Subtle fade in after scene establishes
    const tween = gsap.to(el, {
      opacity: 0.85,
      y: 0,
      filter: 'blur(0px)',
      duration: 1.8,
      delay: 1.2,
      ease: 'power2.out',
    });

    return () => {
      tween.kill();
    };
  }, [sceneId]);

  const handleClick = () => {
    if (!promptRef.current) return;
    gsap.to(promptRef.current, {
      opacity: 0,
      filter: 'blur(4px)',
      duration: 0.6,
      ease: 'power2.in',
      onComplete: () => {
        onAdvance();
      },
    });
  };

  const getLabel = () => {
    switch (sceneId) {
      case 'cloudAscent':
        return { action: 'GATHER', arrow: '↑', sub: 'into the atmosphere' };
      case 'clouds':
        return { action: 'RELEASE', arrow: '↓', sub: 'condensing into rain' };
      case 'rain':
        return { action: 'REJOIN THE OCEAN', arrow: '↓', sub: 'the cycle returns' };
    }
  };

  const { action, arrow, sub } = getLabel();

  return (
    <div ref={containerRef} className="cycle-ui-container">
      <button
        ref={promptRef}
        onClick={handleClick}
        className="cycle-continuation-btn"
        aria-label={action}
      >
        <span className="cycle-arrow">{arrow}</span>
        <span className="cycle-action">{action}</span>
        <span className="cycle-sub">{sub}</span>
      </button>
    </div>
  );
};
