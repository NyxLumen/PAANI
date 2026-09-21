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
    // 1. START disappears immediately or quick fade
    // 2. Title and subtitle recede and fade
    const tl = gsap.timeline({
      onComplete: () => {
        onStart();
      },
    });

    tl.to(startRef.current, {
      opacity: 0,
      scale: 0.9,
      duration: 0.45,
      ease: 'power2.in',
    });

    tl.to(
      titleRef.current,
      {
        y: -35,
        opacity: 0,
        scale: 0.92,
        filter: 'blur(6px)',
        duration: 1.3,
        ease: 'power2.in',
      },
      '-=0.2'
    );

    tl.to(
      subtitleRef.current,
      {
        y: -20,
        opacity: 0,
        filter: 'blur(4px)',
        duration: 1.0,
        ease: 'power2.in',
      },
      '-=1.1'
    );
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
