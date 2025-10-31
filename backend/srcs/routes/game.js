import db from '../db.js';
import { clients } from './chat.js';

const games = new Map();
const tournament = new Map();
const pauses = new Map();

let parties;
let partiesPaused;

const paddleHeight = 0.16;
const paddleWidth = 0.01;

const ballRadius = 0.01;

const posXPlayer1 = 0.05;
const posXPlayer2 = 1 - 0.05;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function sendSysMessage(partyId, message) {
	const msg = {
		type: 'party',
		from: -1,
		fromName: 'System',
		to: partyId,
		send_at: Date.now()
	};
	msg.message = message;
	const players = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status != ? AND status != ?').all(partyId, 'disconnected', 'left');
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) playerSocket.send(JSON.stringify(msg));
	});
}

function sendNextGameMessage(party) {
	const mode = party.type;
	const game = games.get(party.id);
	if (mode === 'Tournament' && (game.score1 === 8 || game.score2 === 8 || Date.now() - game.created >= 60000) && !game.send)
	{
		game.send = true;
		const tournamentData = tournament[party.id];
		const players = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(party.id);
		const nb = players.length;
		let round = 0;
		let p1 = 0;
		let p2 = 0;
		// const activePlayersTeams = db.prepare('SELECT team FROM party_players WHERE party_id = ? AND status = ?').all(party.id, 'active'); // Pourquoi ?
		for (let i = 1; i <= nb; i++)
		{
			// if (tournamentData[i] > round && activePlayersTeams[0].team !== i && activePlayersTeams[1].team !== i)
			if (tournamentData[i] > round)
			{
				round = tournamentData[i];
				p1 = i;
			}
			// if (p1 && tournamentData[i] === round && i !== p1 && activePlayersTeams[1].team !== i && activePlayersTeams[0].team !== i && tournamentData[p1] !== tournamentData[p2])
			if (p1 && tournamentData[i] === round && i !== p1 && tournamentData[p1] !== tournamentData[p2])
				p2 = i;
		}
		console.log(`Round# : ${round}`); // DEBUG
		console.log(`Data : ${JSON.stringify(tournamentData)}`); // DEBUG
		if (round > 0)
		{
			let p1Id, p2Id, p1Name, p2Name;
			if (p1) p1Id = db.prepare('SELECT user_id FROM party_players WHERE party_id = ? AND team = ?').get(party.id, p1).user_id;
			if (p2) p2Id = db.prepare('SELECT user_id FROM party_players WHERE party_id = ? AND team = ?').get(party.id, p2).user_id;
			if (p1Id) p1Name = db.prepare('SELECT name FROM users WHERE id = ?').get(p1Id).name;
			if (p2Id) p2Name = db.prepare('SELECT name FROM users WHERE id = ?').get(p2Id).name;

			let msg = `Le prochain match sera entre ${p1Name} et ${p2Name} ! Tenez-vous prêts !`;
			if (round === 1)
				msg = `Le gagnant de ce match jouera contre ${p1Name} en finale ! Soyez prêts pour le grand match !`;

			sendSysMessage(party.id, msg);
		}
	}
}

export function handlePause(partyId, userId) {
	const game = games.get(partyId);
	if (game) game.started = false;
	db.prepare('UPDATE parties SET status = ? WHERE id = ?').run('paused', partyId);
	parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
	console.log(`User ${userId} disconnected from party ${partyId}`); // DEBUG
	const partyPlayers = db.prepare('SELECT user_id FROM party_players WHERE party_id = ? AND status != ? AND status != ?').all(partyId, 'disconnected', 'left');
	sendSysMessage(partyId, `En attente du retour de ${db.prepare('SELECT name FROM users WHERE id = ?').get(userId).name}...`);
	partyPlayers.forEach(player => {
		if (player.user_id !== userId) {
			const playerSocket = clients.get(player.user_id);
			if (playerSocket) {
				console.log(`Notifying user ${player.user_id} that user ${userId} disconnected`); // DEBUG
				playerSocket.send(JSON.stringify({ type: 'pause' }));
			}
		}
	});
}

