import websocketPlugin from '@fastify/websocket';
import db from '../db.js';
import { isBlocked } from '../utils.js';
import { movePlayer, handlePause, sendSysMessage } from './game.js';

const clients = new Map();

async function chat(fastify) {
	await fastify.register(websocketPlugin);


	/* Format message
	{
		type: 'private' | 'party',
		from: sender_id,
		to: receiver_id | party_id,
		message: 'Hello',
		send_at: timestamp
	}
	*/

	// Invites table
	// ID | invitee_id | inviter_id | party_id | status | created_at

	//---------------------- INVITES -----------------------//

	fastify.get('/invites', { preHandler: fastify.authenticate }, async (request) => {
		const userId = request.user.id;
		const invites = db.prepare(`
			SELECT
				i.id,
				i.inviter_id,
				u.name AS inviter_name,
				u.profile_picture AS inviter_profile_picture,
				i.party_id,
				i.status,
				i.created_at
			FROM invites i
			JOIN users u ON i.inviter_id = u.id
			WHERE i.invitee_id = ? AND i.status = ?
		`).all(userId, 'pending');
		return { invites };
	});

	fastify.post('/invite', { preHandler: fastify.authenticate }, async (request, reply) => {
		const inviterId = request.user.id;
		const inviteeId = request.body.inviteeId;

		if (inviterId === inviteeId) return reply.status(400).send({ error: 'You cannot invite yourself' });

		const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(inviterId);
		const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(inviteeId);

		if (!user1 || !user2) return reply.status(404).send({ error: 'User not found' });

		if (isBlocked(user1.id, user2.id)) return reply.status(403).send({ error: 'You cannot invite this user' });

        const inviterParty = db.prepare('SELECT * FROM party_players WHERE user_id = ?').get(inviterId);
        if (!inviterParty) return reply.status(403).send({ error: 'You are not in a party' });

        const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(inviterParty.party_id);
        if (!party) return reply.status(404).send({ error: 'Party not found' });

        const isInviterInParty = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND user_id = ?').get(party.id, inviterId);
        if (!isInviterInParty) return reply.status(403).send({ error: 'You are not in this party' });

        const isInviteeInParty = db.prepare('SELECT * FROM party_players WHERE party_id = ? AND user_id = ?').get(party.id, inviteeId);
        if (isInviteeInParty) return reply.status(409).send({ error: 'This user is already in the party' });

		let existingInvite = db.prepare('SELECT * FROM invites WHERE invitee_id = ? AND inviter_id = ? AND party_id = ? AND status = ?').get(inviteeId, inviterId, party.id, 'pending');
		if (existingInvite) return reply.status(409).send({ error: 'You have already invited this user to this party' });
		existingInvite = db.prepare('SELECT * FROM invites WHERE invitee_id = ? AND inviter_id = ? AND party_id = ? AND status = ?').get(inviteeId, inviterId, party.id, 'accepted');
		if (existingInvite) return reply.status(409).send({ error: 'This user is already in the party' });

		db.prepare('INSERT INTO invites (invitee_id, inviter_id, party_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(inviteeId, inviterId, party.id, 'pending', Date.now());
		const invitee = db.prepare('SELECT name FROM users WHERE id = ?').get(inviteeId);
		return { success: true, inviteeName: invitee.name };
	});

	fastify.post('/invite/respond', { preHandler: fastify.authenticate }, async (request, reply) => {
		const inviteeId = request.user.id;
		const { inviteId, status } = request.body;

		if (!['accepted', 'rejected'].includes(status)) return reply.status(400).send({ error: 'Invalid action' });

		const invite = db.prepare('SELECT * FROM invites WHERE id = ? AND invitee_id = ?').get(inviteId, inviteeId);
		if (!invite) return reply.status(404).send({ error: 'Invite not found' });
		if (invite.status !== 'pending') return reply.status(400).send({ error: 'Invite already processed' });

		const inviterId = invite.inviter_id;
		if (inviteeId === inviterId) return reply.status(400).send({ error: 'You cannot respond to your own invite' });

		const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(inviteeId);
		const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(inviterId);

		if (!user1 || !user2) return reply.status(404).send({ error: 'User not found' });

		if (isBlocked(user1.id, user2.id)) return reply.status(403).send({ error: 'You cannot respond to this invite' });

		if (status === 'accepted') {
            const party = db.prepare('SELECT * FROM party_players WHERE user_id = ?').get(inviteeId);
            if (party) return reply.status(409).send({ error: 'You are already in a party' });

			const partyPlayers = db.prepare('SELECT team FROM party_players WHERE party_id = ?').all(invite.party_id);
			let userTeam = 1;
			if (partyPlayers.length > 0) {
				userTeam = partyPlayers[0].team === 1 ? 2 : 1;
			}

			db.prepare('INSERT INTO party_players (party_id, user_id, team, status) VALUES (?, ?, ?, ?)').run(invite.party_id, inviteeId, userTeam, 'active');
			db.prepare('UPDATE invites SET status = ? WHERE id = ?').run('accepted', inviteId);
			// db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND user_id = ?').run('active', invite.party_id, inviteeId);
		} else {
			db.prepare('DELETE FROM invites WHERE id = ?').run(inviteId);
            // db.prepare('DELETE FROM party_players WHERE party_id = ? AND user_id = ?').run(invite.party_id, inviteeId);
		}
		return { success: true };
	});


	//-----------------------------------------------------//

	//------------------ BLOCK / UNBLOCK ------------------//

	fastify.get('/block', { preHandler: fastify.authenticate }, async (request) => {
		const blockerId = request.user.id;
		const blockedUsers = db.prepare(`
			SELECT
				u.id,
				u.name,
				u.profile_picture,
				b.time
			FROM blocked b
			JOIN users u ON b.blocked_id = u.id
			WHERE b.blocker_id = ?
		`).all(blockerId);
		return { blocked: blockedUsers };
	});


	fastify.post('/block', { preHandler: fastify.authenticate }, async (request, reply) => {
		const blockerId = request.user.id;
		const blockedId = request.body.id;

		if (blockerId === blockedId) return reply.status(400).send({ error: 'You cannot block yourself' });

		const user1 = db.prepare('SELECT * FROM users WHERE id = ?').get(blockerId);
		const user2 = db.prepare('SELECT * FROM users WHERE id = ?').get(blockedId);

		if (!user1 || !user2) return reply.status(404).send({ error: 'User not found' });

		try {
			db.prepare('DELETE FROM friends WHERE (id1 = ? AND id2 = ?)').run(Math.min(blockerId, blockedId), Math.max(blockerId, blockedId));
			db.prepare('INSERT INTO blocked (blocker_id, blocked_id, time) VALUES (?, ?, ?)').run(blockerId, blockedId, Date.now());
			return { success: true };
		} catch (err) {
			return reply.status(500).send({ error: 'Failed to block user' });
		}
	});

	fastify.post('/unblock', { preHandler: fastify.authenticate }, async (request, reply) => {
		const blockerId = request.user.id;
		const blockedId = request.body.id;

		db.prepare('DELETE FROM blocked WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);

		return { success: true };
	});

	//------------------------------------------------//

	fastify.get('/messages/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
		const userId = request.user.id;
		const otherUserId = parseInt(request.params.id, 10);
		if (isNaN(otherUserId)) return reply.status(400).send({ error: 'Invalid user ID' });

		if (isBlocked(userId, otherUserId)) return reply.status(403).send({ error: 'You cannot view messages with this user' });

		const messages = db.prepare(`
			SELECT
				id,
				sender_id,
				receiver_id,
				message,
				send_at
			FROM messages
			WHERE (sender_id = ? AND receiver_id = ?)
			   OR (sender_id = ? AND receiver_id = ?)
			ORDER BY send_at ASC
			LIMIT 100
		`).all(userId, otherUserId, otherUserId, userId);

		return { messages };
	});

	fastify.get('/ws', { websocket: true }, async (connection, req) => {
		try {
			const token = req.query.token;
			if (!token) throw new Error('No token');
			console.log("WS token:", token);

			const payload = fastify.jwt.verify(token);
			console.log("WS payload:", payload);
			if (payload.type !== 'access') throw new Error('Unauthorized');

			clients.set(payload.id, connection.socket);

			console.log(`🔌 Client connecté : ${payload.name}`);

			const disconnected = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status = ?').get(payload.id, 'disconnected');
			let party;
			if (disconnected)
				party = db.prepare('SELECT * FROM parties WHERE id = ? AND type != ?').get(disconnected.party_id, '1v1Offline');
			if (disconnected && party) clients.get(payload.id).send(JSON.stringify({ type: 'reconnect' }));

			connection.socket.on('message', (msg) => {
				try {
					const data = JSON.parse(msg);
					if (data.type === 'input') {
						movePlayer(data);
						return;
					}
					if (!data.type || !data.to || !data.message)
						throw new Error('Invalid message format');

					data.from = payload.id;
					data.send_at = Date.now();

					if (data.message.length > 500) throw new Error('Message too long');
					if (data.type === 'private' && data.to === data.from) throw new Error('Cannot send message to yourself');

					console.log(`Message from ${data.from} to ${data.to}: ${data.message}`);

					if (data.type === 'private') {
						if (isBlocked(data.from, data.to)) throw new Error('You cannot send messages to this user');

						const receiverSocket = clients.get(data.to);
						if (receiverSocket)
							receiverSocket.send(JSON.stringify(data));
						db.prepare('INSERT INTO messages (sender_id, receiver_id, message, send_at) VALUES (?, ?, ?, ?)').run(data.from, data.to, data.message, data.send_at);
					} else if (data.type === 'party') {
						const sender = db.prepare('SELECT name FROM users WHERE id = ?').get(data.from);
						data.fromName = sender ? sender.name : 'Unknown';
						const partyPlayers = db.prepare('SELECT user_id FROM party_players WHERE party_id = ?').all(data.to);
						partyPlayers.forEach(player => {
							if (player.user_id !== data.from) {
								const playerSocket = clients.get(player.user_id);
								if (playerSocket)
									playerSocket.send(JSON.stringify(data));
							}
						});
					}
				} catch (err) {
					console.log('Error processing message:', err.message);
				}
			});

			connection.socket.on('close', (code, reason) => {
				console.log(`WS close for ${payload.name} (id=${payload.id}) code=${code} reason=${reason}`);
				const party = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND (status = ? OR status = ?)').get(payload.id, 'active', 'waiting');
				if (party) {
					db.prepare('UPDATE party_players SET status = ? WHERE user_id = ?').run('disconnected', payload.id);
					console.log(`User ${payload.name} set to disconnected in party ${party.party_id}`); // DEBUG
					sendSysMessage(party.party_id, `${payload.name} a été déconnecté.`);
				}
				if (party && party.status === 'active') handlePause(party.party_id, payload.id);
				console.log(`❌ Client ${payload.name} déconnecté`);
				clients.delete(payload.id);
			});

		} catch (err) {
			console.log('❌ WebSocket rejected:', err.message);
			// Close with a policy violation code to provide a clearer signal to the client
			try { connection.socket.close(1008, 'Unauthorized or invalid token'); } catch (_) {}
		}
	});
}

export default chat;
export { clients };
