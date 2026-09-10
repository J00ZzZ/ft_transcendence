import { useEffect, useState } from 'react'

/** Pip indexes (3×3 grid, row-major) lit per face value. */
const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const [displayValue, setDisplayValue] = useState(value || 1)

  useEffect(() => {
    if (!rolling) {
      setDisplayValue(value || 1)
      return
    }

    // Slower, deliberate tumble through random faces while rolling
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1)
    }, 110)

    return () => clearInterval(interval)
  }, [rolling, value])

  const on = PIP_MAP[rolling ? displayValue : (value || displayValue)] || []

  return (
    <div
      className="retro-die-cube"
      style={{
        width: 80,
        height: 80,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr 1fr',
        padding: 13,
        gap: 3,
        animation: rolling ? 'shake 0.65s ease-in-out infinite' : 'none',
        transition: 'transform 0.2s ease',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} style={{ display: 'grid', placeItems: 'center' }}>
          {on.includes(i) ? (
            <div
              className="retro-die-pip"
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
