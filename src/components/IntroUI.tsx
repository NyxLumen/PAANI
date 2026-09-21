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

    gsap.set(el, { opacity: 0, y: 15, filter: 'blur(8px)' });

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete();
      },
    });

    // Reveal in
    tl.to(el, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 1.8,
      ease: 'power2.out',
    });

    // Hold duration
    tl.to({}, { duration: holdDuration });

    // Dissolve out
    tl.to(el, {
      opacity: 0,
      y: -10,
      filter: 'blur(6px)',
      duration: 1.4,
      ease: 'power2.inOut',
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