function setTeam(partyId, team1 = null, team2 = null)
{
	if (!games.has(partyId)) games.set(partyId, createGame());
	const game = games.get(partyId);
	const mode = db.prepare('SELECT type FROM parties WHERE id = ?').get(partyId).type;
	if (mode === 'Tournament')
	{
		game.team1 = team1;
		game.team2 = team2;
	}
	else
	{
		game.team1 = 1;
		game.team2 = 2;
	}
	console.log(`Game for party ${partyId} set with teams ${game.team1} and ${game.team2}`); // DEBUG
}

async function handleEndGame(partyId, game, mode) {
	let teamLoser;
	if (game && (game.score1 === 11 || game.score2 === 11))
		teamLoser = game.score1 === 11 ? game.team2 : game.team1;
	else
		teamLoser = db.prepare('SELECT team FROM party_players WHERE party_id = ? AND (status = ? OR status = ?) AND (team = ? OR team = ?)').get(partyId, 'disconnected', 'left', game.team1, game.team2).team;
	const tournamentData = tournament[partyId];
	if (tournamentData) tournamentData[teamLoser] = 0;
	let info = { round: 0, p1: 1, p2: 2, afk: -1, left: -1 };
	db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND status = ?').run('waiting', partyId, 'active');
	db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND team = ? AND status = ?').run('eliminated', partyId, teamLoser, 'active');
	const players = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(partyId);
	const winnerTeam = teamLoser === game.team1 ? game.team2 : game.team1;
	const winnerId = db.prepare('SELECT user_id FROM party_players WHERE party_id = ? AND team = ?').get(partyId, winnerTeam);
	const id = winnerId ? winnerId.user_id : -1;
	let winnerName = 'Joueur 2';
	if (id !== -1) winnerName = db.prepare('SELECT name FROM users WHERE id = ?').get(id).name;
	if (mode === 'Tournament') info = setupNextMatch(partyId);
	console.log(`Round : ${info.round}`); // DEBUG
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) {
			playerSocket.send(JSON.stringify({
				type: 'stop',
				winner: winnerName,
				round: info.round,
				mode: mode
			}));
		}
	});
	if (!info.round) {
		// TODO : put game in match history db
		if (games.has(partyId)) games.delete(partyId);
		db.prepare('DELETE FROM party_players WHERE party_id = ?').run(partyId);
		db.prepare('DELETE FROM parties WHERE id = ?').run(partyId);
		parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
		console.log(`Game for party ${partyId} ended`); // DEBUG
	}
	else {
		setTeam(partyId, info.p1, info.p2);
		await sleep(3000);
		if (info.afk !== -1)
			handlePause(partyId, info.afk);
		else if (info.left !== -1)
			handleEndGame(partyId, games.get(partyId), mode);
		else
			sendStartMessage(partyId);
	}
}

