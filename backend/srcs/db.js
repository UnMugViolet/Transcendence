import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Ensure the database directory exists
const dbPath = process.env.DB_PATH || './data/database.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
	fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.prepare(`CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE COLLATE NOCASE,
	pass TEXT NOT NULL,
	profile_picture TEXT NOT NULL DEFAULT 'default.jpg',
	last_seen INTEGER NOT NULL,
	created_at INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS refresh_tokens (
	user_id INTEGER NOT NULL,
	token TEXT NOT NULL,
	user_agent TEXT NOT NULL,
	timeout INTEGER NOT NULL,
	last_used_at INTEGER NOT NULL,
	FOREIGN KEY (user_id) REFERENCES users(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS match_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	p1_id INTEGER NOT NULL,
	p2_id INTEGER NOT NULL,
	p1_score INTEGER NOT NULL,
	p2_score INTEGER NOT NULL,
	winner_id INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (p1_id) REFERENCES users(id),
	FOREIGN KEY (p2_id) REFERENCES users(id),
	FOREIGN KEY (winner_id) REFERENCES users(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS friends (
	id1 INTEGER NOT NULL,
	id2 INTEGER NOT NULL,
	requester INTEGER NOT NULL,
	time INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	FOREIGN KEY (id1) REFERENCES users(id),
	FOREIGN KEY (id2) REFERENCES users(id),
	PRIMARY KEY (id1, id2),
	CHECK (id1 < id2)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS blocked (
	blocker_id INTEGER NOT NULL,
	blocked_id INTEGER NOT NULL,
	time INTEGER NOT NULL,
	FOREIGN KEY (blocker_id) REFERENCES users(id),
	FOREIGN KEY (blocked_id) REFERENCES users(id),
	PRIMARY KEY (blocker_id, blocked_id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS parties (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'waiting',
	created_at INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS party_players (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	party_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	team INTEGER NOT NULL,
	score INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'invited',
	FOREIGN KEY (party_id) REFERENCES parties(id),
	FOREIGN KEY (user_id) REFERENCES users(id),
	UNIQUE (party_id, user_id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS invites (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	invitee_id INTEGER NOT NULL,
	inviter_id INTEGER NOT NULL,
	party_id INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at INTEGER NOT NULL,
	FOREIGN KEY (inviter_id) REFERENCES users(id),
	FOREIGN KEY (invitee_id) REFERENCES users(id)
)`).run();
// A implemnter quand la table parties sera creee
// FOREIGN KEY (party_id) REFERENCES parties(id)

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sender_id INTEGER NOT NULL,
	receiver_id INTEGER NOT NULL,
	message TEXT NOT NULL,
	send_at INTEGER NOT NULL,
	FOREIGN KEY (sender_id) REFERENCES users(id),
	FOREIGN KEY (receiver_id) REFERENCES users(id)
)`).run();

export default db;
