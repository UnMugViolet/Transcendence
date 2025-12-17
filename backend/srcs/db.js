import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { USER_CREATION_CONSTANTS } from './utils.js';
import metrics from './metrics.js';

// Ensure the database directory exists
const dbFile = process.env.DB_FILE || 'default_name.sqlite';
const dbDir = process.env.DB_PATH || '/app/data/';
let db;

// Create data directory if it doesn't exist
try {
	fs.accessSync(dbDir, fs.constants.F_OK);
} catch {
	fs.mkdirSync(dbDir, { recursive: true });
}

// Create the database file if it doesn't exist
try {
	fs.accessSync(path.join(dbDir, dbFile), fs.constants.F_OK);
} catch {
	fs.writeFileSync(path.join(dbDir, dbFile), '');
}

const dbPath = path.join(dbDir, dbFile);

try {
	db = new Database(dbPath);
	console.log('Connected to database at:', dbPath);
} catch (err) {
	console.error('Could not connect to database', err);
	process.exit(1);
}

db.prepare(`CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name VARCHAR(${USER_CREATION_CONSTANTS.MAX_NAME_LENGTH}) NOT NULL UNIQUE COLLATE NOCASE,
	password VARCHAR(255) NOT NULL,
	profile_picture TEXT NOT NULL DEFAULT 'default.jpg',
	last_seen INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
    role_id INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (role_id) REFERENCES roles(id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS roles (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
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

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sender_id INTEGER NOT NULL,
	receiver_id INTEGER NOT NULL,
	message TEXT NOT NULL,
	send_at INTEGER NOT NULL,
	FOREIGN KEY (sender_id) REFERENCES users(id),
	FOREIGN KEY (receiver_id) REFERENCES users(id)
)`).run();

// Seed initial roles (only insert if they don't exist already)
const insertRole = db.prepare(`INSERT OR IGNORE INTO roles (name) VALUES (?)`);
insertRole.run('user');
insertRole.run('admin');
insertRole.run('demo');


// Wrap db methods to track query metrics
const originalPrepare = db.prepare.bind(db);
db.prepare = function(sql) {
	const stmt = originalPrepare(sql);
	const originalRun = stmt.run.bind(stmt);
	const originalGet = stmt.get.bind(stmt);
	const originalAll = stmt.all.bind(stmt);
	
	stmt.run = function(...args) {
		const start = Date.now();
		try {
			const result = originalRun(...args);
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('write', duration);
			return result;
		} catch (err) {
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('write_error', duration);
			throw err;
		}
	};
	
	stmt.get = function(...args) {
		const start = Date.now();
		try {
			const result = originalGet(...args);
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('read', duration);
			return result;
		} catch (err) {
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('read_error', duration);
			throw err;
		}
	};
	
	stmt.all = function(...args) {
		const start = Date.now();
		try {
			const result = originalAll(...args);
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('read', duration);
			return result;
		} catch (err) {
			const duration = (Date.now() - start) / 1000;
			metrics.recordQueryDuration('read_error', duration);
			throw err;
		}
	};
	
	
	return stmt;
};

export { dbPath };

export default db;
