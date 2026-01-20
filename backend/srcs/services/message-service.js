import { clients } from '../routes/chat.js';
import { partyPlayerQueries, userQueries } from './database-queries.js';
import { i18n } from './i18n-service.js';

/**
 * Message service for sending system and game messages
 */

/**
 * Send a system message with translation support
 * @param {number} partyId - Party ID
 * @param {string} keyOrMessage - Translation key or plain message
 * @param {object} params - Parameters for translation interpolation
 * @param {boolean} translate - Whether to translate (default: true)
 */
export function sendSysMessage(partyId, keyOrMessage, params = {}, translate = true) {
	const players = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left']);
	
	players.forEach(player => {
		const playerSocket = clients.get(player.user_id);
		if (playerSocket) {
			// Get translated message for this specific user
			const message = translate 
				? i18n.tUser(keyOrMessage, player.user_id, params)
				: keyOrMessage;
			
			const msg = {
				type: 'party',
				from: -1,
				fromName: 'System',
				to: partyId,
				message,
				send_at: Date.now()
			};
			
			playerSocket.send(JSON.stringify(msg));
		}
	});
}

export function sendGameStateToPlayers(partyId, gameState) {
	// Only send to players who are not 'disconnected' or 'left'
	const players = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left', 'invited']);
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
				partyPlayerQueries.updateStatus(player.user_id, partyId, 'disconnected');
			}
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
	const partyPlayers = partyPlayerQueries.findByPartyIdNotStatuses(partyId, ['disconnected', 'left', 'invited']);
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
		playerSocket.send(JSON.stringify(startMsg));
	} else {
	}
}

export function sendNotification(userId) {
	const playerSocket = clients.get(userId);
	console.log(`DEBUG: sendNotification for user ${userId}, socket exists: ${!!playerSocket}`);
	if (playerSocket) {
		const notification = {
			type: 'notification',
		}
		playerSocket.send(JSON.stringify(notification));
	}
}

function sendJoinNotification(userId) {
	const playerSocket = clients.get(userId);
	console.log(`DEBUG: sendJoinNotification for user ${userId}, socket exists: ${!!playerSocket}`);
	if (playerSocket) {
		const join = {
			type: 'join',
		}
		playerSocket.send(JSON.stringify(join));
	}
}

export function sendJoinNotificationToParty(partyId) {
	const party_players = partyPlayerQueries.findByPartyId(partyId);
	if (!party_players)
		return;
	party_players.forEach((player) => {
		if (player.status === 'lobby')
			sendJoinNotification(player.user_id);
	});
}
