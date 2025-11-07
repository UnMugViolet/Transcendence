import db from '../db.js';

/**
 * Database query service to centralize and simplify database operations
 */

// User queries
export const userQueries = {
	findById: (userId) => db.prepare('SELECT * FROM users WHERE id = ?').get(userId),
	getNameById: (userId) => db.prepare('SELECT name FROM users WHERE id = ?').get(userId)?.name
};

// Party queries
export const partyQueries = {
	findById: (partyId) => db.prepare('SELECT * FROM parties WHERE id = ?').get(partyId),
	findByTypeAndStatus: (type, status) => db.prepare('SELECT * FROM parties WHERE type = ? AND status = ? ORDER BY created_at ASC').all(type, status),
	findByStatus: (status) => db.prepare('SELECT * FROM parties WHERE status = ?').all(status),
	create: (type) => {
		const result = db.prepare('INSERT INTO parties (type, created_at) VALUES (?, ?)').run(type, Date.now());
		return db.prepare('SELECT * FROM parties WHERE id = ?').get(result.lastInsertRowid);
	},
	updateStatus: (partyId, status) => db.prepare('UPDATE parties SET status = ? WHERE id = ?').run(status, partyId),
	delete: (partyId) => db.prepare('DELETE FROM parties WHERE id = ?').run(partyId)
};

// Party player queries
export const partyPlayerQueries = {
	findByUserId: (userId) => db.prepare('SELECT * FROM party_players WHERE user_id = ?').get(userId),
	findByUserIdAndStatus: (userId, status) => db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status = ?').get(userId, status),
	findByUserIdNotStatus: (userId, status) => db.prepare('SELECT * FROM party_players WHERE user_id = ? AND status != ?').get(userId, status),
	findByUserIdMultipleStatuses: (userId, statuses) => {
		const placeholders = statuses.map(() => '?').join(' OR status = ');
		return db.prepare(`SELECT * FROM party_players WHERE user_id = ? AND (status = ${placeholders})`).all(userId, ...statuses);
	},
	findByPartyId: (partyId) => db.prepare('SELECT * FROM party_players WHERE party_id = ?').all(partyId),
	findByPartyIdAndStatus: (partyId, status) => db.prepare('SELECT * FROM party_players WHERE party_id = ? AND status = ?').all(partyId, status),
	findByPartyIdNotStatuses: (partyId, excludeStatuses) => {
		const placeholders = excludeStatuses.map(() => '?').join(' AND status != ');
		return db.prepare(`SELECT * FROM party_players WHERE party_id = ? AND status != ${placeholders}`).all(partyId, ...excludeStatuses);
	},
	findByPartyIdAndTeam: (partyId, team) => db.prepare('SELECT * FROM party_players WHERE party_id = ? AND team = ?').get(partyId, team),
	findByPartyIdAndUserId: (partyId, userId) => db.prepare('SELECT * FROM party_players WHERE party_id = ? AND user_id = ?').get(partyId, userId),
	countByPartyIdNotStatuses: (partyId, excludeStatuses) => {
		const placeholders = excludeStatuses.map(() => '?').join(' AND status != ');
		return db.prepare(`SELECT COUNT(*) as count FROM party_players WHERE party_id = ? AND status != ${placeholders}`).get(partyId, ...excludeStatuses).count;
	},
	presentPlayersInParty: (partyId, excludeStatuses) => {
		const placeholders = excludeStatuses.map(() => '?').join(' AND status != ');
		return db.prepare(`SELECT * FROM party_players WHERE party_id = ? AND status != ${placeholders} ORDER BY team ASC`).all(partyId, ...excludeStatuses);
	},
	findDisconnectedInTeams: (partyId, team1, team2) => db.prepare('SELECT team FROM party_players WHERE party_id = ? AND (status = ? OR status = ?) AND (team = ? OR team = ?)').get(partyId, 'disconnected', 'left', team1, team2),
	getUserIdByPartyAndTeam: (partyId, team) => db.prepare('SELECT user_id FROM party_players WHERE party_id = ? AND team = ?').get(partyId, team)?.user_id,
	getPlayersWithNames: (partyId) => db.prepare(`
		SELECT u.name, pp.team 
		FROM party_players pp
		JOIN users u ON pp.user_id = u.id
		WHERE pp.party_id = ?
	`).all(partyId),
	updateStatus: (userId, partyId, status) => db.prepare('UPDATE party_players SET status = ? WHERE user_id = ? AND party_id = ?').run(status, userId, partyId),
	updateTeamAndStatus: (team, status, partyId, userId) => db.prepare('UPDATE party_players SET team = ?, status = ? WHERE party_id = ? AND user_id = ?').run(team, status, partyId, userId),
	updateStatusByPartyAndCurrentStatus: (newStatus, partyId, currentStatus) => db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND status = ?').run(newStatus, partyId, currentStatus),
	updateStatusByPartyTeamAndCurrentStatus: (newStatus, partyId, team, currentStatus) => db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND team = ? AND status = ?').run(newStatus, partyId, team, currentStatus),
	updateStatusByPartyAndStatuses: (newStatus, partyId, status1, status2) => db.prepare('UPDATE party_players SET status = ? WHERE party_id = ? AND (status = ? OR status = ?)').run(newStatus, partyId, status1, status2),
	updateTeam: (team, partyId, userId) => db.prepare('UPDATE party_players SET team = ? WHERE party_id = ? AND user_id = ?').run(team, partyId, userId),
	upsert: (partyId, userId, team, status) => {
		const existing = db.prepare('SELECT * FROM party_players WHERE user_id = ? AND party_id = ?').get(userId, partyId);
		if (existing) {
			db.prepare('UPDATE party_players SET team = ?, status = ? WHERE user_id = ? AND party_id = ?').run(team, status, userId, partyId);
		} else {
			db.prepare('INSERT INTO party_players (party_id, user_id, team, status) VALUES (?, ?, ?, ?)').run(partyId, userId, team, status);
		}
	},
	delete: (partyId) => db.prepare('DELETE FROM party_players WHERE party_id = ?').run(partyId),
	deleteUser: (partyId, userId) => db.prepare('DELETE FROM party_players WHERE party_id = ? AND user_id = ?').run(partyId, userId)
};

