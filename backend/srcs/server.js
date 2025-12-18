import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyjwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import 'dotenv/config';

import path from 'path';
import cron from 'node-cron';
import fs from 'fs';

import db, { dbPath } from './db.js';
import metrics from './metrics.js';
import chat from './routes/chat.js';
import authRoutes from './routes/auth.js';
import friendsRoutes from './routes/friends.js';
import usersRoutes from './routes/users.js';
import gameRoutes from './routes/game.js';
import { clients } from './routes/chat.js';
import { gameLoop, pauseLoop } from './routes/game.js';

const fastify = Fastify({ logger: {level: 'warn'}});

fastify.register(fastifyCors, {
	origin: '*',
});

fastify.register(fastifyjwt, {
	secret: process.env.JWT_SECRET,
	sign: {
		expiresIn: '20min'
	}
});

fastify.register(fastifyMultipart, {
  limits: { fileSize: 2 * 1024 * 1024 }
});

fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), 'img'),
  prefix: '/img/',
});

fastify.decorate('db', db);
fastify.decorate('metrics', metrics);


fastify.decorate("authenticate", async function (request, reply) {
	try {
		await request.jwtVerify();
		if (request.user.type !== 'access') {
			metrics.recordAuthFailure('invalid_token_type');
			return reply.status(401).send({ error: 'Unauthorized' });
		}
		db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), request.user.id);
	} catch (err) {
		console.error('JWT verification failed:', err); // Log the error for debugging
		metrics.recordAuthFailure('verification_failed');
		return reply.status(401).send({ error: 'Unauthorized' });
	}
});

// Metrics hook - track request timing and status
fastify.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now();
  
  const acceptLang = request.headers['accept-language'];
  const lang = acceptLang?.split(',')[0]?.split('-')[0] || 'en';
  request.lang = lang;
});

fastify.addHook('onResponse', async (request, reply) => {
  if (request.startTime) {
    const duration = (Date.now() - request.startTime) / 1000;
    const route = request.url.split('?')[0];
    metrics.recordHttpRequest(request.method, route, reply.statusCode, duration);
  }
});

fastify.register(friendsRoutes);
fastify.register(authRoutes);
fastify.register(usersRoutes);
fastify.register(gameRoutes);
fastify.register(chat);

fastify.get('/', async () => {
	return { message: 'Hello from Fastify & SQLite 🎉' };
});

// Prometheus metrics endpoint
fastify.get('/metrics', async (request, reply) => {
	reply.header('Content-Type', metrics.getContentType());
	return metrics.getMetrics();
});


fastify.addHook('onClose', async () => {
	console.log('🛑 Le serveur Fastify est en train de s’arrêter…');
	db.prepare('DELETE FROM party_players').run();
	db.prepare('DELETE FROM parties').run();
	if (db) {
		db.close();
		console.log('✅ Connexion à la base de données fermée.'); // DEBUG
	}

	clients.forEach((socket) => {
		socket.close(1001, 'Server is shutting down'); 
	});
	clients.clear();
	console.log('✅ Toutes les connexions WebSocket ont été fermées.'); // DEBUG

	if (gameLoop) {
		clearInterval(gameLoop);
		console.log('✅ La boucle de jeu a été arrêtée.'); // DEBUG
	}

	if (pauseLoop) {
		clearInterval(pauseLoop);
		console.log('✅ La boucle de pause a été arrêtée.'); // DEBUG
	}
	console.log('🛑 Le serveur Fastify s’est arrêté proprement.');
});

process.on('SIGINT', async () => {
	console.log('SIGINT received');
	await fastify.close();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('SIGTERM received');
	await fastify.close();
	process.exit(0);
});


fastify.listen({ port: 3000, host: '0.0.0.0' })
	.then(() => {
		console.log('✅ Server running on http://localhost:3000');
		// Update user metrics on startup
		const totalUsersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
		const demoUsersCount = db.prepare(`
			SELECT COUNT(*) as count 
			FROM users 
			JOIN roles ON users.role_id = roles.id 
			WHERE roles.name = 'demo'
		`).get().count;
		metrics.setTotalUsers(totalUsersCount);
		metrics.setDemoUsers(demoUsersCount);
	})
	.catch(err => {
		console.error(err);
		process.exit(1);
});


cron.schedule('0 * * * *', () => {
	db.prepare('DELETE FROM refresh_tokens WHERE ? - last_used_at > timeout').run(Date.now());
	console.log('Refresh tokens cleaned at', new Date().toLocaleString());
});

// Update user count metrics every minute
cron.schedule('* * * * *', () => {
	const totalUsersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
	const demoUsersCount = db.prepare(`
		SELECT COUNT(*) as count 
		FROM users 
		JOIN roles ON users.role_id = roles.id 
		WHERE roles.name = 'demo'
	`).get().count;
	metrics.setTotalUsers(totalUsersCount);
	metrics.setDemoUsers(demoUsersCount);
});

// Update database metrics every 30 seconds
cron.schedule('*/30 * * * * *', () => {
	try {
		const stats = fs.statSync(dbPath);
		metrics.setDatabaseSize(stats.size);
	} catch (err) {
		console.error('Error tracking database size:', err);
	}
});

// Remove all role demo account every day at 3am that has been created more than 24 hours ago every day at 3am
cron.schedule('0 3 * * *', () => {
	const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
	
	// Get the demo role ID
	const demoRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('demo');
	if (!demoRole) {
		console.log('Demo role not found in database');
		return;
	}
	
	// Find all demo users created more than 24 hours ago
	const demoUsers = db.prepare('SELECT id, name FROM users WHERE role_id = ? AND created_at < ?').all(demoRole.id, twentyFourHoursAgo);
	
	console.log(`Found ${demoUsers.length} demo users to clean up`);
	
	demoUsers.forEach(user => {
		try {
			// Delete user data
			db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
			db.prepare('DELETE FROM friends WHERE id1 = ? OR id2 = ?').run(user.id, user.id);
			db.prepare('DELETE FROM blocked WHERE blocker_id = ? OR blocked_id = ?').run(user.id, user.id);
			db.prepare('DELETE FROM party_players WHERE user_id = ?').run(user.id);
			db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(user.id, user.id);
			db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
			
			console.log(`Deleted demo user: ${user.name} (ID: ${user.id})`);
		} catch (err) {
			console.error(`Failed to delete demo user ${user.id}:`, err);
		}
	});
});
