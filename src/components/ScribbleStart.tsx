import React, { useState } from 'react';

interface ScribbleStartProps {
  onClick: () => void;
  disabled?: boolean;
}

export const ScribbleStart: React.FC<ScribbleStartProps> = ({ onClick, disabled }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="scribble-start-btn"
      aria-label="Begin Journey"
    >
      <span className="scribble-text">start</span>
      
      {/* Organic handwritten scribble underline & loop */}
      <svg
        className={`scribble-svg ${isHovered ? 'hovered' : ''}`}
        viewBox="0 0 140 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Organic hand-drawn scribble stroke */}
        <path
          d="M 6,28 C 32,24 68,22 132,25 C 105,33 42,35 15,31 C 55,30 115,26 128,34"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="scribble-path-main"
        />
        {/* Subtle accent loop */}
        <path
          d="M 125,24 C 134,22 136,28 130,32 C 122,36 108,37 92,38"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
          className="scribble-path-accent"
        />
      </svg>
    </button>
  );
};