function setupNextMatch(partyId) {
	const tournamentData = tournament[partyId];
	if (!tournamentData) return;

	const players = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(partyId);
	if (!players) return;

	let round = 0;
	let p1 = 0;
	let p2 = 0;
	for (let i = 1; i <= 8; i++)
	{
		if (tournamentData[i] > round)
		{
			round = tournamentData[i];
			p1 = i;
		}
		if (p1 && tournamentData[i] === round && i !== p1 && tournamentData[p1] !== tournamentData[p2])
			p2 = i;
	}
	if (round === 0) return { round: 0 };
	const p1Info = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND team = ?').get(partyId, p1);
	const p2Info = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND team = ?').get(partyId, p2);
	const p1Name = db.prepare('SELECT name FROM users WHERE id = ?').get(p1Info.user_id).name; // DEBUG
	const p2Name = db.prepare('SELECT name FROM users WHERE id = ?').get(p2Info.user_id).name; // DEBUG
	console.log(`Next match in tournament for party ${partyId} is between team ${p1} (${p1Name}) and team ${p2} (${p2Name})`); // DEBUG
	const left = p1Info.status === 'left' || p2Info.status === 'left';
	const afk = p1Info.status === 'disconnected' || p2Info.status === 'disconnected';
	let afkId = -1;
	let leftId = -1;

	sendSysMessage(partyId, `Match entre ${p1Name} et ${p2Name} ! Bonne chance !`);

	if (afk)
	{
		afkId = p1Info.status === 'disconnected' ? p1Info.user_id : p2Info.user_id;
		const activeId = p1Info.user_id === afkId ? p2Info.user_id : p1Info.user_id;
		db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('active', partyId, activeId);
	}
	if (left)
	{
		leftId = p1Info.status === 'left' ? p1Info.user_id : p2Info.user_id;
		const activeId = p1Info.user_id === leftId ? p2Info.user_id : p1Info.user_id;
		db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('active', partyId, activeId);
		sendSysMessage(partyId, `${db.prepare('SELECT name FROM users WHERE id = ?').get(leftId).name} a quitté la partie et est éliminé du tournoi. Victore pour ${db.prepare('SELECT name FROM users WHERE id = ?').get(activeId).name} !`);
	}
	else
	{
		db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('active', partyId, p1Info.user_id);
		db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('active', partyId, p2Info.user_id);
	}
	console.log(`Data : ${JSON.stringify(tournamentData)}`); // DEBUG
	const p = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(partyId); // DEBUG
	console.log('Players :', p); // DEBUG
	tournamentData[p1]--;
	tournamentData[p2]--;
	if (games.has(partyId)) games.delete(partyId);
	if (!games.has(partyId)) games.set(partyId, createGame());
	return { round: round, p1: p1, p2: p2, afk: afkId, left: leftId };
}

export async function sendStartMessage(partyId, resume = false) {
	const game = games.get(partyId);
	if (pauses.has(partyId)) return;
	const partyPlayers = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status != ? AND status != ?').all(partyId, 'disconnected', 'left');
	// Build players array with name and team so clients can display names
	const playersList = partyPlayers.map(p => {
		const nameRow = db.prepare('SELECT name FROM users WHERE id = ?').get(p.user_id);
		return { name: nameRow ? nameRow.name : 'Unknown', team: p.team };
	});
	partyPlayers.forEach(player => {
		console.log(`Starting game for user ${player.user_id}`); // DEBUG
		const playerSocket = clients.get(player.user_id);
		if (playerSocket)
		{
			console.log(`Notifying user ${player.user_id} to start the game`); // DEBUG
			const row = db.prepare('SELECT team FROM party_players WHERE party_id = ? AND user_id = ? AND status = ?').get(partyId, player.user_id, 'active');
			const playerTeam = row ? row.team : 0;
			const playerName = db.prepare('SELECT name FROM users WHERE id = ?').get(player.user_id).name; // DEBUG
			console.log(`User ${playerName} is on team ${playerTeam} in game for party ${partyId}`); // DEBUG
			playerSocket.send(JSON.stringify({ type: 'start', game: partyId, team: playerTeam, resume: resume, players: playersList }));
		}
	});
	await sleep(6000);
	if (!pauses.has(partyId)) game.started = true;
}

export function movePlayer(data) {
	const game = games.get(data.game);
	if (!game) return;

	const ms = 0.008;

	if (data.team === game.team1) {
		if (data.up) {
			game.paddle1Y -= ms;
			if (game.paddle1Y - paddleHeight / 2 < 0)
				game.paddle1Y = paddleHeight / 2;
		}
		if (data.down) {
			game.paddle1Y += ms;
			if (game.paddle1Y + paddleHeight / 2 > 1)
				game.paddle1Y = 1 - paddleHeight / 2;
		}
	}
	else if (data.team === game.team2) {
		if (data.up) {
			game.paddle2Y -= ms;
			if (game.paddle2Y - paddleHeight / 2 < 0)
				game.paddle2Y = paddleHeight / 2;
		}
		if (data.down) {
			game.paddle2Y += ms;
			if (game.paddle2Y + paddleHeight / 2 > 1)
				game.paddle2Y = 1 - paddleHeight / 2;
		}
	}
}

