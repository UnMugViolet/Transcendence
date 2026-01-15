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
import { assignTeamNumber } from '../services/party-manager.js'
import { handleMovePlayer, pauseGameFromWS, sendSysMessage } from './game.js';
import { sendNotification } from '../services/message-service.js';

const clients = new Map();

export function handleInput(msg, userId) {
	try {
		const data = JSON.parse(msg);
		
		// Handle game input
		if (data.type === 'input') {
			handleMovePlayer(data);
			return;
		}

		// Validate message format
		validateWebSocketMessage(data, userId);

		// Add metadata
		data.from = userId;
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
}
let metricsInstance;

const errorResponseSchema = {
	type: 'object',
	properties: { error: { type: 'string' } }
};

async function chat(fastify) {
	await fastify.register(websocketPlugin);
	
	// Store metrics instance for use in WebSocket handlers
	metricsInstance = fastify.metrics;

	//---------------------- INVITES -----------------------//

	fastify.get('/invites', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get pending game invites for current user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						invites: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'integer' },
									inviter_id: { type: 'integer' },
									invitee_id: { type: 'integer' },
									party_id: { type: 'integer' },
									status: { type: 'string' },
									created_at: { type: 'integer' }
								}
							}
						}
					}
				},
				401: errorResponseSchema
			}
		}
	}, async (request) => {
		const userId = request.user.id;
		const invites = inviteQueries.findPendingByInvitee(userId);
		return { invites };
	});

	fastify.post('/invite', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Send a game invite to another user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['inviteeId'],
				properties: {
					inviteeId: { type: 'integer', description: 'User ID to invite' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						success: { type: 'boolean' },
						inviteId: { type: 'integer' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				409: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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

		// add invited user to party with 'invited' status
		const userTeam = assignTeamNumber(party.id, inviteeId);
		partyPlayerQueries.upsert(party.id, inviteeId, userTeam, 'invited');

		// Create invite
		const result = createInvite(inviteeId, inviterId, party.id);
		sendNotification(inviteeId);
		return result;
	});

	fastify.post('/invite/respond', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Respond to a game invite (accept or reject)',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['inviteId', 'status'],
				properties: {
					inviteId: { type: 'integer', description: 'Invite ID' },
					status: { type: 'string', enum: ['accepted', 'rejected'], description: 'Response to the invite' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						success: { type: 'boolean' },
						partyId: { type: 'integer' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const inviteeId = request.user.id;
		const { inviteId, status } = request.body;

		console.log(`inviteeId: ${inviteeId}, inviteId: ${inviteId}`);
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
			return processInviteRejection(inviteeId, inviteId);
		}
	});

	//------------------ BLOCK / UNBLOCK ------------------//

	fastify.get('/block', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get list of users blocked by current user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						blocked: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'integer' },
									name: { type: 'string' },
									profile_picture: { type: 'string' }
								}
							}
						}
					}
				},
				401: errorResponseSchema
			}
		}
	}, async (request) => {
		const blockerId = request.user.id;
		const blockedUsers = blockQueries.findBlockedByUser(blockerId);
		return { blocked: blockedUsers };
	});

	fastify.post('/block', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Block a user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['id'],
				properties: {
					id: { type: 'integer', description: 'User ID to block' }
				}
			},
			response: {
				200: { type: 'object', properties: { success: { type: 'boolean' } } },
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				409: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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

	fastify.post('/unblock', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Unblock a user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['id'],
				properties: {
					id: { type: 'integer', description: 'User ID to unblock' }
				}
			},
			response: {
				200: { type: 'object', properties: { success: { type: 'boolean' } } },
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const blockerId = request.user.id;
		const blockedId = request.body.id;

		const result = unblockUser(blockerId, blockedId);
		return result;
	});

	//------------------- MESSAGES ---------------------//

	fastify.get('/messages/:id', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get conversation messages with another user',
			tags: ['Chat'],
			security: [{ bearerAuth: [] }],
			params: {
				type: 'object',
				properties: {
					id: { type: 'integer', description: 'User ID to get conversation with' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						messages: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: { type: 'integer' },
									sender_id: { type: 'integer' },
									receiver_id: { type: 'integer' },
									message: { type: 'string' },
									send_at: { type: 'integer' }
								}
							}
						}
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
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
			if (!token) {
				throw new Error('No token');
			}
			console.log("WS token:", token);

			const payload = fastify.jwt.verify(token);
			console.log("WS payload:", payload);
			if (payload.type !== 'access') throw new Error('Unauthorized');

			clients.set(payload.id, connection.socket || connection);
			if (metricsInstance) metricsInstance.recordWebSocketConnection();
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
					handleInput(msg, payload.id);
			});

			(connection.socket || connection).on('close', (code, reason) => {
				console.log(`WS close for ${payload.name} (id=${payload.id}) code=${code} reason=${reason}`);
				
				// Check if user has already left - don't override 'left' status with 'disconnected'
				const currentParty = partyPlayerQueries.findByUserIdNotStatus(payload.id, 'left');
				if (!currentParty) {
					console.log(`User ${payload.name} already left their party, skipping disconnect handling`);
					clients.delete(payload.id);
					if (metricsInstance) metricsInstance.recordWebSocketDisconnection();
					return;
				}
				
				const party = partyPlayerQueries.findByUserIdMultipleStatuses(payload.id, ['active', 'waiting'])[0];
				if (party) {
					partyPlayerQueries.updateStatus(payload.id, party.party_id, 'disconnected');
					console.log(`User ${payload.name} set to disconnected in party ${party.party_id}`);
					sendSysMessage(party.party_id, `${payload.name} a été déconnecté.`);
					
					if (party.status === 'active') {
						// Route via game wrapper to ensure internal games map is provided
						pauseGameFromWS(party.party_id, payload.id);
					}
				}
				
				console.log(`❌ Client ${payload.name} déconnecté (ID: ${payload.id})`);
				clients.delete(payload.id);
				if (metricsInstance) metricsInstance.recordWebSocketDisconnection();
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
