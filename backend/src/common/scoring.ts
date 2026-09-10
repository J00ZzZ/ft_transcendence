export const POINTS_PER_PIECE = 2;
export const WIN_BONUS_PIECE = 1;

export function ratingDeltaFor(input: {
  piecesInGoal: number;
  rank: number;
  gameType: 'PVP' | 'PVE';
}): number {
  const effectivePieces = (input.piecesInGoal ?? 0) + (input.rank === 1 ? WIN_BONUS_PIECE : 0);
  const perPiece = input.gameType === 'PVE' ? POINTS_PER_PIECE / 2 : POINTS_PER_PIECE;
  return effectivePieces * perPiece;
}
