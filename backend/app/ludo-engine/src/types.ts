export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';
export type PlayerStatus = 'active' | 'exited' | 'resigned' | 'inactive' | 'disconnected';
export type TurnPhase = 'WAITING_FOR_ROLL' | 'WAITING_FOR_MOVE';

export type PieceId = string; // Format: "{color}-{index}" e.g., "red-0", "blue-3"

export interface Piece {
	id: PieceId;
	color: PlayerColor;
	step: number; // -1=exited, 0=prison, 1-51=track, 52-56=home, 57=goal
	isInGoal?: boolean; // frontend-compatible: true when step === 57
	isInBase?: boolean; // frontend-compatible: true when step <= 0
}

export interface PlayerMeta {
	color: PlayerColor;
	status: PlayerStatus;
	username: string;
	displayName?: string;
	isBot: boolean;
	isConnected: boolean;
	piecesInGoal: number;
	hasRolled: boolean;
	consecutiveSixes: number;
	bonusRoll: boolean;
	isFinished: boolean;
	finishedAt?: string;
	stats: {
		turns: number;
		captures: number;
		piecesInGoal: number;
	};
}

export interface ClashState {
	attacker: PlayerColor;
	defender: PlayerColor;
	attackerKey: string;
	defenderKey: string;
	target: number;
	duration: number;
	startedAt: number;
	attackerPresses: number;
	defenderPresses: number;
	disconnectTimestamp?: number;
	reconnectDeadline?: number;
	waitingForReconnect?: PlayerColor;
}

export interface DisconnectState {
	color: PlayerColor;
	disconnectedAt: number;
	reconnectDeadline: number;
}

export interface GameState {
	id: string;
	pieces: Piece[]; // 16 pieces: 4 per player × 4 players
	players: PlayerMeta[];
	currentTurn: PlayerColor;
	consecutiveSixes: number;
	moveCounter: number; // Total moves made in the game
	turnPhase: TurnPhase;
	firstRollOfTurn: boolean; // True until the six-bonus has been used once during the current player's turn-holding streak
	pendingLegalMoves: LegalMove[]; // Server-authoritative legal moves after roll
	pendingDiceValue?: number; // The dice value from the most recent roll (server-authoritative)
	pendingIsFirstRoll?: boolean; // Whether pendingDiceValue came from the first roll of the turn (server-authoritative)
	disconnectedPlayers: DisconnectState[]; // Players temporarily disconnected (grace period)
	status: 'waiting' | 'active' | 'finished';
	winner?: PlayerColor;
	resultDetail?: string;
	resultSubmitted?: boolean; // Prevents duplicate backend submissions
	botBusy?: boolean; // Prevents overlapping bot turns
	clash?: ClashState;
	clashMode: boolean; // Whether clash minigame is enabled (false = standard capture)
	readyPlayers: PlayerColor[]; // Players who have clicked "ready"
	paused?: boolean;
	pauseTurnOwner?: PlayerColor;
}

export interface MoveResult {
	ply: number;
	color: PlayerColor;
	diceValue: number;
	pieceId: PieceId;
	from: number;
	path: number[]; // Every intermediate step from `from`+1 through `to`, for step-by-step movement on the frontend
	to: number;
	captured: boolean;
	capturedPieceIds?: PieceId[]; // Every opponent piece sent home from the landing square (a stacked block sends all of them back)
	enteredHome: boolean;
	bonusRoll: boolean;
}

export interface LegalMove {
	pieceId: PieceId;
	from: number;
	to: number;
	isCapture: boolean;
	isHomeEntry: boolean;
}

export interface MovePieceOutput {
	result: MoveResult;
	state: GameState;
}

/**
 * Events emitted by the engine — one source of truth for game lifecycle.
 */
export type GameEvent =
	| { type: 'dice_rolled'; gameId: string; value: number; legalMoves: LegalMove[]; bonusRoll: boolean; currentTurn: PlayerColor; forfeited?: boolean }
	| { type: 'piece_moved'; gameId: string; result: MoveResult }
	| { type: 'game_ended'; gameId: string; winner: PlayerColor; resultDetail: string }
	| { type: 'game_started'; gameId: string }
	| { type: 'player_exited'; gameId: string; color: PlayerColor }
	| { type: 'player_resigned'; gameId: string; color: PlayerColor }
	| { type: 'player_aborted'; gameId: string; color: PlayerColor; username: string }
	| { type: 'player_disconnected'; gameId: string; color: PlayerColor }
	| { type: 'player_reconnected'; gameId: string; color: PlayerColor }
	| { type: 'clash_start'; gameId: string; attackerKey: string; defenderKey: string; target: number; duration: number; attacker: PlayerColor; defender: PlayerColor }
	| { type: 'clash_frozen'; gameId: string; reason: string; disconnectedPlayer: PlayerColor; reconnectDeadline: number }
	| { type: 'clash_result'; gameId: string; winner: PlayerColor; loser: PlayerColor; winnerPresses: number; loserPresses: number }
	| { type: 'color_selected'; gameId: string; userId: string; color: PlayerColor }
	| { type: 'lobby_update'; gameId: string; players: { userId: string; username: string; avatarStyle: string; color: PlayerColor; ready: boolean }[] };
