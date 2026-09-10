export interface RankTier {
  key: 'mamee' | 'milo' | 'paddle' | 'honey' | 'choki' | 'super'
  name: string
  badge: string
  minRating: number
  color: string
  bg: string
  border: string
  glow: string
}

export const RANK_MAMEE: RankTier = {
  key: 'mamee',
  name: 'MAMEE MONSTER',
  badge: '[MAMEE]',
  minRating: 1400,
  color: '#ff1744',
  bg: 'rgba(255, 23, 68, 0.16)',
  border: 'rgba(255, 23, 68, 0.5)',
  glow: 'rgba(255, 23, 68, 0.6)',
}

export const RANK_MILO: RankTier = {
  key: 'milo',
  name: 'MILO DINOSAUR',
  badge: '[MILO]',
  minRating: 1350,
  color: '#bd00ff',
  bg: 'rgba(189, 0, 255, 0.14)',
  border: 'rgba(189, 0, 255, 0.45)',
  glow: 'rgba(189, 0, 255, 0.55)',
}

export const RANK_PADDLE: RankTier = {
  key: 'paddle',
  name: 'PADDLE POP',
  badge: '[PADDLE]',
  minRating: 1200,
  color: '#00f0ff',
  bg: 'rgba(0, 240, 255, 0.14)',
  border: 'rgba(0, 240, 255, 0.45)',
  glow: 'rgba(0, 240, 255, 0.45)',
}

export const RANK_HONEY: RankTier = {
  key: 'honey',
  name: 'HONEY STARS',
  badge: '[HONEY]',
  minRating: 1000,
  color: '#ffd700',
  bg: 'rgba(255, 215, 0, 0.14)',
  border: 'rgba(255, 215, 0, 0.45)',
  glow: 'rgba(255, 215, 0, 0.45)',
}

export const RANK_CHOKI: RankTier = {
  key: 'choki',
  name: 'CHOKI CHOKI',
  badge: '[CHOKI]',
  minRating: 0,
  color: '#d7a15c',
  bg: 'rgba(215, 161, 92, 0.14)',
  border: 'rgba(215, 161, 92, 0.45)',
  glow: 'rgba(215, 161, 92, 0.45)',
}

export const RANKS: RankTier[] = [
  RANK_MAMEE,
  RANK_MILO,
  RANK_PADDLE,
  RANK_HONEY,
  RANK_CHOKI,
]

/**
 * Derives player rank tier based consistently on rating and leaderboard standing.
 * - MAMEE MONSTER: Top 3 on leaderboard (#1, #2, #3 podium) AND must reach Milo Dinosaur rating (rating >= 1350).
 * - MILO DINOSAUR: rating >= 1350 (Dark matter plasma with aura & particles).
 * - PADDLE POP: rating 1200 - 1349 (Cyber cyan laser & rainbow prism).
 * - HONEY STARS: rating 1000 - 1199 (Cosmic starlight gold).
 * - CHOKI CHOKI: rating < 1000 (Cyber bronze wireframe).
 */
export function getRankTier(rating: number = 0, rank?: number | null): RankTier {
  // Must be Top 3 on leaderboard AND meet Milo Dinosaur threshold (>= 1350) -> MAMEE MONSTER
  if (rating >= 1350 && typeof rank === 'number' && rank > 0 && rank <= 3) {
    return RANK_MAMEE
  }
  if (rating >= 1350) {
    return RANK_MILO
  }
  if (rating >= 1200) {
    return RANK_PADDLE
  }
  if (rating >= 1000) {
    return RANK_HONEY
  }
  return RANK_CHOKI
}