function createGame() {
	return {
		paddle1Y: 0,
		paddle2Y: 0,
		ballX: 0,
		ballY: 0,
		angle: 0,
		ballSpeed: 0,
		score1: 0,
		score2: 0,
        team1: 0,
        team2: 0,
		created: Date.now(),
		send: false,
		started: false
	};
}

function createTournament() {
	return {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0,
		6: 0,
		7: 0,
		8: 0
	};
}

function resetRound(game) {
	game.paddle1Y = 0.5;
	game.paddle2Y = 0.5;
	game.ballX = 0.5;
	game.ballY = 0.5;
	let side = Math.floor(Math.random() * 10) % 2 === 0 ? 1 : -1;
	game.angle = side === 1 ? 0 : 180 * (Math.PI / 180);
	if (Math.random() < 0.5) game.angle += Math.PI;
	game.ballSpeed = 0.005;
}

function hitPlayer1(game) {
	const leftHitPoint = game.ballX - ballRadius;
	if (leftHitPoint <= posXPlayer1 + paddleWidth / 2 && game.ballY >= game.paddle1Y - paddleHeight / 2 && game.ballY <= game.paddle1Y + paddleHeight / 2)
		return true;
	return false;
}

function hitPlayer2(game) {
	const rightHitPoint = game.ballX + ballRadius;
	if (rightHitPoint >= posXPlayer2 - paddleWidth / 2 && game.ballY >= game.paddle2Y - paddleHeight / 2 && game.ballY <= game.paddle2Y + paddleHeight / 2)
		return true;
	return false;
}

function updateBall(game) {
	const rightHitPoint = game.ballX + ballRadius;
	const leftHitPoint = game.ballX - ballRadius;
	const topHitPoint = game.ballY - ballRadius;
	const bottomHitPoint = game.ballY + ballRadius;

	const maxAngle = (5 * Math.PI) / 12;

	if (hitPlayer1(game)) {
		let relativeY = (game.ballY - (game.paddle1Y - paddleHeight / 2)) / paddleHeight;
		game.angle = (relativeY - 0.5) * 2 * maxAngle;
		if (game.ballSpeed < 0.025)
			game.ballSpeed += 0.001;
		// console.log('Hit player 1'); // DEBUG
	}
	else if (hitPlayer2(game)) {
		let relativeY = (game.ballY - (game.paddle2Y - paddleHeight / 2)) / paddleHeight;
		game.angle = Math.PI - (relativeY - 0.5) * 2 * maxAngle;
		if (game.ballSpeed < 0.025)
			game.ballSpeed += 0.001;
		// console.log('Hit player 2'); // DEBUG
	}

	if (bottomHitPoint > 1 || topHitPoint < 0)
		game.angle = -game.angle;

	if (leftHitPoint < 0) {
		game.score2 += 1;
		resetRound(game);
	}
	else if (rightHitPoint > 1) {
		game.score1 += 1;
		resetRound(game);
	}

	let dx = game.ballSpeed * Math.cos(game.angle);
	let dy = game.ballSpeed * Math.sin(game.angle);
	game.ballX += dx;
	game.ballY += dy;
}


