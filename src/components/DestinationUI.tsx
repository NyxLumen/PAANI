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
      { opacity: 0, y: 20, filter: 'blur(8px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.8, ease: 'power2.out', delay: 0.4 }
    );
  }, [sceneId]);

  const isShore = sceneId === 'shore';

  return (
    <div ref={containerRef} className="destination-ui-container">
      <div className="destination-content">
        <span className="destination-pretitle">CURRENT DESTINATION</span>
        <h2 className="destination-title">
          {isShore ? 'COASTAL SHORE' : 'THE ABYSSAL DEEP'}
        </h2>
        <p className="destination-desc">
          {isShore
            ? 'Warm sunlight pierces the shallow reef. The current scatters across golden sand.'
            : 'Light ceases. The immense weight of water holds quiet dominion over the ocean floor.'}
        </p>

        <div className="destination-actions">
          <button onClick={onRestart} className="destination-restart-btn">
            <span>↺</span>
            <span>RETURN TO OCEAN</span>
          </button>
        </div>
      </div>
    </div>
  );
};
