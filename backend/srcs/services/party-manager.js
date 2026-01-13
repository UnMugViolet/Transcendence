import { partyQueries, partyPlayerQueries, userQueries } from './database-queries.js';
import { sendSysMessage, sendPauseMessage, sendStartMessage } from './message-service.js';
import { clients } from '../routes/chat.js';
import { GAME_CONSTANTS } from './game-logic.js';
import { saveMatchToHistory } from './stats-service.js';

/**
 * Party management service for handling party lifecycle and player state
 */

export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function handlePause(partyId, userId, games) {
	const game = games.get(partyId);
	if (game) game.started = false;
	
	partyQueries.updateStatus(partyId, 'paused');
	
	console.log(`User ${userId} disconnected from party ${partyId}`);
	const userName = userQueries.getNameById(userId);
	sendSysMessage(partyId, `En attente du retour de ${userName}...`);
	sendPauseMessage(partyId, userId);
}

export async function setTeam(partyId, games, team1 = null, team2 = null) {
	if (!games.has(partyId)) {
		const { createGame } = await import('./game-logic.js');
		games.set(partyId, createGame());
	}
	
	const game = games.get(partyId);
	const party = partyQueries.findById(partyId);
	
	if (party.type === 'Tournament') {
		game.team1 = team1;
		game.team2 = team2;
	} else {
		game.team1 = 1;
		game.team2 = 2;
	}
	
	console.log(`Game for party ${partyId} set with teams ${game.team1} and ${game.team2}`);
}

export async function handleEndGame(partyId, game, mode, games, tournament) {
	const teamLoser = determineLosingTeam(partyId, game);
	
	if (mode === 'Tournament' && tournament[partyId]) {
		tournament[partyId][teamLoser] = 0;
	}
	
	updatePlayerStatuses(partyId, teamLoser);
	const winnerName = getWinnerName(partyId, game, teamLoser);

	try {
		saveMatchToHistory(partyId, {
			mode: mode,
			team1: game.team1,
			team2: game.team2,
			score1: game.score1,
			score2: game.score2,
			created: game.created
		});
	}
	catch (err) {
		console.error('Error saving match to history:', err);
	}
	
	let info = { round: 0, p1: 1, p2: 2, afk: -1, left: -1 };
	
	if (mode === 'Tournament') {
		const { setupNextMatch } = await import('./tournament-manager.js');
		info = setupNextMatch(partyId, tournament[partyId]);
		game.score1 = 0;
		game.score2 = 0;
	}
	
	console.log(`Round : ${info.round}`);
	
	// Send stop message to all players
	const { sendStopMessage } = await import('./message-service.js');
	sendStopMessage(partyId, winnerName, info.round, mode);
	
	if (!info.round) {
		await cleanupFinishedGame(partyId, games);
	} else {
		await handleNextRound(partyId, info, games);
	}
}

function determineLosingTeam(partyId, game) {
	if (game && (game.score1 === GAME_CONSTANTS.WIN_SCORE || game.score2 === GAME_CONSTANTS.WIN_SCORE)) {
		return game.score1 === GAME_CONSTANTS.WIN_SCORE ? game.team2 : game.team1;
	} else {
		// If game is undefined or not properly initialized, find any disconnected player
		if (!game || !game.team1 || !game.team2) {
			const disconnectedPlayer = partyPlayerQueries.findByPartyIdAndStatus(partyId, 'disconnected')[0];
			return disconnectedPlayer?.team || 1; // Default to team 1 if no specific team found
		}
		const disconnectedPlayer = partyPlayerQueries.findDisconnectedInTeams(partyId, game.team1, game.team2);
		return disconnectedPlayer?.team;
	}
}

function updatePlayerStatuses(partyId, teamLoser) {
	partyPlayerQueries.updateStatusByPartyAndCurrentStatus('waiting', partyId, 'active');
	partyPlayerQueries.updateStatusByPartyTeamAndCurrentStatus('eliminated', partyId, teamLoser, 'active');
}

function getWinnerName(partyId, game, teamLoser) {
	if (!game || !game.team1 || !game.team2) {
		// If game is undefined, find the winning team by elimination
		const allPlayers = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['left', 'disconnected']);
		const winnerId = allPlayers.find(p => p.team !== teamLoser)?.user_id;
		return winnerId ? userQueries.getNameById(winnerId) : 'Joueur 2';
	}
	const winnerTeam = teamLoser === game.team1 ? game.team2 : game.team1;
	const winnerId = partyPlayerQueries.getUserIdByPartyAndTeam(partyId, winnerTeam);
	return winnerId ? userQueries.getNameById(winnerId) : 'Joueur 2';
}

async function cleanupFinishedGame(partyId, games) {
	// TODO: put game in match history db
	if (games.has(partyId)) games.delete(partyId);
	partyPlayerQueries.delete(partyId);
	partyQueries.delete(partyId);
	console.log(`Game for party ${partyId} ended`);
}

async function handleNextRound(partyId, info, games) {
	setTeam(partyId, games, info.p1, info.p2);
	await sleep(3000);
	
	if (info.afk !== -1) {
		handlePause(partyId, info.afk, games);
	} else if (info.left !== -1) {
		const { handleEndGame } = await import('./party-manager.js');
		const party = partyQueries.findById(partyId);
		await handleEndGame(partyId, games.get(partyId), party.type, games, {});
	} else {
		await broadcastStartMessage(partyId, false, games, null, info.p1, info.p2);
	}
}

