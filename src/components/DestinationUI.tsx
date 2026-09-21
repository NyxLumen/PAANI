import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface DestinationUIProps {
  sceneId: 'shore' | 'deep';
  onRestart: () => void;
}

export const DestinationUI: React.FC<DestinationUIProps> = ({ sceneId, onRestart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    gsap.fromTo(
      el,
      { opacity: 0, y: 16, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 2.0, ease: 'sine.out', delay: 0.6 }
    );
  }, [sceneId]);

  const isShore = sceneId === 'shore';

  return (
    <div ref={containerRef} className="destination-ui-container">
      <div className="destination-content">
        <h2 className="destination-title">
          {isShore ? 'THE SHORE' : 'THE DEEP'}
        </h2>
        <p className="destination-desc">
          {isShore
            ? 'Seawater traveling across warm sand. One drop meeting the shore.'
            : 'Descending into silence. One drop returning to the abyss.'}
        </p>

        <div className="destination-actions">
          <button onClick={onRestart} className="destination-restart-btn" aria-label="Loop Journey">
            <span className="restart-icon">↺</span>
            <span className="restart-label">begin anew</span>
          </button>
        </div>
      </div>
    </div>
  );
};
