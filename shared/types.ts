export interface GameState {
  ballX: number;
  ballY: number;
  velocityX: number;
  velocityY: number;
  paddle1Y: number;
  paddle2Y: number;
  score1: number;
  score2: number;
}

export interface PaddleMoveData {
  room: string;
  position: number;
}

export interface GameStartPayload {
  room: string;
  playerNumber: 1 | 2;
}
