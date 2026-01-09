import { clients } from '../routes/chat.js';
import { partyPlayerQueries, userQueries } from './database-queries.js';

/**
 * Message service for sending system and game messages
 */

export function sendSysMessage(partyId, message) {
	const msg = {
		type: 'party',
		from: -1,
		fromName: 'System',
		to: partyId,
		message,
		send_at: Date.now()
	};
	
	const players = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left']);
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) {
			playerSocket.send(JSON.stringify(msg));
		}
	});
}

export function sendGameStateToPlayers(partyId, gameState) {
	// Only send to players who are not 'disconnected' or 'left'
	const players = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left']);
	// console.log(`DEBUG: sendGameStateToPlayers for party ${partyId}, found ${players.length} active players`);
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) {
			playerSocket.send(JSON.stringify({
				type: 'game',
				data: gameState
			}));
		} else {
			// Only mark as disconnected if not already
			const currentStatus = player.status;
			if (currentStatus !== 'disconnected') {
				console.log(`DEBUG: No socket found for player ${player.user_id}, marking as disconnected.`);
				partyPlayerQueries.updateStatus(player.user_id, partyId, 'disconnected');
			} else {
				console.log(`DEBUG: Player ${player.user_id} already disconnected, skipping.`);
			}
			// Debug: print clients map keys for investigation
			console.log('DEBUG: Current clients map keys:', Array.from(clients.keys()));
		}
	});
}

export function sendStopMessage(partyId, winnerName, round, mode) {
	const players = partyPlayerQueries.findByPartyId(partyId);
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) {
			playerSocket.send(JSON.stringify({
				type: 'stop',
				winner: winnerName,
				round: round,
				mode: mode
			}));
		}
	});
}

export function sendPauseMessage(partyId, excludeUserId) {
	const partyPlayers = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left']);
	partyPlayers.forEach(player => {
		if (player.user_id !== excludeUserId) {
			const playerSocket = clients.get(player.user_id);
			if (playerSocket) {
				console.log(`Notifying user ${player.user_id} that user ${excludeUserId} disconnected`);
				playerSocket.send(JSON.stringify({ type: 'pause' }));
			}
		}
	});
}

export function sendStartMessage(partyId, playersList, playerTeam, userId, resume = false, team1, team2) {
	const playerSocket = clients.get(userId);
	console.log(`DEBUG: sendStartMessage for user ${userId}, socket exists: ${!!playerSocket}`);
	if (playerSocket) {
		const playerName = userQueries.getNameById(userId);
		console.log(`User ${playerName} is on team ${playerTeam} in game for party ${partyId}`);
		const startMsg = { 
			type: 'start', 
			game: partyId, 
			team: playerTeam,
			team1: team1,
			team2: team2,
			resume: resume, 
			players: playersList 
		};
		console.log(`DEBUG: Sending start message:`, startMsg);
		playerSocket.send(JSON.stringify(startMsg));
	} else {
		console.log(`ERROR: No socket found for user ${userId}`);
	}
}
