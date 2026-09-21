import React, { useRef } from 'react';
import gsap from 'gsap';
import { ScribbleStart } from './ScribbleStart';

interface OpeningUIProps {
  onStart: () => void;
  isVisible: boolean;
}

export const OpeningUI: React.FC<OpeningUIProps> = ({ onStart, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const startRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    // 0.0s: Trigger camera timeline immediately
    onStart();

    // 0.0s: START begins disappearing
    gsap.to(startRef.current, {
      opacity: 0,
      scale: 0.88,
      duration: 0.28,
      ease: 'power2.in',
    });

    // 0.0–0.8s: PĀNI recedes and fades
    gsap.to(titleRef.current, {
      y: -28,
      opacity: 0,
      scale: 0.94,
      filter: 'blur(6px)',
      duration: 0.8,
      ease: 'power2.in',
    });

    gsap.to(subtitleRef.current, {
      y: -14,
      opacity: 0,
      filter: 'blur(4px)',
      duration: 0.7,
      delay: 0.05,
      ease: 'power2.in',
    });
  };

  if (!isVisible) return null;

  return (
    <div ref={containerRef} className="opening-ui-container">
      <div className="opening-content">
        <h1 ref={titleRef} className="main-title">
          PĀNI
        </h1>
        <p ref={subtitleRef} className="main-subtitle">
          one drop. infinite journeys.
        </p>
        <div ref={startRef} className="start-wrapper">
          <ScribbleStart onClick={handleStart} />
        </div>
      </div>
    </div>
  );
};
