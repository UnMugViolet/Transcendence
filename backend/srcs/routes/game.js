import { partyQueries, partyPlayerQueries, userQueries } from '../services/database-queries.js';
import { handlePause, setTeam, handleEndGame,broadcastStartMessage, validateGameStart, cleanupUserGames, findOrCreateParty, assignTeamNumber } from '../services/party-manager.js';
import { resetRound, movePlayer, updateAI, updateBall, isGameFinished, getGameState, GAME_CONSTANTS } from '../services/game-logic.js';
import { initializeTournament, setupNextMatch, sendNextGameMessage } from '../services/tournament-manager.js';
import { sendSysMessage, sendGameStateToPlayers } from '../services/message-service.js';
import { clients } from './chat.js';
import db from '../db.js';

// Game state
const games = new Map();
const tournament = new Map();
const pauses = new Map();

// Initialize parties arrays to prevent undefined access in game loops
let parties = partyQueries.findByStatus('active');
let partiesPaused = partyQueries.findByStatus('paused');

// Export functions for chat.js
export { sendSysMessage };

// Wrapper for pause handling from WS (provides internal games map)
export function pauseGameFromWS(partyId, userId) {
	handlePause(partyId, userId, games);
}

// Game loop for updating ball physics and sending state to clients
export const gameLoop = setInterval(() => {
	if (!parties || parties.length === 0) {
		// Refresh parties list if empty
		parties = partyQueries.findByStatus('active');
	}
	
	parties?.forEach(party => {
		const players = partyPlayerQueries.findByPartyId(party.id);
		if (players.length === 0) {
			partyPlayerQueries.delete(party.id);
			partyQueries.delete(party.id);
			return;
		}

		const game = games.get(party.id);
		if (!game) return;

		if (game.ballSpeed === 0) {
			console.log(`Resetting round for game ${party.id}`);
			resetRound(game);
		}

		// AI logic for IA mode
		if (party.type === 'IA' && game.started) {
			updateAI(game);
		}

		if (game.started) {
			updateBall(game);
			// console.log(`DEBUG: Game ${party.id} - Ball at ${game.ballX.toFixed(3)}, ${game.ballY.toFixed(3)}`);
		}

		// Send game state to players
		if (game.started) {
			sendGameStateToPlayers(party.id, getGameState(game));
		}

		sendNextGameMessage(party, game, tournament[party.id]);

		// Check for game end
		if (isGameFinished(game) && game.started) {
			handleEndGame(party.id, game, party.type, games, tournament);
		}
	});
}, GAME_CONSTANTS.UPDATE_INTERVAL_MS);

// Pause loop for handling timeouts
export const pauseLoop = setInterval(() => {
	partiesPaused?.forEach(party => {
		const players = partyPlayerQueries.findByPartyIdAndStatus(party.id, 'active');
		if (players.length === 0) {
			partyPlayerQueries.delete(party.id);
			partyQueries.delete(party.id);
			return;
		}

		if (!pauses.has(party.id)) {
			console.log(`Creating new pause for party ${party.id}`);
			pauses.set(party.id, Date.now());
		}

		const pause = pauses.get(party.id);
		sendNextGameMessage(party, games.get(party.id), tournament[party.id]);
		console.log(`Party ${party.id} has been paused for ${Math.floor((Date.now() - pause) / 1000)} seconds`);

		if (Date.now() - pause >= 90000) {
			partyQueries.updateStatus(party.id, 'active');
			const player = partyPlayerQueries.findByPartyIdAndStatus(party.id, 'disconnected')?.[0];
			
			if (player) {
				console.log(`\x1b[33mResuming game for party ${party.id} after timeout, player ${player.user_id} eliminated\x1b[0m`);
				partyPlayerQueries.updateStatus('left', party.id, player.user_id);
			} else {
				console.log(`\x1b[33mResuming game for party ${party.id} after timeout (no disconnected players found)\x1b[0m`);
			}
			
			partiesPaused = partyQueries.findByStatus('paused');
			parties = partyQueries.findByStatus('active');
			pauses.delete(party.id);
			const mode = partyQueries.findById(party.id).type;
			handleEndGame(party.id, games.get(party.id), mode, games, tournament);
			console.log(`Paused game for party ${party.id} ended due to timeout`);
		}
	});
	partiesPaused = partyQueries.findByStatus('paused');
}, 1000);

// Player input handler
export function movePlayer(data) {
	const game = games.get(data.game);
	if (!game) return;
	movePlayer(game, data);
}

