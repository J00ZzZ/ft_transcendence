export const POINTS_PER_PIECE = 2;
export const WIN_BONUS_PIECE = 1;

// Rating change for one finished game: each piece that reached the goal is worth
// POINTS_PER_PIECE (half in PvE), plus WIN_BONUS_PIECE for the winner.
// See docs/backend/backend-player-stats-module.md (Rating Delta).
export function ratingDeltaFor(input: {
  piecesInGoal: number;
  rank: number;
  gameType: 'PVP' | 'PVE';
}): number {
  const effectivePieces = input.piecesInGoal + (input.rank === 1 ? WIN_BONUS_PIECE : 0);
  const perPiece = input.gameType === 'PVE' ? POINTS_PER_PIECE / 2 : POINTS_PER_PIECE;
  return effectivePieces * perPiece;
}
