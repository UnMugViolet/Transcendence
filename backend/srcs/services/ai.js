let ballYTarget = null;
let lastTargetTime = 0;


function findNextCollision(angle, px, py) {
	wallx;
	wally;
	advanceIfWallx;
	advanceIfWally;
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);

	if (dx > 0)
		wallx = 1;
	else
		wallx = 0;
	if (dy > 0)
		wally = 1;
	else
		wally = 0;
	offAngle = angle + (Math.random() * AI_DIF) - (Math.random() * AI_DIF);
	if (dx > 0 && offAngle > (PI / 2) || offAngle < -(PI / 2))
		offAngle = angle;

	advanceIfWallx = (wallx - px) / dx;
	advanceIfWally = (wally - py) / dy;
	
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
		return findNextCollision(game.angle, game.ballx, game.bally);
	}
}


export function updateAI(game) {
	// define destination must be called only once per second
	const now = Date.now();

	if (ballYTarget === null || now - lastTargetTime >= 1000) {
		ballYTarget = defineDestination(game);
		lastTargetTime = now;
	}
	const paddle2Center = game.paddle2Y;
	upPlayer2 = false;
	downPlayer2 = false;
	
	if (ballYTarget < paddle2Center) {
		// Move paddle up
		upPlayer2 = true;
	} else if (ballYTarget > paddle2Center) {
		// Move paddle down
		downPlayer2 = true;
	}
	handleInput({
		type: "input",
		game: game.gameId,
		team: 2,
		up: upPlayer2,
		down: downPlayer2
	});
}