// Route handlers
async function gameRoutes(fastify) {
	const minPlayers = {
		'1v1Online': 2,
		'1v1Offline': 1,
		'2v2': 4,
		'IA': 1,
		'Tournament': 4
	};

	// DEBUG endpoint
	fastify.get('/games', async () => {
		return partyQueries.findByStatus('active');
	});

	fastify.post('/start', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const mode = request.body.mode;

		const validation = validateGameStart(userId, mode, minPlayers);
		if (validation.error) {
			return reply.status(validation.status).send({ error: validation.error });
		}

		const { party } = validation;
		let info;

		if (mode !== 'Tournament') {
			// Handle single player modes
			if (mode === '1v1Offline' || mode === 'IA') {
				partyPlayerQueries.updateTeam(1, party.id, userId);
			}
			partyPlayerQueries.updateStatusByPartyAndStatuses('active', party.id, 'lobby', 'waiting');
			console.log(`DEBUG: Updated player status to active for party ${party.id}`);
		} else {
			// Initialize tournament
			const players = partyPlayerQueries.findByPartyId(party.id);
			tournament[party.id] = initializeTournament(party.id, players);
			info = setupNextMatch(party.id, tournament[party.id]);
			if (info.afk !== -1) {
				handlePause(party.id, info.afk, games);
			}
			await setTeam(party.id, games, info.p1, info.p2);
		}

		// Clear pause state and start game
		if (pauses.has(party.id)) {
			pauses.delete(party.id);
		}
		partyQueries.updateStatus(party.id, 'active');
		if (!info) {
			await setTeam(party.id, games);
		}

		await broadcastStartMessage(party.id, false, games, pauses);
		parties = partyQueries.findByStatus('active');

		const playersWithNames = partyPlayerQueries.getPlayersWithNames(party.id);
		return { message: 'Game started', partyId: party.id, players: playersWithNames, mode: mode };
	});

	fastify.post('/join', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const mode = request.body.mode;

		console.log(`DEBUG: Join request - userId from JWT: ${userId}, mode: ${mode}`);

		const user = userQueries.findById(userId);
		if (!user) {
			console.error(`DEBUG: User not found for userId: ${userId}`);
			// Log all users for debugging
			const allUsers = db.prepare('SELECT id, name, role_id FROM users').all();
			console.error(`DEBUG: All users in database:`, allUsers);
			return reply.status(404).send({ error: 'User not found' });
		}

		console.log(`DEBUG: Found user: ${user.name} (ID: ${user.id})`);
		cleanupUserGames(userId);

		// Check if already in active game
		const isInGame = partyPlayerQueries.findByUserIdAndStatus(userId, 'active');
		if (isInGame && clients.get(userId)) {
			return reply.status(400).send({ error: 'User is already in a game' });
		}

		if (!minPlayers[mode]) {
			return reply.status(400).send({ error: 'Invalid game mode' });
		}

		const { party, rejoined } = findOrCreateParty(mode, userId, minPlayers);

		if (rejoined) {
			return { message: 'Rejoined previous party', partyId: party.id, status: 'waiting' };
		}

		const userTeam = assignTeamNumber(party.id, userId);
		console.log(`User ${user.name} joined party ${party.id} on team ${userTeam}`);

		// Upsert player record
		partyPlayerQueries.upsert(party.id, userId, userTeam, 'lobby');

		return { message: 'Joined party', partyId: party.id, status: 'waiting' };
	});

	fastify.post('/leave', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;

		const user = userQueries.findById(userId);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}

		const partyPlayer = partyPlayerQueries.findByUserIdNotStatus(userId, 'left');
		if (!partyPlayer) {
			return reply.status(400).send({ error: 'User is not in a game' });
		}

		const party = partyQueries.findById(partyPlayer.party_id);
		if (!party) {
			return reply.status(404).send({ error: 'Party not found' });
		}

		// Mark player as left
		partyPlayerQueries.updateStatus('left', party.id, userId);
		sendSysMessage(party.id, `${user.name} a quitté la partie.`);

		// Handle paused game cleanup
		if (pauses.has(party.id)) {
			partyQueries.updateStatus(party.id, 'active');
			partiesPaused = partyQueries.findByStatus('paused');
			parties = partyQueries.findByStatus('active');
			pauses.delete(party.id);
			
			// Ensure game exists before calling handleEndGame
			if (!games.has(party.id)) {
				const { createGame } = await import('../services/game-logic.js');
				games.set(party.id, createGame());
			}
			
			handleEndGame(party.id, games.get(party.id), party.type, games, tournament);
		}

		console.log(`User ${user.name} left party ${party.id}`);
		return { message: 'Left party', partyId: party.id };
	});

	fastify.post('/resume', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;

		const user = userQueries.findById(userId);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}

		const partyPlayer = partyPlayerQueries.findByUserIdAndStatus(userId, 'disconnected');
		if (!partyPlayer) {
			return reply.status(400).send({ error: 'User is not in a game' });
		}

		const party = partyQueries.findById(partyPlayer.party_id);
		if (!party) {
			return reply.status(404).send({ error: 'Party not found' });
		}

		// Update player status
		const newStatus = pauses.has(party.id) ? 'active' : 'waiting';
		partyPlayerQueries.updateStatus(newStatus, party.id, userId);
		sendSysMessage(party.id, `${user.name} reconnected !`);

		if (pauses.has(party.id)) {
			partyQueries.updateStatus(party.id, 'active');
			if (pauses.has(party.id)) {
				pauses.delete(party.id);
			}
			parties = partyQueries.findByStatus('active');
			await broadcastStartMessage(party.id, true, games, pauses);
		} else {
			clients.get(userId).send(JSON.stringify({ type: 'start', game: party.id, team: 0, timer: false }));
		}

		console.log(`User ${user.name} resumed party ${party.id}`);
		return { message: 'Resumed party', partyId: party.id };
	});
}

export default gameRoutes;
