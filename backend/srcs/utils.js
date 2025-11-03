import db from './db.js';

export function checkName(name) {
	if (name.length < 3) return { valid: false, error: 'Name must be at least 3 characters long' };
	if (name.length > 20) return { valid: false, error: 'Name must be at most 20 characters long' };
	if (!/^[a-zA-Z0-9_./]+$/.test(name)) return { valid: false, error: 'Name can only contain alphanumeric characters, underscores, dots, and slashes' };
	return { valid: true };
}

export function checkPassword(password) {
	if (!/^[a-zA-Z0-9!@#$%^&*]+$/.test(password)) return { valid: false, error: 'Password can only contain alphanumeric characters and special characters (!@#$%^&*)' };
	if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters long' };
	if (password.length > 100) return { valid: false, error: 'Password must be at most 100 characters long' };
	if (!/^(?=.*[a-z])/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter' };
	if (!/^(?=.*[A-Z])/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter' };
	if (!/^(?=.*[0-9])/.test(password)) return { valid: false, error: 'Password must contain at least one number' };
	if (!/^(?=.*[!@#$%^&*])/.test(password)) return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*)' };
	return { valid: true };
}

export function isBlocked(userId1, userId2) {
	return !!db.prepare('SELECT 1 FROM blocked WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(userId1, userId2, userId2, userId1);
}
