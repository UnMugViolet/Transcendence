import { partyQueries, partyPlayerQueries, userQueries, localTournamentPlayerQueries } from '../services/database-queries.js';
import { handlePause, setTeam, handleEndGame,broadcastStartMessage, validateGameStart, cleanupUserGames, findOrCreateParty, assignTeamNumber } from '../services/party-manager.js';
import { resetRound, movePlayer, updateBall, updatePaddle, isGameFinished, getGameState, GAME_CONSTANTS } from '../services/game-logic.js';
import { initializeTournament, setupNextMatch, sendNextGameMessage, initializeOfflineTournament, getPlayerNameByTeam } from '../services/tournament-manager.js';
import { sendSysMessage, sendGameStateToPlayers, sendJoinNotificationToParty } from '../services/message-service.js';
import { clients } from './chat.js';
import { updateAI } from '../services/ai.js';
import metrics from '../metrics.js';
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
	metrics.recordGameLoopIteration();
	
	if (!parties || parties.length === 0) {
		// Refresh parties list if empty
		parties = partyQueries.findByStatus('active');
	}
	
	// Update active games metric
	metrics.setActiveGames(parties?.length || 0);
	
	parties?.forEach(party => {
		const players = partyPlayerQueries.findByPartyId(party.id);
		if (players.length === 0) {
			// Delete local tournament players first (for offline tournaments) due to FK constraint
			localTournamentPlayerQueries.delete(party.id);
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
			updateAI(game, party.id);
		}

		if (game.started) {
			updatePaddle(game, 'paddle1Y', game.team1up, game.team1down);
			updatePaddle(game, 'paddle2Y', game.team2up, game.team2down);
			updateBall(game);
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
				partyPlayerQueries.updateStatus(player.user_id, party.id, 'left');
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

// Player input handler wrapper
export function handleMovePlayer(data) {
	const game = games.get(data.game);
	if (!game) {
		return ;
	}
	movePlayer(game, data);
}

// Route handlers
const errorResponseSchema = {
	type: 'object',
	properties: { error: { type: 'string' } }
};

const gameModes = ['1v1Online', '1v1Offline', '2v2', 'IA', 'Tournament', 'OfflineTournament'];

async function gameRoutes(fastify) {
	const minPlayers = {
		'1v1Online': 2,
		'1v1Offline': 1,
		'2v2': 4,
		'IA': 1,
		'Tournament': 4,
		'OfflineTournament': 1
	};

	// DEBUG endpoint
	fastify.get('/games', {
		schema: {
			description: 'Get all active games (debug endpoint)',
			tags: ['Game'],
			response: {
				200: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'integer' },
							status: { type: 'string' },
							type: { type: 'string' }
						}
					}
				}
			}
		}
	}, async () => {
		return partyQueries.findByStatus('active');
	});

	fastify.get('/party', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get all the current and invited player of a game',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						players: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									user_id: { type: 'integer' },
									status: { type: 'string' },
									profile_picture: { type: 'string' },
									name: { type: 'string' }
								}
							}
						}
					}
				},
				400: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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
			return reply.status(404).send({ error: 'party not found'});
		}

		const party_members = db.prepare(`
			SELECT
				p.user_id,
				p.status,
				u.profile_picture,
				u.name
			FROM party_players p
			JOIN users u ON u.id = p.user_id
			WHERE p.party_id = ?`).all(partyPlayer.party_id);
		console.log("party_members: ", party_members);
		return { players: party_members };
	});

	fastify.post('/start', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Start a game that the current user has joined',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['mode'],
				properties: {
					mode: { type: 'string', enum: gameModes, description: 'Game mode' },
					Player2Name: { type: 'string' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						partyId: { type: 'integer' },
						players: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									user_id: { type: 'integer' },
									name: { type: 'string' },
									team: { type: 'integer' }
								}
							}
						},
						mode: { type: 'string' },
						team1: { type: 'integer' },
						team2: { type: 'integer' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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
			partyPlayerQueries.updateStatusByPartyAndCurrentStatus('waiting', party.id, 'lobby');
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
		console.log("playerName: ", request.body.Player2Name);
		partyQueries.updateStatus(party.id, 'active');
		let p1 = 1;
		let p2 = 2;
		if (!info) {
			await setTeam(party.id, games, null, null, request.body.Player2Name);
			await broadcastStartMessage(party.id, false, games, pauses);
		} else {
			p1 = info.p1;
			p2 = info.p2;
			await broadcastStartMessage(party.id, false, games, pauses, info.p1, info.p2);			
		}
		parties = partyQueries.findByStatus('active');

		const playersWithNames = partyPlayerQueries.getPlayersWithNames(party.id);
		return { message: 'Game started', partyId: party.id, players: playersWithNames, mode: mode, team1: p1, team2: p2 };
	});

	// Offline tournament start endpoint - allows tournament with aliases (no user registration required)
	fastify.post('/start-offline-tournament', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Start an offline tournament with local player aliases (no registration required for participants)',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['aliases'],
				properties: {
					aliases: { 
						type: 'array', 
						items: { type: 'string' },
						minItems: 4,
						maxItems: 8,
						description: 'Array of player aliases (4-8 players)' 
					}
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						partyId: { type: 'integer' },
						players: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									alias: { type: 'string' },
									team: { type: 'integer' }
								}
							}
						},
						mode: { type: 'string' },
						nextMatch: {
							type: 'object',
							properties: {
								p1: { type: 'integer' },
								p2: { type: 'integer' },
								p1Name: { type: 'string' },
								p2Name: { type: 'string' }
							}
						}
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.user.id;
		const aliases = request.body.aliases;

		// Validate aliases
		if (!aliases || aliases.length < 4 || aliases.length > 8) {
			return reply.status(400).send({ error: 'Offline tournament requires 4-8 player aliases' });
		}

		// Check for duplicate aliases
		const uniqueAliases = new Set(aliases.map(a => a.trim().toLowerCase()));
		if (uniqueAliases.size !== aliases.length) {
			return reply.status(400).send({ error: 'All player aliases must be unique' });
		}

		// Check for empty aliases
		if (aliases.some(a => !a.trim())) {
			return reply.status(400).send({ error: 'Player aliases cannot be empty' });
		}

		const user = userQueries.findById(userId);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}

		// Clean up any existing games for this user
		cleanupUserGames(userId);

		// Find or create party for offline tournament
		const { party } = findOrCreateParty('OfflineTournament', userId, minPlayers);
		
		// Add the host user to the party with active status
		partyPlayerQueries.upsert(party.id, userId, 1, 'active');
		console.log(`DEBUG: Host user ${userId} added to party ${party.id} with status 'active'`);

		// Initialize offline tournament with aliases
		tournament[party.id] = initializeOfflineTournament(party.id, aliases);
		
		// Setup first match
		const info = setupNextMatch(party.id, tournament[party.id]);
		await setTeam(party.id, games, info.p1, info.p2);

		// Clear any pause state
		if (pauses.has(party.id)) {
			pauses.delete(party.id);
		}

		// Update party status
		partyQueries.updateStatus(party.id, 'active');
		parties = partyQueries.findByStatus('active');

		// Verify host user is in party before broadcasting
		const hostPlayer = partyPlayerQueries.findByPartyIdAndUserId(party.id, userId);
		console.log(`DEBUG: Host player in party: ${JSON.stringify(hostPlayer)}`);

		// Broadcast start message to the host player
		console.log(`DEBUG: Broadcasting start message for party ${party.id} with teams ${info.p1} vs ${info.p2}`);
		await broadcastStartMessage(party.id, false, games, pauses, info.p1, info.p2);

		// Get players with their assigned teams
		const localPlayers = localTournamentPlayerQueries.findByPartyId(party.id);
		const playersWithTeams = localPlayers.map(p => ({
			alias: p.alias,
			team: p.team
		}));

		console.log(`Offline tournament started for party ${party.id} with players: ${aliases.join(', ')}`);

		return { 
			message: 'Offline tournament started', 
			partyId: party.id, 
			players: playersWithTeams, 
			mode: 'OfflineTournament',
			nextMatch: {
				p1: info.p1,
				p2: info.p2,
				p1Name: info.p1Name || getPlayerNameByTeam(party.id, info.p1, true),
				p2Name: info.p2Name || getPlayerNameByTeam(party.id, info.p2, true)
			}
		};
	});

	fastify.post('/join', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Join or create a game party',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['mode'],
				properties: {
					mode: { type: 'string', enum: gameModes, description: 'Game mode to join' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						partyId: { type: 'integer' },
						status: { type: 'string' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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
			sendJoinNotificationToParty(party.id);
			return { message: 'Rejoined previous party', partyId: party.id, status: 'waiting' };
		}

		const userTeam = assignTeamNumber(party.id, userId);
		console.log(`User ${user.name} joined party ${party.id} on team ${userTeam}`);

		// Upsert player record
		partyPlayerQueries.upsert(party.id, userId, userTeam, 'lobby');

		if (party.type != 'IA' && party.type != '1v1Offline' && party.type != 'OfflineTournament')
			sendJoinNotificationToParty(party.id);
		return { message: 'Joined party', partyId: party.id, status: 'waiting' };
	});

	fastify.post('/leave', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Leave the current game party',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						partyId: { type: 'integer' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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

		const game = games.get(party.id);
		let isPlaying = true;
		if (party.type === 'Tournament' && game) {
			if (partyPlayer.team === (game.team1 || game.team2))
				isPlaying = true;
			else
				isPlaying = false;
		}

		// Mark player as left
		partyPlayerQueries.updateStatus(userId, party.id, 'left');
		sendSysMessage(party.id, 'playerLeft', { playerName: user.name });

		// Handle game cleanup - both active and paused games
		if (pauses.has(party.id)) {
			pauses.delete(party.id);
		}

		// For single-player modes (1v1Offline, IA, OfflineTournament), end the game immediately
		if (party.type === '1v1Offline' || party.type === 'IA' || party.type === 'OfflineTournament') {
			// Clean up the game entirely
			if (games.has(party.id)) {
				games.delete(party.id);
			}
			// Delete local tournament players first (for offline tournaments) due to FK constraint
			if (party.type === 'OfflineTournament') {
				localTournamentPlayerQueries.delete(party.id);
			}
			// Delete party_players FIRST (due to foreign key constraint), then party
			partyPlayerQueries.delete(party.id);
			partyQueries.delete(party.id);
			// Refresh the parties lists
			parties = partyQueries.findByStatus('active');
			partiesPaused = partyQueries.findByStatus('paused');
		} else if ((party.status === 'active' || party.status === 'paused') && isPlaying) {
			// For multiplayer games, handle end game logic
			partyQueries.updateStatus(party.id, 'active');
			partiesPaused = partyQueries.findByStatus('paused');
			parties = partyQueries.findByStatus('active');
			
			// Ensure game exists before calling handleEndGame
			if (!games.has(party.id)) {
				const { createGame } = await import('../services/game-logic.js');
				const game = createGame();
				game.partyType = party.type;
				games.set(party.id, game);
			}
			
			handleEndGame(party.id, games.get(party.id), party.type, games, tournament);
		}

		sendJoinNotificationToParty(party.id);
		console.log(`User ${user.name} left party ${party.id}`);
		return { message: 'Left party', partyId: party.id };
	});

	fastify.post('/resume', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Resume a paused game after disconnection',
			tags: ['Game'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						partyId: { type: 'integer' },
						mode: { type: 'string' },
						team: { type: 'integer' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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
		partyPlayerQueries.updateStatus(userId, party.id, newStatus);
		sendSysMessage(party.id, 'playerReconnected', { playerName: user.name });

		const player = partyPlayerQueries.findByPartyIdAndUserId(party.id, userId);
		let p1 = 1;
		let p2 = 2;
		if (party.type === 'Tournament')
		{
			const tournamentData = tournament[party.id];
			p1 = tournamentData["p1"];
			p2 = tournamentData["p2"];
		}
		if (pauses.has(party.id)) {
			partyQueries.updateStatus(party.id, 'active');
			if (pauses.has(party.id)) {
				pauses.delete(party.id);
			}
			parties = partyQueries.findByStatus('active');
			await broadcastStartMessage(party.id, true, games, pauses, p1, p2);
		} else {
			clients.get(userId).send(JSON.stringify({ type: 'start', game: party.id, team: player.team, timer: false }));
		}

		
		console.log(`User ${user.name} resumed party ${party.id}`);
		return { message: 'Resumed party', partyId: party.id, mode: party.type, team: player.team };
	});
}

export default gameRoutes;
