import { useEffect, useState } from 'react';

// Pip indexes (3×3 grid, row-major) lit per face value.
const PIP_MAP: Partial<Record<number, number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const [displayValue, setDisplayValue] = useState(value || 1);

  useEffect(() => {
    if (!rolling) {
      setDisplayValue(value || 1);
      return;
    }

    // Slower, deliberate tumble through random faces while rolling
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 110);

    return () => clearInterval(interval);
  }, [rolling, value]);

  const on = PIP_MAP[rolling ? displayValue : value || displayValue] ?? [];

  return (
    <div
      style={{
        width: 80,
        height: 80,
        borderRadius: 17,
        background: 'linear-gradient(150deg,#fbf5e6,#e4d8bf)',
        boxShadow:
          'inset 0 2px 4px rgba(255,255,255,.8),inset 0 -6px 10px rgba(140,120,80,.35),0 14px 24px -10px rgba(0,0,0,.7)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr 1fr',
        padding: 13,
        gap: 3,
        animation: rolling ? 'shake 0.65s ease-in-out infinite' : 'none',
        border: '1px solid #cbb99a',
        transition: 'transform 0.2s ease',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} style={{ display: 'grid', placeItems: 'center' }}>
          {on.includes(i) ? (
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%,#5a4a2e,#241a0c)',
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,.5)',
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