// Invite queries
export const inviteQueries = {
	findPendingByInvitee: (userId) => db.prepare(`
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
	`).all(userId, 'pending'),
	findExisting: (inviteeId, inviterId, partyId, status) => db.prepare('SELECT * FROM invites WHERE invitee_id = ? AND inviter_id = ? AND party_id = ? AND status = ?').get(inviteeId, inviterId, partyId, status),
	findById: (inviteId, inviteeId) => db.prepare('SELECT * FROM invites WHERE id = ? AND invitee_id = ?').get(inviteId, inviteeId),
	create: (inviteeId, inviterId, partyId, status = 'pending') => db.prepare('INSERT INTO invites (invitee_id, inviter_id, party_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(inviteeId, inviterId, partyId, status, Date.now()),
	updateStatus: (inviteId, status) => db.prepare('UPDATE invites SET status = ? WHERE id = ?').run(status, inviteId),
	delete: (inviteId) => db.prepare('DELETE FROM invites WHERE id = ?').run(inviteId)
};

// Message queries
export const messageQueries = {
	findConversation: (userId, otherUserId, limit = 100) => db.prepare(`
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
		LIMIT ?
	`).all(userId, otherUserId, otherUserId, userId, limit),
	create: (senderId, receiverId, message, timestamp) => db.prepare('INSERT INTO messages (sender_id, receiver_id, message, send_at) VALUES (?, ?, ?, ?)').run(senderId, receiverId, message, timestamp)
};

// Block queries
export const blockQueries = {
	findBlockedByUser: (blockerId) => db.prepare(`
		SELECT
			u.id,
			u.name,
			u.profile_picture,
			b.time
		FROM blocked b
		JOIN users u ON b.blocked_id = u.id
		WHERE b.blocker_id = ?
	`).all(blockerId),
	create: (blockerId, blockedId) => db.prepare('INSERT INTO blocked (blocker_id, blocked_id, time) VALUES (?, ?, ?)').run(blockerId, blockedId, Date.now()),
	delete: (blockerId, blockedId) => db.prepare('DELETE FROM blocked WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId)
};

// Friend queries
export const friendQueries = {
	delete: (userId1, userId2) => db.prepare('DELETE FROM friends WHERE (id1 = ? AND id2 = ?)').run(Math.min(userId1, userId2), Math.max(userId1, userId2))
};
