import fs from "fs";
import pump from 'pump';

import db from '../db.js';
import { checkName, checkPassword } from '../utils.js';

async function usersRoutes(fastify) {

	if (!fs.existsSync('./img')) {
		fs.mkdirSync('./img');
	}

	fastify.get('/profile', { preHandler: fastify.authenticate }, async (request) => {
		console.log('User profile requested:', request.user.name);
		const info = db.prepare('SELECT id, name, profile_picture, created_at FROM users WHERE id = ?').get(request.user.id);
		return { user: info };
	});

	fastify.get('/users', async () => {
		return db.prepare('SELECT id, name, profile_picture, created_at FROM users').all();
	});

	fastify.get("/users/:id", async (request, reply) => {
		const userId = request.params.id;

		const info = db.prepare(`
			SELECT 
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

	fastify.post('/update/name', { preHandler: fastify.authenticate }, async (request, reply) => {
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

	fastify.post('/update/password', { preHandler: fastify.authenticate }, async (request, reply) => {
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

	fastify.post('/update/profile_picture', { preHandler: fastify.authenticate }, async (request, reply) => {
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
}

export default usersRoutes;