export async function broadcastStartMessage(partyId, resume = false, games, pauses, p1 = 1, p2 = 2) {
	const game = games.get(partyId);
	
	// Clear any lingering pause
	if (pauses && pauses.has(partyId)) {
		pauses.delete(partyId);
	}
	
	const partyPlayers = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['left', 'disconnected']);
	
	// Build players list with names and teams
	const playersList = partyPlayers.map(p => {
		const name = userQueries.getNameById(p.user_id);
		return { name: name || 'Unknown', team: p.team };
	});
	
	partyPlayers.forEach(player => {
		console.log(`Starting game for user ${player.user_id}`);
		sendStartMessage(partyId, playersList, player.team, player.user_id, resume, p1, p2);
	});
	
	if (!pauses || !pauses.has(partyId)) {
		game.started = true;
	}
}

export function validateGameStart(userId, mode, minPlayers) {
	const user = userQueries.findById(userId);
	if (!user) {
		return { error: 'User not found', status: 404 };
	}
	
	const partyPlayer = partyPlayerQueries.findByUserId(userId);
	if (!partyPlayer) {
		return { error: 'User is not in a game', status: 400 };
	}
	
	const party = partyQueries.findById(partyPlayer.party_id);
	if (!party) {
		return { error: 'Party not found', status: 404 };
	}
	
	// Count present players
	let playersCount = partyPlayerQueries.countByPartyIdNotStatuses(party.id, ['left', 'disconnected']);
	
	// Handle single-player modes
	const requiredPlayers = (mode === '1v1Offline' || mode === 'IA') ? 1 : minPlayers[mode];
	if ((mode === '1v1Offline' || mode === 'IA') && playersCount < 1) {
		const userRow = partyPlayerQueries.findByUserIdAndPartyId(userId, party.id);
		if (userRow) {
			partyPlayerQueries.updateTeamAndStatus(1, 'active', party.id, userId);
			playersCount = 1;
		}
	}
	
	if (playersCount < requiredPlayers) {
		return { error: 'Not enough players', status: 400 };
	}
	
	return { party, user, playersCount };
}

export function cleanupUserGames(userId) {
	// Cleanup stale active games if user has no active websocket
	const activeRow = partyPlayerQueries.findByUserIdAndStatus(userId, 'active');
	if (activeRow && !clients.get(userId)) {
		const userName = userQueries.getNameById(userId);
		console.log(`Cleaning stale active game for user ${userName} in party ${activeRow.party_id}`);
		partyPlayerQueries.updateStatus(userId, activeRow.party_id, 'left');
	}
	
	// Always clean up 'left' status records - they should be completely removed
	const leftParties = partyPlayerQueries.findByUserIdAndStatus(userId, 'left');
	if (leftParties) {
		const userName = userQueries.getNameById(userId);
		console.log(`Removing 'left' status for user ${userName} in party ${leftParties.party_id}`);
		partyPlayerQueries.deleteUser(leftParties.party_id, userId);
	}
	
	// Disconnect from other waiting/lobby/disconnected games
	const existingParties = partyPlayerQueries.findByUserIdMultipleStatuses(userId, ['lobby', 'waiting', 'disconnected']);
	existingParties.forEach(partyPlayer => {
		partyPlayerQueries.updateStatus(userId, partyPlayer.party_id, 'left');
		const userName = userQueries.getNameById(userId);
		console.log(`User ${userName} left previous party ${partyPlayer.party_id} to join new game`);
	});
}

export function findOrCreateParty(mode, userId, minPlayers) {
	const parties = partyQueries.findByTypeAndStatus(mode, 'waiting');
	const maxPlayers = mode === 'Tournament' ? 8 : minPlayers[mode];
	
	// Try to rejoin previous party (check all statuses except 'finished')
	const previousLeft = partyPlayerQueries.findByUserIdAndStatus(userId, 'left');
	if (previousLeft) {
		const prevParty = partyQueries.findById(previousLeft.party_id);
		if (prevParty && prevParty.status !== 'finished') {
			const presentCount = partyPlayerQueries.countByPartyIdNotStatuses(prevParty.id, ['left', 'disconnected']);
			if (presentCount < maxPlayers) {
				partyPlayerQueries.updateStatus(userId, prevParty.party_id, 'lobby');
				const userName = userQueries.getNameById(userId);
				console.log(`User ${userName} rejoined previous party ${prevParty.id}`);
				return { party: prevParty, rejoined: true };
			}
		}
	}
	
	// Check if user is already in an active/paused party (disconnected status)
	const alreadyInGame = partyPlayerQueries.findByUserIdAndStatus(userId, 'disconnected');
	if (alreadyInGame) {
		const party = partyQueries.findById(alreadyInGame.party_id);
		if (party && party.status !== 'finished') {
			const userName = userQueries.getNameById(userId);
			console.log(`User ${userName} is rejoining active party ${party.id}`);
			return { party, rejoined: true };
		}
	}
	
	// Find existing party with space
	let party = null;
	parties.forEach(p => {
		const count = partyPlayerQueries.countByPartyIdNotStatuses(p.id, ['left', 'disconnected']);
		console.log(`Party ${p.id} has ${count}/${maxPlayers} players`);
		if (count < maxPlayers && !party) {
			party = p;
		}
	});
	
	// Create new party if needed
	if (!party) {
		party = partyQueries.create(mode);
		console.log(`Created new party ${party.id}`);
	}
	
	return { party, rejoined: false };
}

export function assignTeamNumber(partyId, userId) {
	const presentPlayers = partyPlayerQueries.presentPlayersInParty(partyId, ['left', 'disconnected']);
	let userTeam = 1;
	
	presentPlayers.forEach(player => {
		console.log(`Existing team: ${player.team}, userTeam: ${userTeam}`);
		if (userTeam === player.team) {
			userTeam++;
		}
		console.log(`Existing team: ${player.team}, userTeam: ${userTeam}`);
	});
	
	const userName = userQueries.getNameById(userId);
	console.log(`Final userTeam for user ${userName} is ${userTeam}`);
	return userTeam;
}