export const pauseLoop = setInterval(() => {
	partiesPaused?.forEach(party => {
		const players = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status = ?').all(party.id, 'active');
		if (players.length === 0) {
			db.prepare('DELETE FROM party_players WHERE party_id = ?').run(party.id);
			db.prepare('DELETE FROM parties WHERE id = ?').run(party.id);
			return;
		}
		if (!pauses.has(party.id))
		{
			console.log(`Creating new pause for party ${party.id}`); // DEBUG
			pauses.set(party.id, Date.now());
		}
		const pause = pauses.get(party.id);
		sendNextGameMessage(party);
		console.log(`Party ${party.id} has been paused for ${Math.floor((Date.now() - pause) / 1000)} seconds`); // DEBUG
		if (Date.now() - pause >= 90000) {
			db.prepare('UPDATE parties SET status = ? WHERE id = ?').run('active', party.id);
			const player = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status = ?').get(party.id, 'disconnected');
			console.log(`\x1b[33mResuming game for party ${party.id} after timeout, player ${player.user_id} eliminated\x1b[0m`); // DEBUG
			db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('left', party.id, player.user_id);
			partiesPaused = db.prepare('SELECT * FROM parties WHERE status = ?').all('paused');
			parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
			pauses.delete(party.id);
			const mode = db.prepare('SELECT type FROM parties WHERE id = ?').get(party.id).type;
			handleEndGame(party.id, games.get(party.id), mode);
			console.log(`Paused game for party ${party.id} ended due to timeout`); // DEBUG
		}
	});
	partiesPaused = db.prepare('SELECT * FROM parties WHERE status = ?').all('paused');
}, 1000);


export const gameLoop = setInterval(() => {
	parties?.forEach(party => {
		const players = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(party.id);
		if (players.length === 0) {
			db.prepare('DELETE FROM party_players WHERE party_id = ?').run(party.id);
			db.prepare('DELETE FROM parties WHERE id = ?').run(party.id);
			return;
		}
		const game = games.get(party.id);
		if (!game) return;
		if (game.ballSpeed === 0)
		{
			console.log(`Resetting round for game ${party.id}`); // DEBUG
			resetRound(game);
		}

		if (game.started) updateBall(game);

		// console.log(`Ball speed: ${game.ballSpeed}`); // DEBUG

		if (game.started) players.forEach(player => {
			const playerSocket = clients.get(player.user_id);
			if (playerSocket) {
				playerSocket.send(JSON.stringify({
					type: 'game',
					data: {
						paddle1Y: game.paddle1Y,
						paddle2Y: game.paddle2Y,
						ballX: game.ballX,
						ballY: game.ballY,
						score1: game.score1,
						score2: game.score2,
					}
				}));
			}
		});
		sendNextGameMessage(party);

		const mode = party.type;
		if ((game.score1 === 11 || game.score2 === 11) && game.started)
			handleEndGame(party.id, game, mode);
	});
}, 16);

