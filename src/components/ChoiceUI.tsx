import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface ChoiceUIProps {
  onHoverChoice: (direction: 'left' | 'down' | null) => void;
  onSelectChoice: (choice: 'shore' | 'deep') => void;
}

export const ChoiceUI: React.FC<ChoiceUIProps> = ({ onHoverChoice, onSelectChoice }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const leftChoiceRef = useRef<HTMLButtonElement>(null);
  const rightChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prompt = promptRef.current;
    const left = leftChoiceRef.current;
    const right = rightChoiceRef.current;

    if (!prompt || !left || !right) return;

    gsap.set([prompt, left, right], { opacity: 0, filter: 'blur(8px)' });
    gsap.set(prompt, { y: -15 });
    gsap.set(left, { x: -20 });
    gsap.set(right, { x: 20 });

    const tl = gsap.timeline();
    tl.to(prompt, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 1.6,
      ease: 'power2.out',
    });
    tl.to(
      [left, right],
      {
        opacity: 0.85,
        x: 0,
        filter: 'blur(0px)',
        duration: 1.4,
        stagger: 0.2,
        ease: 'power2.out',
      },
      '-=0.8'
    );

    return () => {
      tl.kill();
    };
  }, []);

  const handleSelect = (choice: 'shore' | 'deep') => {
    onHoverChoice(null);
    gsap.to(containerRef.current, {
      opacity: 0,
      filter: 'blur(6px)',
      duration: 0.8,
      ease: 'power2.in',
      onComplete: () => {
        onSelectChoice(choice);
      },
    });
  };

  return (
    <div ref={containerRef} className="choice-ui-container">
      {/* Central subtle prompt */}
      <h2 ref={promptRef} className="choice-prompt-text">
        WHERE WILL THE CURRENT TAKE YOU?
      </h2>

      {/* Environmental directional choices */}
      <div className="choice-options-wrapper">
        <button
          ref={leftChoiceRef}
          className="choice-btn choice-left"
          onMouseEnter={() => onHoverChoice('left')}
          onMouseLeave={() => onHoverChoice(null)}
          onClick={() => handleSelect('shore')}
        >
          <span className="choice-indicator">←</span>
          <span className="choice-label">FOLLOW THE SHORE</span>
          <span className="choice-subtext">sunlit currents &amp; coastal reaches</span>
        </button>

        <button
          ref={rightChoiceRef}
          className="choice-btn choice-right"
          onMouseEnter={() => onHoverChoice('down')}
          onMouseLeave={() => onHoverChoice(null)}
          onClick={() => handleSelect('deep')}
        >
          <span className="choice-label">DESCEND</span>
          <span className="choice-indicator">↓</span>
          <span className="choice-subtext">the silent abyss &amp; deep trench</span>
        </button>
      </div>
    </div>
  );
};
