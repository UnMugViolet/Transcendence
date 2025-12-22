import { handleInput } from "../routes/chat.js";

const DIFFICULTY = 10;
const DEAD_ZONE = 0.02; // Dead zone for AI paddle movement
const RADIANT_OFFSET = DIFFICULTY * (Math.PI / 180); // Max angle offset in radians

function findNextCollision(angle, px, py) {
	if (Math.cos(angle) <= 0)
		return (0.5);

	// Use a random angle near base angle to have decreased precision with each call
	var offAngle = angle + (Math.random() * RADIANT_OFFSET) - (Math.random() * RADIANT_OFFSET);

	// Use base angle if random flips offAngle in the other direction
	if (Math.cos(offAngle) <= 0)
		offAngle = angle;
	const dx = Math.cos(offAngle);
	const dy = Math.sin(offAngle);

	
	const wallx = dx > 0 ? 0.95 : 0.05;
	const wally = dy > 0 ? 1 : 0;


	if (dy <= Number.EPSILON && dy >= -Number.EPSILON)
		return (py);

	// check which wall will be met first
	const advanceIfWallx = (wallx - px) / dx;
	const advanceIfWally = (wally - py) / dy;

	// if up or down wall is met first calculate again with bounce, else return impact point
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

	if (game.ballYTarget === null || now - game.lastTargetTime >= 1000) {
		game.ballYTarget = defineDestination(game);
		game.lastTargetTime = now;
	}
	const paddle2Center = game.paddle2Y;
	var upPlayer2 = false;
	var downPlayer2 = false;
	
	if (game.ballYTarget < paddle2Center - DEAD_ZONE) {
		// Move paddle up
		upPlayer2 = true;
	} else if (game.ballYTarget > paddle2Center + DEAD_ZONE) {
		// Move paddle down
		downPlayer2 = true;
	}

	// simulate player input
	handleInput(JSON.stringify({
		type: "input",
		game: gameId,
		team: 2,
		up: upPlayer2,
		down: downPlayer2
	}));
}
