import db from './db.js';

export const USER_CREATION_CONSTANTS = {
	MIN_NAME_LENGTH: 3,
	MAX_NAME_LENGTH: 20,
	MIN_PASSWORD_LENGTH: 8,
	MAX_PASSWORD_LENGTH: 20
}

/**
 * Validate a username by checking its length and allowed characters.
 *
 * A valid username must be between USER_CREATION_CONSTANTS.MIN_NAME_LENGTH and
 * USER_CREATION_CONSTANTS.MAX_NAME_LENGTH characters long, and may only contain
 * alphanumeric characters, underscores (_), dots (.), and slashes (/).
 *
 * @param {string} name - The username to validate.
 * @returns {{ valid: boolean, error?: string }} An object indicating whether the
 * username is valid and, if not, a description of the validation error.
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
		return { valid: false, error: 'Password must be at most 20 characters long' };
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
  const meBlocks = !!db.prepare(`
    SELECT 1 FROM blocked WHERE blocker_id = ? AND blocked_id = ?
  `).get(userId1, userId2);

  const userBlocksMe = !!db.prepare(`
    SELECT 1 FROM blocked WHERE blocker_id = ? AND blocked_id = ?
  `).get(userId2, userId1);

  return {
    blocked_by_me: meBlocks,
    blocked_by_user: userBlocksMe
  };
}

