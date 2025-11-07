import websocketPlugin from '@fastify/websocket';
import { 
	inviteQueries, 
	blockQueries, 
	messageQueries, 
	partyPlayerQueries,
	partyQueries
} from '../services/database-queries.js';
import {
	validateInviteRequest,
	validateInviterParty,
	checkInviteConflicts,
	createInvite,
	validateInviteResponse,
	validateInviteUsers,
	processInviteAcceptance,
	processInviteRejection,
	validateBlockRequest,
	blockUser,
	unblockUser,
	validateMessageRequest,
	getConversation,
	validateWebSocketMessage,
	savePrivateMessage,
	getPartyPlayers,
	addSenderName
} from '../services/chat-service.js';
import { movePlayer, pauseGameFromWS, sendSysMessage } from './game.js';

const clients = new Map();

async function chat(fastify) {
	await fastify.register(websocketPlugin);

	//---------------------- INVITES -----------------------//

	fastify.get('/invites', { preHandler: fastify.authenticate }, async (request) => {
		const userId = request.user.id;
		const invites = inviteQueries.findPendingByInvitee(userId);
		return { invites };
	});

	fastify.post('/invite', { preHandler: fastify.authenticate }, async (request, reply) => {
		const inviterId = request.user.id;
		const inviteeId = request.body.inviteeId;

		// Validate users
		const userValidation = validateInviteRequest(inviterId, inviteeId);
		if (userValidation.error) {
			return reply.status(userValidation.status).send({ error: userValidation.error });
		}

		// Validate inviter's party
		const partyValidation = validateInviterParty(inviterId);
		if (partyValidation.error) {
			return reply.status(partyValidation.status).send({ error: partyValidation.error });
		}
		
		const { party } = partyValidation;

		// Check for conflicts
		const conflicts = checkInviteConflicts(inviteeId, inviterId, party.id);
		if (conflicts) {
			return reply.status(conflicts.status).send({ error: conflicts.error });
		}

		// Create invite
		const result = createInvite(inviteeId, inviterId, party.id);
		return result;
	});

	fastify.post('/invite/respond', { preHandler: fastify.authenticate }, async (request, reply) => {
		const inviteeId = request.user.id;
		const { inviteId, status } = request.body;

		// Validate request
		const responseValidation = validateInviteResponse(inviteId, inviteeId, status);
		if (responseValidation.error) {
			return reply.status(responseValidation.status).send({ error: responseValidation.error });
		}

		const { invite } = responseValidation;

		// Validate users
		const userValidation = validateInviteUsers(inviteeId, invite.inviter_id);
		if (userValidation.error) {
			return reply.status(userValidation.status).send({ error: userValidation.error });
		}

		// Process response
		if (status === 'accepted') {
			const result = processInviteAcceptance(inviteeId, invite);
			if (result.error) {
				return reply.status(result.status).send({ error: result.error });
			}
			return result;
		} else {
			return processInviteRejection(inviteId);
		}
	});

	//------------------ BLOCK / UNBLOCK ------------------//

	fastify.get('/block', { preHandler: fastify.authenticate }, async (request) => {
		const blockerId = request.user.id;
		const blockedUsers = blockQueries.findBlockedByUser(blockerId);
		return { blocked: blockedUsers };
	});

	fastify.post('/block', { preHandler: fastify.authenticate }, async (request, reply) => {
		const blockerId = request.user.id;
		const blockedId = request.body.id;

		const validation = validateBlockRequest(blockerId, blockedId);
		if (validation.error) {
			return reply.status(validation.status).send({ error: validation.error });
		}

		const result = blockUser(blockerId, blockedId);
		if (result.error) {
			return reply.status(result.status).send({ error: result.error });
		}

		return result;
	});

	fastify.post('/unblock', { preHandler: fastify.authenticate }, async (request, reply) => {
		const blockerId = request.user.id;
		const blockedId = request.body.id;

		const result = unblockUser(blockerId, blockedId);
		return result;
	});

	//------------------- MESSAGES ---------------------//

	fastify.get('/messages/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const otherUserId = parseInt(request.params.id, 10);

		const validation = validateMessageRequest(userId, otherUserId);
		if (validation) {
			return reply.status(validation.status).send({ error: validation.error });
		}

		const messages = getConversation(userId, otherUserId);
		return { messages };
	});

	//------------------- WEBSOCKET --------------------//

	fastify.get('/ws', { websocket: true }, async (connection, req) => {
		try {
			const token = req.query.token;
			if (!token) throw new Error('No token');
			console.log("WS token:", token);

			const payload = fastify.jwt.verify(token);
			console.log("WS payload:", payload);
			if (payload.type !== 'access') throw new Error('Unauthorized');

			clients.set(payload.id, connection.socket || connection);
			console.log(`🔌 Client connecté : ${payload.name} (ID: ${payload.id})`);
			console.log(`DEBUG: Total clients connected: ${clients.size}`);
			console.log(`DEBUG: Client IDs: [${Array.from(clients.keys()).join(', ')}]`);
			console.log(`DEBUG: Connection object keys:`, Object.keys(connection));

			// Check for reconnection scenario
			const disconnected = partyPlayerQueries.findByUserIdAndStatus(payload.id, 'disconnected');
			let party;
			if (disconnected) {
				party = partyQueries.findById(disconnected.party_id);
				if (party && party.type !== '1v1Offline') {
					(connection.socket || connection).send(JSON.stringify({ type: 'reconnect' }));
				}
			}

			(connection.socket || connection).on('message', (msg) => {
				try {
					const data = JSON.parse(msg);
					
					// Handle game input
					if (data.type === 'input') {
						movePlayer(data);
						return;
					}

					// Validate message format
					validateWebSocketMessage(data, payload.id);

					// Add metadata
					data.from = payload.id;
					data.send_at = Date.now();

					console.log(`Message from ${data.from} to ${data.to}: ${data.message}`);

					if (data.type === 'private') {
						// Send to recipient
						const receiverSocket = clients.get(data.to);
						if (receiverSocket) {
							receiverSocket.send(JSON.stringify(data));
						}
						
						// Save to database
						savePrivateMessage(data.from, data.to, data.message, data.send_at);
						
					} else if (data.type === 'party') {
						// Add sender name and broadcast to party
						addSenderName(data, data.from);
						const partyPlayers = getPartyPlayers(data.to);
						
						partyPlayers.forEach(player => {
							if (player.user_id !== data.from) {
								const playerSocket = clients.get(player.user_id);
								if (playerSocket) {
									playerSocket.send(JSON.stringify(data));
								}
							}
						});
					}
				} catch (err) {
					console.log('Error processing message:', err.message);
				}
			});

			(connection.socket || connection).on('close', (code, reason) => {
				console.log(`WS close for ${payload.name} (id=${payload.id}) code=${code} reason=${reason}`);
				
				const party = partyPlayerQueries.findByUserIdMultipleStatuses(payload.id, ['active', 'waiting'])[0];
				if (party) {
					partyPlayerQueries.updateStatus('disconnected', party.party_id, payload.id);
					console.log(`User ${payload.name} set to disconnected in party ${party.party_id}`);
					sendSysMessage(party.party_id, `${payload.name} a été déconnecté.`);
					
					if (party.status === 'active') {
						// Route via game wrapper to ensure internal games map is provided
						pauseGameFromWS(party.party_id, payload.id);
					}
				}
				
				console.log(`❌ Client ${payload.name} déconnecté (ID: ${payload.id})`);
				clients.delete(payload.id);
				console.log(`DEBUG: Clients after disconnect: ${clients.size} remaining`);
			});

		} catch (err) {
			console.log('❌ WebSocket rejected:', err.message);
			try { 
				(connection.socket || connection).close(1008, 'Unauthorized or invalid token'); 
			} catch (_) {}
		}
	});
}

export default chat;
export { clients };
