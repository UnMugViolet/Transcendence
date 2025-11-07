import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyjwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import 'dotenv/config';


import path from 'path';
import cron from 'node-cron';

import db from './db.js';
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
	secret: process.env.JWT_SECRET
});

fastify.register(fastifyMultipart, {
  limits: { fileSize: 2 * 1024 * 1024 }
});

fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), 'img'),
  prefix: '/img/',
});

fastify.decorate('db', db);


fastify.decorate("authenticate", async function (request, reply) {
	try {
		await request.jwtVerify();
		if (request.user.type !== 'access')
			reply.status(401).send({ error: 'Unauthorized' });
		db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), request.user.id);
	} catch (err) {
		reply.status(401).send({ error: 'Unauthorized' });
	}
});

fastify.addHook('onRequest', async (request, reply) => {
  const acceptLang = request.headers['accept-language'];
  // extrait "fr" de "fr-FR,fr;q=0.9,en;q=0.8"
  const lang = acceptLang?.split(',')[0]?.split('-')[0] || 'en';
  request.lang = lang;
});

fastify.register(friendsRoutes);
fastify.register(authRoutes);
fastify.register(usersRoutes);
fastify.register(gameRoutes);
fastify.register(chat);

fastify.get('/', async () => {
	return { message: 'Hello from Fastify & SQLite 🎉' };
});

// DEBUG
fastify.get('/match', async () => {
	return db.prepare('SELECT * FROM match_history').all();
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
	.then(() => console.log('✅ Server running on http://localhost:3000'))
	.catch(err => {
		console.error(err);
		process.exit(1);
});


cron.schedule('0 * * * *', () => {
	db.prepare('DELETE FROM refresh_tokens WHERE ? - last_used_at > timeout').run(Date.now());
	console.log('Refresh tokens cleaned at', new Date().toLocaleString());
});