async function gameRoutes(fastify) {

	const minPlayers = {
		'1v1Online': 2,
		'1v1Offline': 1,
		'2v2': 4,
		'IA': 1,
		'Tournament': 4
	}

	// DEBUG
	fastify.get('/games', async () => {
		return db.prepare('SELECT * FROM parties').all();
	});

	fastify.post('/start', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const mode = request.body.mode;
		const lang = request.lang || 'fr';
		console.log('Lang used:', lang); // doit afficher 'fr'
		console.log('Translation:', fastify.i18n.t('notEnough', lang));

		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
		if (!user) return reply.status(404).send({ error: 'User not found' });

		const partyPlayer = db.prepare('SELECT * FROM party_players WHERE user_id = ?').get(userId);
		if (!partyPlayer) return reply.status(400).send({ error: 'User is not in a game' });

		const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyPlayer.party_id);
		if (!party) return reply.status(404).send({ error: 'Party not found' });

		// TODO : Check if user is an host

		// count only players still present (not left/disconnected)
		const playersCount = db.prepare('SELECT COUNT(*) as count FROM party_players WHERE party_id = ? AND status != ? AND status != ?').get(party.id, 'left', 'disconnected').count;
		if (playersCount < minPlayers[mode]) return reply.status(400).send({ error: fastify.i18n.t('notEnough', lang) });

		let info;
		if (mode !== 'Tournament') db.prepare('UPDATE party_players SET status = ? WHERE party_id = ?').run('active', party.id);
		else
		{
			tournament[party.id] = createTournament();
			const tournamentData = tournament[party.id];
			const players = db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(party.id);
			const nbPlayers = players.length;
			players.forEach(player => {
				let team = Math.floor(Math.random() * nbPlayers) + 1;
				while (tournamentData[team] !== 0)
					team = Math.floor(Math.random() * nbPlayers) + 1;
				if (team <= 8 - nbPlayers) tournamentData[team] = 2;
				else tournamentData[team] = 3;
				db.prepare('UPDATE party_players SET team = ? WHERE party_id = ? AND user_id = ?').run(team, party.id, player.user_id);
				const name = db.prepare('SELECT name FROM users WHERE id = ?').get(player.user_id).name;
				console.log(`User ${name} assigned to team ${team} in tournament for party ${party.id}`); // DEBUG
			});
			info = setupNextMatch(party.id);
			if (info.afk !== -1) handlePause(party.id, info.afk);
			setTeam(party.id, info.p1, info.p2);
		}
		db.prepare('UPDATE parties SET status = ? WHERE id = ?').run('active', party.id);
		db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND status = ?').run('waiting', party.id, 'lobby');
		if (!info) setTeam(party.id);
		sendStartMessage(party.id);
		parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
		
		const players = db.prepare(`
			SELECT u.name, pp.team 
			FROM party_players pp
			JOIN users u ON pp.user_id = u.id
			WHERE pp.party_id = ?
    	`).all(party.id);

		return { message: 'Game started', partyId: party.id, players: players };
	});

	fastify.post('/join', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const mode = request.body.mode

		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
		if (!user) return reply.status(404).send({ error: 'User not found' });

		const isInGame = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status = ?').get(userId, 'active');
		if (isInGame) return reply.status(400).send({ error: 'User is already in a game' });

		const parties = db.prepare('SELECT * FROM parties WHERE type = ? AND status = ? ORDER BY created_at ASC').all(mode, 'waiting');

		const nb = minPlayers[mode];
		if (!nb) return reply.status(400).send({ error: 'Invalid game mode' });

		let maxPlayers = nb;
		if (mode === 'Tournament') maxPlayers = 8;

		// If the user previously left a party that is still waiting, try to rejoin it
		const previousLeft = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status = ?').get(userId, 'left');
		if (previousLeft) {
			const prevParty = db.prepare('SELECT * FROM parties WHERE id = ? AND status = ?').get(previousLeft.party_id, 'waiting');
			if (prevParty) {
				const presentCount = db.prepare('SELECT COUNT(*) as count FROM party_players WHERE party_id = ? AND status != ? AND status != ?').get(prevParty.id, 'left', 'disconnected').count;
				if (presentCount < maxPlayers) {
					// Restore the user's row into the waiting lobby
					db.prepare('UPDATE party_players SET status = ? WHERE user_id = ? AND party_id = ?').run('lobby', userId, prevParty.id);
					console.log(`User ${user.name} rejoined previous party ${prevParty.id}`); // DEBUG
					return { message: 'Rejoined previous party', partyId: prevParty.id, status: 'waiting' };
				}
			}
		}
		
		let party = null;

		parties.forEach(p => {
			// count only players still present (exclude 'left' and 'disconnected')
			const count = db.prepare('SELECT COUNT(*) as count FROM party_players WHERE party_id = ? AND status != ? AND status != ?').get(p.id, 'left', 'disconnected').count;
			console.log(`Party ${p.id} has ${count}/${maxPlayers} players`); // DEBUG
			if (count < maxPlayers && !party) party = p;
		});

		let userTeam = 1;
		if (!party)
		{
			const result = db.prepare('INSERT INTO parties (type, created_at) VALUES (?, ?)').run(mode, Date.now());
			party = db.prepare('SELECT * FROM parties WHERE id = ?').get(result.lastInsertRowid);
			console.log(`Created new party ${party.id}`); // DEBUG
		}
		else
		{
			// consider only players that are actually present when computing team numbers
			const team = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status != ? AND status != ? ORDER BY team ASC').all(party.id, 'left', 'disconnected');
			team.forEach(t => {
				console.log(`Existing team: ${t.team}, userTeam: ${userTeam}`); // DEBUG
				if (userTeam === t.team)
					userTeam++;
				console.log(`Existing team: ${t.team}, userTeam: ${userTeam}`); // DEBUG
			});
			console.log(`Final userTeam for user ${user.name} is ${userTeam}`); // DEBUG
			// if (userTeam > nb) return reply.status(400).send({ error: 'Party is full' });
		}

		console.log(`User ${user.name} joined party ${party.id} on team ${userTeam}`);

		// Upsert: if the user already has a row for this party, update it; otherwise insert a new row
		const existingPlayer = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND party_id = ?').get(userId, party.id);
		if (existingPlayer) {
			// Update team/status for existing record instead of inserting duplicate
			db.prepare('UPDATE party_players SET team = ?, status = ? WHERE user_id = ? AND party_id = ?')
				.run(userTeam, 'lobby', userId, party.id);
			console.log(`Updated existing party_players for user ${user.name} in party ${party.id}`);
		} else {
			db.prepare('INSERT INTO party_players (party_id, user_id, team, status) VALUES (?, ?, ?, ?)').run(party.id, userId, userTeam, 'lobby');
		}

		return { message: 'Joined party', partyId: party.id, status: 'waiting' };
	});

	fastify.post('/leave', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;

		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
		if (!user) return reply.status(404).send({ error: 'User not found' });

		// Find the player's party record unless they already left
		const partyPlayer = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status != ?').get(userId, 'left');
		if (!partyPlayer) return reply.status(400).send({ error: 'User is not in a game' });

		const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyPlayer.party_id);
		if (!party) return reply.status(404).send({ error: 'Party not found' });

		// Mark the player as left so they are not counted for starts
		db.prepare('UPDATE party_players SET status = ? WHERE user_id = ? AND party_id = ?').run('left', userId, party.id);

		// Notify remaining players
		sendSysMessage(party.id, `${user.name} a quitté la partie.`);

		// If the game was paused because of disconnection, resume/cleanup as needed
		if (pauses.has(party.id)) {
			db.prepare('UPDATE parties SET status = ? WHERE id = ?').run('active', party.id);
			partiesPaused = db.prepare('SELECT * FROM parties WHERE status = ?').all('paused');
			parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
			pauses.delete(party.id);
			handleEndGame(party.id, games.get(party.id), party.type);
		}

		console.log(`User ${user.name} left party ${party.id}`);
		return { message: 'Left party', partyId: party.id };
	});

	fastify.post('/resume', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;

		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
		if (!user) return reply.status(404).send({ error: 'User not found' });

		const partyPlayer = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status = ?').get(userId, 'disconnected');
		if (!partyPlayer) return reply.status(400).send({ error: 'User is not in a game' });

		const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(partyPlayer.party_id);
		if (!party) return reply.status(404).send({ error: 'Party not found' });

		if (pauses.has(party.id)) db.prepare('UPDATE party_players SET status = ? WHERE user_id = ? AND party_id = ?').run('active', userId, party.id);
		else db.prepare('UPDATE party_players SET status = ? WHERE user_id = ? AND party_id = ?').run('waiting', userId, party.id);

		// if (partyPlayer.length > 1) return { message: 'Waiting for other player to resume', partyId: party.id }; // TODO : Plus tard frr
		sendSysMessage(party.id, `${user.name} s’est reconnecté !`);

		if (pauses.has(party.id)) {
			db.prepare('UPDATE parties SET status = ? WHERE id = ?').run('active', party.id);
			await sleep(1000);
			if (pauses.has(party.id)) pauses.delete(party.id);

			parties = db.prepare('SELECT * FROM parties WHERE status = ?').all('active');
			sendStartMessage(party.id, true);
		}
		else
			clients.get(userId).send(JSON.stringify({ type: 'start', game: party.id, team: 0, timer: false }));
		console.log(`User ${user.name} resumed party ${party.id}`);
		return { message: 'Resumed party', partyId: party.id };
	});

}

export default gameRoutes;