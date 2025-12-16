import bcrypt from 'bcrypt';
import db from '../db.js';
import { checkName, checkPassword } from '../utils.js';

async function authRoutes(fastify) {
	// DEBUG
	fastify.get('/token', async () => {
		return db.prepare('SELECT * FROM refresh_tokens').all();
	});

	function genKey(id, name, stayConnect, userAgent)
	{
		const accessToken = fastify.jwt.sign({ id: id, name : name, type : 'access' }, { expiresIn: '20min' });
		const refreshToken = fastify.jwt.sign({ id: id, name : name, type : 'refresh' });

		let expiresAt;
		if (stayConnect) {
			expiresAt =  7 * 24 * 60 * 60 * 1000; // 7 days
		}
		else expiresAt = 60 * 60 * 1000; // 1 hour

		db.prepare('INSERT INTO refresh_tokens (user_id, token, user_agent, timeout, last_used_at) VALUES (?, ?, ?, ?, ?)').run(id, refreshToken, userAgent, expiresAt, Date.now());
		return { accessToken, refreshToken };
	}


	fastify.post('/register', async (request, reply) => {
		const name = request.body.name?.trim();
		const password = request.body.password;
		const stayConnect = request.body.stayConnect;

		console.log('Received request to add user:', name);

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

		const hashedPass = bcrypt.hashSync(password, 10);

		try {
			const info = db.prepare('INSERT INTO users (name, pass, last_seen, created_at) VALUES (?, ?, ?, ?)').run(name, hashedPass, Date.now(), Date.now());

			console.log("User ", name, " added with ID:", info.lastInsertRowid);
			return genKey(info.lastInsertRowid, name, stayConnect, request.headers['user-agent']);
		} catch (err) {
			if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
				return reply.status(409).send({ error: 'Name already exists' });
			}
			throw err;
		}
	});


	fastify.post('/login', async (request, reply) => {
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

		const isValidPass = bcrypt.compareSync(password, user.pass);
		if (!isValidPass) {
			return reply.status(401).send({ error: 'Invalid password' });
		}

		db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);

		console.log("User ", name, " logged in successfully.");
		return genKey(user.id, user.name, stayConnect, request.headers['user-agent']);
	});


	fastify.post('/refresh',  async (request, reply) => {

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
		const now = Date.now();

		// DEV : ignore user agent
		// const tokenInfo = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND user_agent = ?').get(token, request.headers['user-agent']);
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



	// TODO : check if the user has the right to delete the account by taking its token and the token in body
	fastify.delete('/user', async (request, reply) => {
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

		// Delete in correct order to respect foreign key constraints
		// Delete messages where user is sender or receiver
		db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(userId, userId);
		// Delete invites where user is inviter or invitee
		db.prepare('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?').run(userId, userId);
		// Delete party_players records
		db.prepare('DELETE FROM party_players WHERE user_id = ?').run(userId);
		// Delete parties (if user was the owner, they should be cleaned up)
		db.prepare('DELETE FROM parties WHERE id IN (SELECT party_id FROM party_players WHERE user_id = ?)').run(userId);
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
	});
}

export default authRoutes;
