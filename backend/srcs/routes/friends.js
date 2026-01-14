import db from '../db.js';
import { isBlocked } from '../utils.js';

const errorResponseSchema = {
	type: 'object',
	properties: { error: { type: 'string' } }
};

async function friendsRoutes (fastify, options) {

	// DEBUG
	fastify.get('/friends/all', {
		schema: {
			description: 'Get all friend relationships (debug endpoint)',
			tags: ['Friends'],
			response: {
				200: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id1: { type: 'integer' },
							id2: { type: 'integer' },
							requester: { type: 'integer' },
							status: { type: 'string', enum: ['pending', 'accepted'] },
							time: { type: 'integer' }
						}
					}
				}
			}
		}
	}, async () => {
		return db.prepare('SELECT * FROM friends').all();
	});

	fastify.get('/friends', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get current user friends list',
			tags: ['Friends'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						friends: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									friend_id: { type: 'integer' },
									friend_name: { type: 'string' },
									friend_pfp: { type: 'string' },
									friendship_time: { type: 'integer' },
									online: { type: 'string', enum: ['true', 'false'] }
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
		const timeout = 15 * 60 * 1000; // 15 minutes
		const friends = db.prepare(`
			SELECT 
				u.id AS friend_id,
				u.name AS friend_name,
				u.profile_picture AS friend_pfp,
				f.time AS friendship_time,
				CASE WHEN ? - u.last_seen < ? THEN 'true' ELSE 'false' END AS online
			FROM friends f
			JOIN users u ON (u.id = CASE WHEN f.id1 = ? THEN f.id2 ELSE f.id1 END)
			WHERE (f.id1 = ? OR f.id2 = ?) AND f.status = 'accepted'
		`).all(Date.now(), timeout, userId, userId, userId);
		return { friends };
	});

	fastify.get('/friends/requests', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get pending friend requests for current user',
			tags: ['Friends'],
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						requests: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									requester_id: { type: 'integer' },
									requester_name: { type: 'string' },
									requester_pfp: { type: 'string' },
									request_time: { type: 'integer' }
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
		const requests = db.prepare(`
			SELECT 
				u.id AS requester_id,
				u.name AS requester_name,
				u.profile_picture AS requester_pfp,
				f.time AS request_time
			FROM friends f
			JOIN users u ON (u.id = CASE WHEN f.id1 = ? THEN f.id2 ELSE f.id1 END)
			WHERE (f.id1 = ? OR f.id2 = ?) AND f.status = 'pending' AND f.requester != ?
		`).all(userId, userId, userId, userId);
		return { requests };
	});

	fastify.post('/friends/requests', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Send a friend request to another user',
			tags: ['Friends'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['id'],
				properties: {
					id: { type: 'integer', description: 'User ID to send friend request to' }
				}
			},
			response: {
				200: { type: 'object', properties: { success: { type: 'boolean' } } },
				400: errorResponseSchema,
				401: errorResponseSchema,
				403: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const tmpid1 = request.user.id;
		const tmpid2 = request.body.id;

		if (tmpid1 == tmpid2) return reply.status(400).send({ error: 'You cannot add yourself as a friend' });

		if (isBlocked(tmpid1, tmpid2)) return reply.status(403).send({ error: 'You cannot add this user as a friend' });

		const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(tmpid1);
		const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(tmpid2);

		if (!user1 || !user2) return reply.status(404).send({ error: 'User not found' });

		const id1 = Math.min(tmpid1, tmpid2);
		const id2 = Math.max(tmpid1, tmpid2);

		try {
			db.prepare('INSERT INTO friends (id1, id2, requester, time) VALUES (?, ?, ?, ?)').run(id1, id2, tmpid1, Date.now());
			return { success: true };
		} catch (err) {
			return reply.status(500).send({ error: 'Failed to add friend' });
		}
	});

	fastify.post('/friends/respond', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Respond to a friend request (accept or reject)',
			tags: ['Friends'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['id', 'status'],
				properties: {
					id: { type: 'integer', description: 'User ID of the requester' },
					status: { type: 'string', enum: ['accepted', 'rejected'], description: 'Response to the friend request' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						success: { type: 'boolean' },
						status: { type: 'string', enum: ['accepted', 'rejected'] }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				403: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const tmpid1 = request.user.id;
		const tmpid2 = request.body.id;
		const status = request.body.status;

		if (tmpid1 == tmpid2) return reply.status(400).send({ error: 'You cannot respond to yourself as a friend' });

		if (isBlocked(tmpid1, tmpid2)) return reply.status(403).send({ error: 'You cannot respond to this friend request' });

		if (status != 'accepted' && status != 'rejected') return reply.status(400).send({ error: 'Invalid status' });

		const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(tmpid1);
		const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(tmpid2);

		if (!user1 || !user2) return reply.status(404).send({ error: 'User not found' });

		const id1 = Math.min(tmpid1, tmpid2);
		const id2 = Math.max(tmpid1, tmpid2);

		const friendship = db.prepare('SELECT * FROM friends WHERE id1 = ? AND id2 = ?').get(id1, id2);
		if (!friendship) return reply.status(404).send({ error: 'Friend request not found' });
		if (friendship.status !== 'pending') return reply.status(400).send({ error: 'Friend request already processed' });
		if (friendship.requester === tmpid1) return reply.status(400).send({ error: 'You cannot respond to your own friend request' });

		try {
			if (status === 'rejected')
				db.prepare('DELETE FROM friends WHERE id1 = ? AND id2 = ?').run(id1, id2);
			else if (status === 'accepted')
				db.prepare('UPDATE friends SET status = ?, time = ? WHERE (id1 = ? AND id2 = ?) AND requester = ?').run(status, Date.now(), id1, id2, tmpid2);
			return { success: true, status: status };
		} catch (err) {
			return reply.status(500).send({ error: 'Failed to update friend request' });
		}
	});
}

export default friendsRoutes;
