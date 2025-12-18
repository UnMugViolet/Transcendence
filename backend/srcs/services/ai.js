import { handleInput } from "../routes/chat.js";
import { GAME_CONSTANTS } from "./game-logic.js";

const AI_DIF = 5;


function findNextCollision(angle, px, py) {
	if (Math.cos(angle) <= 0)
		return (0.5);
	console.log(angle);
	if ((angle <= 0.00001 && angle >= -0.00001) || (angle >= Math.PI - 0.00001 && angle <= Math.PI + 0.00001))
		return (0.5);
	var offAngle = angle + (Math.random() * AI_DIF * 0.01745) - (Math.random() * AI_DIF * 0.01745);
	if (offAngle > (Math.PI / 2) || offAngle < -(Math.PI / 2))
		offAngle = angle;
	const dx = Math.cos(offAngle);
	const dy = Math.sin(offAngle);

	
    const wallx = dx > 0 ? 0.95 : 0.05;
    const wally = dy > 0 ? 1 : 0;
	

	if (dy <= 0.00001 && dy >= -0.00001)
		return (py);
	const advanceIfWallx = (wallx - px) / dx;
	const advanceIfWally = (wally - py) / dy;
	console.log("dx and dy: ", dx, dy);
	console.log("advances: ", advanceIfWallx, advanceIfWally);
	if (advanceIfWallx <= advanceIfWally) {
		return (py + (advanceIfWallx * dy));
	} else {
		offAngle = -offAngle;
		return (findNextCollision(offAngle, px + (advanceIfWally * dx), wally));
	}
}

function defineDestination(game) {
	// check if ball is going to AI side
	const dx = Math.cos(game.angle);
	if (dx < 0) {
		return (0.5);
	} else {
		// guess ball trajectory with precision decreasing with each bounce
		return findNextCollision(game.angle, game.ballX, game.ballY);
	}
}


export function updateAI(game, gameId) {
	// define destination must be called only once per second
	const now = Date.now();
	AI_DEAD_ZONE = GAME_CONSTANTS;

	if (game.ballYTarget === null || now - game.lastTargetTime >= 1000) {
		game.ballYTarget = defineDestination(game);
		game.lastTargetTime = now;
	}
	const paddle2Center = game.paddle2Y;
	var upPlayer2 = false;
	var downPlayer2 = false;
	
	if (game.ballYTarget < paddle2Center) {
		// Move paddle up
		upPlayer2 = true;
	} else if (game.ballYTarget > paddle2Center) {
		// Move paddle down
		downPlayer2 = true;
	}
	handleInput(JSON.stringify({
		type: "input",
		game: gameId,
		team: 2,
		up: upPlayer2,
		down: downPlayer2
	}));
}