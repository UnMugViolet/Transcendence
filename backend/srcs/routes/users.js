import fs from "fs";
import pump from 'pump';
import bcrypt from 'bcrypt';

import db from '../db.js';
import { checkName, checkPassword, isBlocked } from '../utils.js';

// Common schema definitions
const errorResponseSchema = {
	type: 'object',
	properties: {
		error: { type: 'string' }
	}
};

const userProfileSchema = {
	type: 'object',
	properties: {
		user: {
			type: 'object',
			properties: {
				id: { type: 'integer' },
				name: { type: 'string' },
				profile_picture: { type: 'string' },
				created_at: { type: 'integer' },
				role: {
					type: 'object',
					properties: {
						id: { type: 'integer' },
						name: { type: 'string' }
					}
				}
			}
		}
	}
};

async function usersRoutes(fastify) {

	if (!fs.existsSync('./img')) {
		fs.mkdirSync('./img');
	}

	fastify.get('/profile', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get current authenticated user profile',
			tags: ['Users'],
			security: [{ bearerAuth: [] }],
			response: {
				200: userProfileSchema,
				401: errorResponseSchema
			}
		}
	}, async (request) => {
		console.log('User profile requested:', request.user.name);
		const info = db.prepare(`
			SELECT u.id, u.name, u.profile_picture, u.created_at, u.language, u.role_id, r.id as role_id, r.name as role_name
			FROM users u
			LEFT JOIN roles r ON u.role_id = r.id
			WHERE u.id = ?
		`).get(request.user.id);
		
		// Format the response to include role object
		const user = {
			id: info.id,
			name: info.name,
			profile_picture: info.profile_picture,
			created_at: info.created_at,
			language: info.language || 'en',
			role: {
				id: info.role_id,
				name: info.role_name
			}
		};
		
		return { user };
	});

	fastify.get('/users', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Get list of all users',
			tags: ['Users'],
			response: {
				200: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: { type: 'integer' },
							name: { type: 'string' },
							profile_picture: { type: 'string' },
							created_at: { type: 'integer' },
							isBlocked: {
								type: 'object',
								properties: {
									blocked_by_me: { type: 'boolean' },
									blocked_by_user: { type: 'boolean' }
								}
							}
						}
					}
				}
			}
		}
	}, async (request) => {
		const currentUserId = request.user.id;
		const users = db.prepare('SELECT id, name, profile_picture, created_at FROM users').all();
		return users.map(u => {
			const blockedStatus = isBlocked(currentUserId, u.id);
			return { 
			...u,
			isBlocked: blockedStatus
		 	};
		});
	});

	fastify.get("/users/:id", {
		schema: {
			description: 'Get user by ID with match history',
			tags: ['Users'],
			params: {
				type: 'object',
				properties: {
					id: { type: 'integer', description: 'User ID' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						profile_picture: { type: 'string' },
						matches: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									match_id: { type: 'integer' },
									p1_id: { type: 'integer' },
									p2_id: { type: 'integer' },
									p1_score: { type: 'integer' },
									p2_score: { type: 'integer' },
									winner_id: { type: 'integer' },
									created_at: { type: 'integer' }
								}
							}
						}
					}
				},
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.params.id;

		const info = db.prepare(`
			SELECT 
				u.id,
				u.name,
				u.profile_picture,
				u.created_at,
				m.id AS match_id,
				m.p1_id,
				m.p2_id,
				m.p1_score,
				m.p2_score,
				m.winner_id,
				m.created_at
			FROM users u
			LEFT JOIN match_history m
				ON u.id = m.p1_id OR u.id = m.p2_id
			WHERE u.id = ?;
		`).all(userId);

		if (!info || info.length === 0) {
			return reply.status(404).send({ error: 'User not found' });
		}

		const { name, profile_picture } = info[0];
		const matches = info.map(row => ({
			match_id: row.match_id,
			p1_id: row.p1_id,
			p2_id: row.p2_id,
			p1_score: row.p1_score,
			p2_score: row.p2_score,
			winner_id: row.winner_id,
			created_at: row.created_at
		}));

		return { name, profile_picture, matches };
	});

	fastify.post('/update/name', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Update current user name',
			tags: ['Users'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['name'],
				properties: {
					name: { type: 'string', minLength: 1, maxLength: 20, description: 'New username' }
				}
			},
			response: {
				200: { type: 'object', properties: { success: { type: 'boolean' } } },
				400: errorResponseSchema,
				401: errorResponseSchema,
				409: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.user.id;
		const { name } = request.body;

		const check = checkName(name);
		if (!check.valid) return reply.status(400).send({ error: check.error });

		try {
			db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
			return { success: true };
		} catch (err) {
			if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.status(409).send({ error: 'Name already exists' });
			else return reply.status(500).send({ error: 'Failed to update profile' });
		}
	});

	fastify.post('/update/password', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Update current user password',
			tags: ['Users'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['password'],
				properties: {
					password: { type: 'string', minLength: 8, description: 'New password' }
				}
			},
			response: {
				200: { type: 'object', properties: { success: { type: 'boolean' } } },
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.user.id;
		const { password } = request.body;

		const check = checkPassword(password);
		if (!check.valid) return reply.status(400).send({ error: check.error });

		const hashedPass = bcrypt.hashSync(password, 10);
		try {
			db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPass, userId);
			return { success: true };
		} catch (err) {
			return reply.status(500).send({ error: 'Failed to update password' });
		}
	});

	fastify.post('/update/profile_picture', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Update current user profile picture',
			tags: ['Users'],
			security: [{ bearerAuth: [] }],
			consumes: ['multipart/form-data'],
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						filename: { type: 'string' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.user.id;
		const file = await request.file();

		if (!file) return reply.status(400).send({ error: 'No file uploaded' });

		if(file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png' && file.mimetype !== 'image/gif')
			return reply.status(400).send({ error: 'Invalid file type. Only JPEG, PNG, and GIF are allowed.' });

		if (file.file.truncated)
			return reply.status(400).send({ error: 'File too large' });

		const oldFilename = db.prepare('SELECT profile_picture FROM users WHERE id = ?').get(userId).profile_picture;
		if (oldFilename && oldFilename !== 'default.jpg') {
			try {
				fs.unlinkSync(`./img/${oldFilename}`);
			} catch (err) {
				console.error('Failed to delete old profile picture:', err);
			}
		}

		const ext = file.mimetype.split('/')[1];
		const filename = `${userId}_${Date.now()}.${ext}`;

		await pump(file.file, fs.createWriteStream(`./img/${filename}`));

		db.prepare(`UPDATE users SET profile_picture = ? WHERE id = ?`).run(filename, userId);

		return { message: 'Profile picture updated', filename };
	});

	// Update user language preference
	fastify.patch('/language', {
		preHandler: fastify.authenticate,
		schema: {
			description: 'Update user language preference',
			tags: ['Users'],
			security: [{ bearerAuth: [] }],
			body: {
				type: 'object',
				required: ['language'],
				properties: {
					language: { 
						type: 'string',
						enum: ['en', 'fr', 'ch'],
						description: 'Language code (en, fr, ch)'
					}
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						language: { type: 'string' }
					}
				},
				400: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const userId = request.user.id;
		const { language } = request.body;

		// Validate language
		const supportedLanguages = ['en', 'fr', 'ch'];
		if (!supportedLanguages.includes(language)) {
			return reply.status(400).send({ error: 'Unsupported language' });
		}

		try {
			db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, userId);
			return { message: 'Language preference updated', language };
		} catch (error) {
			console.error('Error updating language:', error);
			return reply.status(500).send({ error: 'Failed to update language preference' });
		}
	});
}

export default usersRoutes;
