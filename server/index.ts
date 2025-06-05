import express, { Request, Response } from "express";
import http from "http";
import cors from "cors";
import { Server, Socket } from "socket.io";
import { GameState, PaddleMoveData } from "../shared/types";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- Game constants ---
const WIDTH = 800;
const HEIGHT = 600;
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 10;
const PADDLE_OFFSET = 10;
const FRAME_RATE = 60;

// --- Game state ---
let waitingPlayer: string | null = null;
const playersInRoom: Record<string, [string, string]> = {};
const playerToRoom: Record<string, string> = {};
const playerToNumber: Record<string, number> = {};
const games: Record<string, GameState & { intervalId?: NodeJS.Timeout }> = {};

io.on("connection", (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("joinGame", () => {
    if (waitingPlayer) {
      const player1 = waitingPlayer;
      const player2 = socket.id;
      const room = `room-${player1}-${player2}`;

      playersInRoom[room] = [player1, player2];
      playerToRoom[player1] = room;
      playerToRoom[player2] = room;
      playerToNumber[player1] = 1;
      playerToNumber[player2] = 2;
      waitingPlayer = null;

      io.sockets.sockets.get(player1)?.join(room);
      socket.join(room);

      initGameState(room);
      startGameLoop(room);

      io.to(player1).emit("startGame", { room, playerNumber: 1 });
      io.to(player2).emit("startGame", { room, playerNumber: 2 });

      console.log(`Room created: ${room}`);
    } else {
      waitingPlayer = socket.id;
      socket.emit("waiting", "Waiting for another player to join...");
    }
  });

  socket.on("paddleMove", ({ room, position }: PaddleMoveData) => {
    const game = games[room];
    if (!game) return;

    const playerNum = playerToNumber[socket.id];
    if (playerNum === 1) {
      game.paddle1Y = Math.max(0, Math.min(HEIGHT - PADDLE_HEIGHT, position));
    } else if (playerNum === 2) {
      game.paddle2Y = Math.max(0, Math.min(HEIGHT - PADDLE_HEIGHT, position));
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === waitingPlayer) {
      waitingPlayer = null;
      return;
    }

    const room = playerToRoom[socket.id];
    if (room) {
      clearInterval(games[room]?.intervalId);
      delete playersInRoom[room];
      delete games[room];

      playersInRoom[room]?.forEach((id) => {
        delete playerToRoom[id];
        delete playerToNumber[id];
      });

      io.to(room).emit("playerDisconnected", "The other player disconnected.");
      console.log(`Player ${socket.id} disconnected from ${room}`);
    }
  });
});

function initGameState(room: string): void {
  games[room] = {
    ballX: WIDTH / 2,
    ballY: HEIGHT / 2,
    velocityX: Math.random() > 0.5 ? 4 : -4,
    velocityY: Math.random() > 0.5 ? 3 : -3,
    paddle1Y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
    paddle2Y: HEIGHT / 2 - PADDLE_HEIGHT / 2,
    score1: 0,
    score2: 0,
  };
}

function startGameLoop(room: string): void {
  const game = games[room];
  if (!game) return;

  const interval = setInterval(() => {
    game.ballX += game.velocityX;
    game.ballY += game.velocityY;

    // Wall bounce
    if (game.ballY - BALL_RADIUS < 0 || game.ballY + BALL_RADIUS > HEIGHT) {
      game.velocityY *= -1;
    }

    // Left paddle collision
    if (
      game.velocityX < 0 &&
      game.ballX - BALL_RADIUS < PADDLE_OFFSET + PADDLE_WIDTH &&
      game.ballY + BALL_RADIUS > game.paddle1Y &&
      game.ballY - BALL_RADIUS < game.paddle1Y + PADDLE_HEIGHT
    ) {
      game.velocityX *= -1;
      game.ballX = PADDLE_OFFSET + PADDLE_WIDTH + BALL_RADIUS;
    }

    // Right paddle collision
    if (
      game.velocityX > 0 &&
      game.ballX + BALL_RADIUS > WIDTH - PADDLE_OFFSET - PADDLE_WIDTH &&
      game.ballY + BALL_RADIUS > game.paddle2Y &&
      game.ballY - BALL_RADIUS < game.paddle2Y + PADDLE_HEIGHT
    ) {
      game.velocityX *= -1;
      game.ballX = WIDTH - PADDLE_OFFSET - PADDLE_WIDTH - BALL_RADIUS;
    }

    // Left miss
    if (game.ballX < 0) {
      game.score2++;
      resetBall(game);
    }

    // Right miss
    if (game.ballX > WIDTH) {
      game.score1++;
      resetBall(game);
    }

    io.to(room).emit("gameStateUpdate", game);
  }, 1000 / FRAME_RATE);

  game.intervalId = interval;
}

function resetBall(game: GameState): void {
  game.ballX = WIDTH / 2;
  game.ballY = HEIGHT / 2;
  game.velocityX = game.velocityX > 0 ? -4 : 4;
  game.velocityY = Math.random() > 0.5 ? 3 : -3;
}

app.get("/", (_req: Request, res: Response) => {
  res.send("Multiplayer Pong server is running.");
});

server.listen(3001, () => {
  console.log("Server running at http://localhost:3001");
});
