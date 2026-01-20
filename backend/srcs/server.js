import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyjwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import twoFaRoutes from './services/two-factor-auth.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
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
import statsRoutes from './routes/stats.js';
import { clients } from './routes/chat.js';
import { gameLoop, pauseLoop } from './routes/game.js';
import { i18n } from './services/i18n-service.js';

const fastify = Fastify({ 
	logger: {level: 'warn'}
});


// Swagger configuration
await fastify.register(fastifySwagger, {
	openapi: {
		openapi: '3.0.0',
		info: {
			title: 'Transcendence API',
			description: 'API documentation for the Transcendence Pong game',
			version: '1.0.0'
		},
		servers: [
			{
				url: 'http://localhost:3000',
				description: 'Development server (HTTP)'
			}
		],
		tags: [
			{ name: 'Auth', description: 'Authentication endpoints' },
			{ name: 'Users', description: 'User management endpoints' },
			{ name: 'Friends', description: 'Friends management endpoints' },
			{ name: 'Game', description: 'Game management endpoints' },
			{ name: 'Stats', description: 'Statistics endpoints' },
			{ name: 'Chat', description: 'Chat and WebSocket endpoints' }
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT',
					description: 'Enter your JWT access token'
				}
			}
		}
	}
});

await fastify.register(fastifySwaggerUi, {
	routePrefix: '/docs',
	uiConfig: {
		docExpansion: 'list',
		deepLinking: true
	},
	staticCSP: true,
	transformSpecificationClone: true
});

fastify.register(fastifyCors, {
	origin: '*',
	credentials: true 
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

// Custom error handler for schema validation
fastify.setErrorHandler((error, request, reply) => {
	const lang = request.headers['accept-language'] || 'en';
	
	// Handle Fastify schema validation errors
	if (error.validation) {
		const firstError = error.validation[0];
		
		// Check for missing required fields
		if (firstError.keyword === 'required') {
			const missingField = firstError.params.missingProperty;
			
			if (missingField === 'name') {
				return reply.status(400).send({ error: i18n.t('nameRequired', lang) });
			}
			if (missingField === 'password') {
				return reply.status(400).send({ error: i18n.t('passwordRequired', lang) });
			}
			if (missingField === 'token') {
				return reply.status(400).send({ error: i18n.t('tokenRequired', lang) });
			}
		}
		
		// Handle minLength/maxLength errors
		if (firstError.keyword === 'minLength' && firstError.instancePath === '/name') {
			return reply.status(400).send({ error: i18n.t('nameMinLength', lang) });
		}
		if (firstError.keyword === 'maxLength' && firstError.instancePath === '/name') {
			return reply.status(400).send({ error: i18n.t('nameMaxLength', lang) });
		}
		if (firstError.keyword === 'minLength' && firstError.instancePath === '/password') {
			return reply.status(400).send({ error: i18n.t('passwordMinLength', lang) });
		}
		
		// Generic validation error
		return reply.status(400).send({ error: error.message });
	}
	
	// Handle other errors normally
	reply.send(error);
});

fastify.register(statsRoutes, { 
prefix: '/stats' });

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
		// console.error('JWT verification failed:', err); // Log the error for debugging
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
fastify.register(twoFaRoutes, { prefix: '/2fa' });


fastify.get('/', {
	schema: {
		description: 'Health check endpoint',
		tags: ['General'],
		response: {
			200: {
				type: 'object',
				properties: {
					message: { type: 'string' }
				}
			}
		}
	}
}, async () => {
	return { message: 'Checkout documentation for the Transcendence API at /docs' };
});

// Prometheus metrics endpoint
fastify.get('/metrics', {
	schema: {
		description: 'Prometheus metrics endpoint',
		tags: ['General'],
		response: {
			200: {
				type: 'string',
				description: 'Prometheus metrics in text format'
			}
		}
	}
}, async (request, reply) => {
	reply.header('Content-Type', metrics.getContentType());
	return metrics.getMetrics();
});


fastify.addHook('onClose', async () => {
	console.log('🛑 Fastify server is stopping…');
	db.prepare('DELETE FROM party_players').run();
	db.prepare('DELETE FROM parties').run();
	if (db) {
		db.close();
		console.log('✅ Database connection closed.'); // DEBUG
	}

	clients.forEach((socket) => {
		socket.close(1001, 'Server is shutting down'); 
	});
	clients.clear();
	console.log('✅ All WebSocket connections have been closed.'); // DEBUG

	if (gameLoop) {
		clearInterval(gameLoop);
		console.log('✅ Game loop has been stopped.'); // DEBUG
	}

	if (pauseLoop) {
		clearInterval(pauseLoop);
		console.log('✅ Pause loop has been stopped.'); // DEBUG
	}
	console.log('🛑 Fastify server has stopped cleanly.');
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
		console.log('📚 API Documentation available at http://localhost:3000/docs');
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
