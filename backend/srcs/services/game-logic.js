/**
 * Game logic service for ball physics and paddle movement
 */

// Game constants
export const GAME_CONSTANTS = {
	PADDLE_HEIGHT: 0.16,
	PADDLE_WIDTH: 0.01,
	BALL_RADIUS: 0.01,
	POS_X_PLAYER1: 0.05,
	POS_X_PLAYER2: 1 - 0.05,
	PADDLE_SPEED: 0.008,
	INITIAL_BALL_SPEED: 0.005,
	MAX_BALL_SPEED: 0.025,
	BALL_SPEED_INCREMENT: 0.001,
	MAX_ANGLE: (5 * Math.PI) / 12,
	WIN_SCORE: 11,
	UPDATE_INTERVAL_MS: 16
};

export function createGame() {
	return {
		paddle1Y: 0.5,
		paddle2Y: 0.5,
		ballX: 0.5,
		ballY: 0.5,
		angle: 0,
		ballSpeed: 0,
		score1: 0,
		score2: 0,
		team1: 0,
		team2: 0,
		created: Date.now(),
		send: false,
		started: false,
		ballYTarget: 0,
		lastTargetTime: 0
	};
}

export function resetRound(game) {
	game.paddle1Y = 0.5;
	game.paddle2Y = 0.5;
	game.ballX = 0.5;
	game.ballY = 0.5;
	
	const side = Math.floor(Math.random() * 10) % 2 === 0 ? 1 : -1;
	game.angle = side === 1 ? 0 : 180 * (Math.PI / 180);
	if (Math.random() < 0.5) {
		game.angle += Math.PI;
	}
	game.ballSpeed = GAME_CONSTANTS.INITIAL_BALL_SPEED;
}

export function movePlayer(game, data) {
	const { PADDLE_HEIGHT, PADDLE_SPEED } = GAME_CONSTANTS;
	
	if (data.team === game.team1) {
		updatePaddle(game, 'paddle1Y', data.up, data.down, PADDLE_SPEED);
	} else if (data.team === game.team2) {
		updatePaddle(game, 'paddle2Y', data.up, data.down, PADDLE_SPEED);
	}
}

function updatePaddle(game, paddleKey, up, down, speed) {
	const { PADDLE_HEIGHT } = GAME_CONSTANTS;
	
	if (up) {
		game[paddleKey] -= speed;
		if (game[paddleKey] - PADDLE_HEIGHT / 2 < 0) {
			game[paddleKey] = PADDLE_HEIGHT / 2;
		}
	}
	if (down) {
		game[paddleKey] += speed;
		if (game[paddleKey] + PADDLE_HEIGHT / 2 > 1) {
			game[paddleKey] = 1 - PADDLE_HEIGHT / 2;
		}
	}
}

function checkPaddleCollision(game) {
	const { BALL_RADIUS, POS_X_PLAYER1, POS_X_PLAYER2, PADDLE_WIDTH, PADDLE_HEIGHT, MAX_ANGLE, MAX_BALL_SPEED, BALL_SPEED_INCREMENT } = GAME_CONSTANTS;
	
	const leftHitPoint = game.ballX - BALL_RADIUS;
	const rightHitPoint = game.ballX + BALL_RADIUS;
	
	// Player 1 collision
	if (leftHitPoint <= POS_X_PLAYER1 + PADDLE_WIDTH / 2 && 
		game.ballY >= game.paddle1Y - PADDLE_HEIGHT / 2 && 
		game.ballY <= game.paddle1Y + PADDLE_HEIGHT / 2) {
		
		const relativeY = (game.ballY - (game.paddle1Y - PADDLE_HEIGHT / 2)) / PADDLE_HEIGHT;
		game.angle = (relativeY - 0.5) * 2 * MAX_ANGLE;
		if (game.ballSpeed < MAX_BALL_SPEED) {
			game.ballSpeed += BALL_SPEED_INCREMENT;
		}
		return true;
	}
	
	// Player 2 collision
	if (rightHitPoint >= POS_X_PLAYER2 - PADDLE_WIDTH / 2 && 
		game.ballY >= game.paddle2Y - PADDLE_HEIGHT / 2 && 
		game.ballY <= game.paddle2Y + PADDLE_HEIGHT / 2) {
		
		const relativeY = (game.ballY - (game.paddle2Y - PADDLE_HEIGHT / 2)) / PADDLE_HEIGHT;
		game.angle = Math.PI - (relativeY - 0.5) * 2 * MAX_ANGLE;
		if (game.ballSpeed < MAX_BALL_SPEED) {
			game.ballSpeed += BALL_SPEED_INCREMENT;
		}
		return true;
	}
	
	return false;
}

export function updateBall(game) {
	const { BALL_RADIUS } = GAME_CONSTANTS;
	
	const rightHitPoint = game.ballX + BALL_RADIUS;
	const leftHitPoint = game.ballX - BALL_RADIUS;
	const topHitPoint = game.ballY - BALL_RADIUS;
	const bottomHitPoint = game.ballY + BALL_RADIUS;

	// Check paddle collisions
	checkPaddleCollision(game);

	// Wall collisions (top/bottom)
	if (bottomHitPoint > 1 || topHitPoint < 0) {
		game.angle = -game.angle;
	}

	// Scoring
	if (leftHitPoint < 0) {
		game.score2 += 1;
		resetRound(game);
		return;
	} else if (rightHitPoint > 1) {
		game.score1 += 1;
		resetRound(game);
		return;
	}

	// Move ball
	const dx = game.ballSpeed * Math.cos(game.angle);
	const dy = game.ballSpeed * Math.sin(game.angle);
	game.ballX += dx;
	game.ballY += dy;
}

export function isGameFinished(game) {
	return game.score1 === GAME_CONSTANTS.WIN_SCORE || game.score2 === GAME_CONSTANTS.WIN_SCORE;
}

export function getGameState(game) {
	return {
		paddle1Y: game.paddle1Y,
		paddle2Y: game.paddle2Y,
		ballX: game.ballX,
		ballY: game.ballY,
		score1: game.score1,
		score2: game.score2,
	};
}
