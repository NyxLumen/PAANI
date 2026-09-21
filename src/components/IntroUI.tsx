import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface IntroUIProps {
  text: string;
  holdDuration: number;
  onComplete: () => void;
}

export const IntroUI: React.FC<IntroUIProps> = ({ text, holdDuration, onComplete }) => {
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    gsap.set(el, { opacity: 0, y: 8, filter: 'blur(5px)' });

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete();
      },
    });

    // Gentle contemplative reveal
    tl.to(el, {
      opacity: 0.92,
      y: 0,
      filter: 'blur(0px)',
      duration: 2.0,
      ease: 'sine.out',
    });

    // Hold briefly
    tl.to({}, { duration: holdDuration });

    // Quiet dissolve
    tl.to(el, {
      opacity: 0,
      y: -6,
      filter: 'blur(4px)',
      duration: 1.6,
      ease: 'sine.inOut',
    });

    return () => {
      tl.kill();
    };
  }, [holdDuration, onComplete]);

  return (
    <div className="intro-ui-container">
      <p ref={textRef} className="intro-narrative-text">
        {text}
      </p>
    </div>
  );
};
