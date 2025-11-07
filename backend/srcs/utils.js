import db from './db.js';

export const USER_CREATION_CONSTANTS = {
	MIN_NAME_LENGTH: 3,
	MAX_NAME_LENGTH: 20,
	MIN_PASSWORD_LENGTH: 12,
	MAX_PASSWORD_LENGTH: 20
}

/**
 * Check validity of usernames it sh
*/
export function checkName(name) {
	if (name.length < USER_CREATION_CONSTANTS.MIN_NAME_LENGTH) {
		return { valid: false, error: 'Name must be at least 3 characters long' };
	}
	if (name.length > USER_CREATION_CONSTANTS.MAX_NAME_LENGTH) {
		return { valid: false, error: 'Name must be at most 20 characters long' };
	}
	if (!/^[a-zA-Z0-9_./]+$/.test(name)) {
		return { valid: false, error: 'Name can only contain alphanumeric characters, underscores, dots, and slashes' };
	}
	return { valid: true };
}

export function checkPassword(password) {
	if (!/^[a-zA-Z0-9!@#$%^&*]+$/.test(password)) return { valid: false, error: 'Password can only contain alphanumeric characters and special characters (!@#$%^&*)' };
	if (password.length < USER_CREATION_CONSTANTS.MIN_PASSWORD_LENGTH) {
		return { valid: false, error: 'Password must be at least 8 characters long' };
	}
	if (password.length > USER_CREATION_CONSTANTS.MAX_PASSWORD_LENGTH) {
		return { valid: false, error: 'Password must be at most 100 characters long' };
	}
	if (!/^(?=.*[a-z])/.test(password)) {
		return { valid: false, error: 'Password must contain at least one lowercase letter' };
	}
	if (!/^(?=.*[A-Z])/.test(password)) {
		return { valid: false, error: 'Password must contain at least one uppercase letter' };
	}
	if (!/^(?=.*[0-9])/.test(password)) {
		return { valid: false, error: 'Password must contain at least one number' };
	}
	if (!/^(?=.*[!@#$%^&*])/.test(password)) {
		return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*)' };
	}
	return { valid: true };
}

export function isBlocked(userId1, userId2) {
	return !!db.prepare('SELECT 1 FROM blocked WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(userId1, userId2, userId2, userId1);
}
