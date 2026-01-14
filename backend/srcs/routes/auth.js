import bcrypt from 'bcrypt';
import db from '../db.js';
import speakeasy from 'speakeasy';

import { BACKEND_URL } from "../config.js";
import { checkName, checkPassword } from '../utils.js';

// Common schema definitions
const errorResponseSchema = {
	type: 'object',
	properties: {
		error: { type: 'string' }
	}
};

const roleSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer' },
		name: { type: 'string', enum: ['user', 'admin', 'demo'] }
	}
};

const authResponseSchema = {
	type: 'object',
	properties: {
		accessToken: { type: 'string', description: 'JWT access token (expires in 20min)' },
		refreshToken: { type: 'string', description: 'JWT refresh token for obtaining new access tokens' },
		role: roleSchema
	}
};

async function authRoutes(fastify) {
	// DEBUG endpoint - should be removed or protected in production
	fastify.get('/token', {
		schema: {
			description: 'Debug endpoint to list all refresh tokens (remove in production)',
			tags: ['Auth'],
			response: {
				200: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							user_id: { type: 'integer' },
							token: { type: 'string' },
							user_agent: { type: 'string' },
							timeout: { type: 'integer' },
							last_used_at: { type: 'integer' }
						}
					}
				}
			}
		}
	}, async () => {
		return db.prepare('SELECT * FROM refresh_tokens').all();
	});

	async function genKey(id, name, stayConnect, userAgent, role) {
		const accessToken = fastify.jwt.sign({ 
			id: id, 
			name: name, 
			type: 'access' 
		}, { expiresIn: '20min' });

		const refreshToken = fastify.jwt.sign({ 
			id: id, 
			name: name, 
			type: 'refresh' 
		});

		let expiresAt;
		if (stayConnect) {
			expiresAt = 7 * 24 * 60 * 60 * 1000; // 7 days
		}
		else expiresAt = 60 * 60 * 1000; // 1 hour

		db.prepare('INSERT INTO refresh_tokens (user_id, token, user_agent, timeout, last_used_at) VALUES (?, ?, ?, ?, ?)').run(id, refreshToken, userAgent, expiresAt, Date.now());
		return { accessToken, refreshToken };
	}


	fastify.post('/register', {
		schema: {
			description: 'Register a new user account',
			tags: ['Auth'],
			body: {
				type: 'object',
				required: ['name', 'password'],
				properties: {
					name: { type: 'string', minLength: 1, maxLength: 20, description: 'Username (unique, case-insensitive)' },
					password: { type: 'string', minLength: 6, description: 'User password' },
					stayConnect: { type: 'boolean', description: 'If true, refresh token lasts 7 days; otherwise 1 hour' },
					roleType: { type: 'string', enum: ['user', 'admin', 'demo'], default: 'user', description: 'User role type' }
				}
			},
			response: {
				200: authResponseSchema,
				400: errorResponseSchema,
				409: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const name = request.body.name?.trim();
		const password = request.body.password;
		const stayConnect = request.body.stayConnect;
		const roleType = request.body.roleType || 'user'; // Default to 'user' role

		console.log('Received request to add user:', name, 'with roleType:', roleType);

		if (!name) {
			return reply.status(400).send({ error: 'Name is required' });
		}
		if (!password) {
			return reply.status(400).send({ error: 'Password is required' });
		}

		let check = checkName(name);
		if (!check.valid) {
			return reply.status(400).send({ error: check.error });
		}

		check = checkPassword(password);
		if (!check.valid) {
			return reply.status(400).send({ error: check.error });
		}

		// Validate roleType
		const allowedRoles = ['user', 'admin', 'demo'];
		if (!allowedRoles.includes(roleType)) {
			return reply.status(400).send({ error: 'Invalid role type' });
		}

		// Get role ID from role name
		const roleRecord = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleType);
		if (!roleRecord) {
			return reply.status(500).send({ error: 'Role not found in database' });
		}

		const hashedPass = bcrypt.hashSync(password, 10);

		try {
			const info = db.prepare(
				'INSERT INTO users (name, password, role_id, last_seen, created_at) VALUES (?, ?, ?, ?, ?)'
			).run(name, hashedPass, roleRecord.id, Date.now(), Date.now());

			const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(roleRecord.id);

			console.log("User ", name, " added with ID:", info.lastInsertRowid, "and role:", role.name);
			const tokens = await genKey(info.lastInsertRowid, name, stayConnect, request.headers['user-agent']);
			return { ...tokens, role };
		} catch (err) {
			if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
				return reply.status(409).send({ error: 'Name already exists' });
			}
			throw err;
		}
	});


	fastify.post('/login', {
		schema: {
			description: 'Login with existing user credentials',
			tags: ['Auth'],
			body: {
				type: 'object',
				required: ['name', 'password'],
				properties: {
					name: { type: 'string', description: 'Username' },
					password: { type: 'string', description: 'User password' },
					stayConnect: { type: 'boolean', description: 'If true, refresh token lasts 7 days; otherwise 1 hour' }
				}
			},
			response: {
				200: authResponseSchema,
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const name = request.body.name?.trim();
		const password = request.body.password;
		const stayConnect = request.body.stayConnect;

		console.log('Received request to login user:', name);

		if (!name) {
			return reply.status(400).send({ error: 'Name is required' });
		}
		if (!password) {
			return reply.status(400).send({ error: 'Password is required' });
		}

		const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}

		const isValidPass = bcrypt.compareSync(password, user.password);
		if (!isValidPass) {
			return reply.status(401).send({ error: 'Invalid password' });
		}

		// Check if 2FA is enabled
		if (user.two_fa_enabled) { 
			return {
				requiresTwoFA: true,
				userId: user.id,
				tempToken: fastify.jwt.sign({ 
					id: user.id,
					name: user.name, 
					type: '2fa'
				}, { expiresIn: '5min' })
			};
		}

		db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);

		const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(user.role_id);

		console.log("User ", name, " logged in successfully with role:", role.name);
		const tokens = await genKey(user.id, user.name, stayConnect, request.headers['user-agent']);
		return { ...tokens, role };
	});


	fastify.post('/login/2fa', async (request, reply) => {
		const { tempToken, token, stayConnect } = request.body;

		if (!tempToken || !token) {
			return reply.status(400).send({ error: 'tempToken and token are required' });
		}

		let payload;
		try {
			payload = fastify.jwt.verify(tempToken);
		} catch (err) {
			return reply.status(401).send({ error: 'Invalid or expired tempToken' });
		}
		if (payload?.type !== '2fa' || !payload?.id) {
			return reply.status(401).send({ error: 'Invalid tempToken' });
		}

		const userId = payload.id;
		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}
		if (!user.two_fa_enabled || !user.two_fa_secret) {
			return reply.status(400).send({ error: '2FA not enabled for this user' });
		}

		// Verify TOTP first
		let verified = speakeasy.totp.verify({
			secret: user.two_fa_secret,
			encoding: 'base32',
			token: token,
			window: 2
		});

		// If TOTP fails, check backup codes
		if (!verified && user.two_fa_backup_codes) {
			try {
				const backupCodes = JSON.parse(user.two_fa_backup_codes);
				const codeIndex = backupCodes.indexOf(String(token).toUpperCase());
				if (codeIndex !== -1) {
					backupCodes.splice(codeIndex, 1);
					db.prepare('UPDATE users SET two_fa_backup_codes = ? WHERE id = ?').run(JSON.stringify(backupCodes), userId);
					verified = true;
				}
			} catch (err) {
				// Ignore malformed backup codes and fall through to invalid token
			}
		}

		if (!verified) {
			return reply.status(401).send({ error: 'Invalid token' });
		}

		db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);

		const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(user.role_id);

		console.log("User ", user.name, " logged in successfully with 2FA and role:", role.name);
		const tokens = await genKey(user.id, user.name, stayConnect, request.headers['user-agent']);
		return { ...tokens, role };
	});

	fastify.post('/refresh', async (request, reply) => {
	fastify.post('/refresh', {
		schema: {
			description: 'Refresh access token using a valid refresh token',
			tags: ['Auth'],
			body: {
				type: 'object',
				required: ['token'],
				properties: {
					token: { type: 'string', description: 'Refresh token' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						newAccessToken: { type: 'string', description: 'New JWT access token' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema
			}
		}
	}, async (request, reply) => {

		const { token } = request.body;

		if (!token) {
			return reply.status(400).send({ error: 'Token is required' });
		}

		try {
			const payload = fastify.jwt.verify(token);
			if (payload.type !== 'refresh') {
				return reply.status(401).send({ error: 'Unauthorized' });
			}
		} catch (err) {
			console.error('Error verifying token in /user delete route:', err);
			return reply.status(401).send({ error: 'Invalid token' });
		}
		const now = Date.now();

		const tokenInfo = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
		if (!tokenInfo) {
			return reply.status(404).send({ error: 'Token not found' });
		}

		if (now - tokenInfo.last_used_at > tokenInfo.timeout) {
			db.prepare('DELETE FROM refresh_tokens WHERE token = ? AND user_agent = ?').run(token, request.headers['user-agent']);
			return reply.status(401).send({ error: 'Token expired' });
		}

		const user = db.prepare('SELECT * FROM users WHERE id = ?').get(tokenInfo.user_id);
		if (!user) {
			return reply.status(404).send({ error: 'User not found' });
		}

		db.prepare('UPDATE refresh_tokens SET last_used_at = ? WHERE token = ? AND user_agent = ?').run(Date.now(), token, request.headers['user-agent']);

		const newAccessToken = fastify.jwt.sign({ id: user.id, name: user.name, type: 'access' }, { expiresIn: '20min' });
		return { newAccessToken };
	});



	// Delete user account by refresh token
	fastify.delete('/user', {
		schema: {
			description: 'Delete user account using refresh token',
			tags: ['Auth'],
			body: {
				type: 'object',
				required: ['token'],
				properties: {
					token: { type: 'string', description: 'Refresh token of the account to delete' }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' }
					}
				},
				400: errorResponseSchema,
				401: errorResponseSchema,
				404: errorResponseSchema,
				500: errorResponseSchema
			}
		}
	}, async (request, reply) => {
		const { token } = request.body;

		if (!token) {
			return reply.status(400).send({ error: 'Token is required' });
		}

		try {
			const payload = fastify.jwt.verify(token);
			if (payload.type !== 'refresh') {
				return reply.status(401).send({ error: 'Unauthorized' });
			}
		} catch (err) {
			return reply.status(401).send({ error: 'Invalid token' });
		}

		const tokenInfo = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
		if (!tokenInfo) {
			return reply.status(404).send({ error: 'Token not found' });
		}

		const userId = tokenInfo.user_id;

		try {
			// Delete in correct order to respect foreign key constraints
			// Delete messages where user is sender or receiver
			db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(userId, userId);
			// Delete invites where user is inviter or invitee
			db.prepare('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?').run(userId, userId);
			// Delete party_players records first
			db.prepare('DELETE FROM party_players WHERE user_id = ?').run(userId);
			// Delete parties that have no players (user may have been the only one)
			db.prepare('DELETE FROM parties WHERE id NOT IN (SELECT DISTINCT party_id FROM party_players)').run();
			// Delete match history where user participated
			db.prepare('DELETE FROM match_history WHERE p1_id = ? OR p2_id = ? OR winner_id = ?').run(userId, userId, userId);
			// Delete friends records
			db.prepare('DELETE FROM friends WHERE id1 = ? OR id2 = ?').run(userId, userId);
			// Delete blocked records
			db.prepare('DELETE FROM blocked WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
			// Delete refresh tokens
			db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
			// Finally delete the user
			db.prepare('DELETE FROM users WHERE id = ?').run(userId);

			console.log("User with ID ", userId, " deleted successfully.");
			return { message: 'User deleted successfully' };
		} catch (err) {
			console.error("Error deleting user:", err);
			return reply.status(500).send({ error: 'Failed to delete user' });
		}
	});
}

export default authRoutes;
