import db from './db.js';
import { i18n } from './services/i18n-service.js';

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
 * @param {string} lang - The language for error messages (optional, defaults to 'en').
 * @returns {{ valid: boolean, error?: string }} An object indicating whether the
 * username is valid and, if not, a description of the validation error.
*/
export function checkName(name, lang = 'en') {
	if (name.length < USER_CREATION_CONSTANTS.MIN_NAME_LENGTH) {
		return { valid: false, error: i18n.t('nameMinLength', lang) };
	}
	if (name.length > USER_CREATION_CONSTANTS.MAX_NAME_LENGTH) {
		return { valid: false, error: i18n.t('nameMaxLength', lang) };
	}
	if (!/^[a-zA-Z0-9_./]+$/.test(name)) {
		return { valid: false, error: i18n.t('nameInvalidChars', lang) };
	}
	return { valid: true };
}

export function checkPassword(password, lang = 'en') {
	if (!/^[a-zA-Z0-9!@#$%^&*]+$/.test(password)) return { valid: false, error: i18n.t('passwordInvalidChars', lang) };
	if (password.length < USER_CREATION_CONSTANTS.MIN_PASSWORD_LENGTH) {
		return { valid: false, error: i18n.t('passwordMinLength', lang) };
	}
	if (password.length > USER_CREATION_CONSTANTS.MAX_PASSWORD_LENGTH) {
		return { valid: false, error: i18n.t('passwordMaxLength', lang) };
	}
	if (!/^(?=.*[a-z])/.test(password)) {
		return { valid: false, error: i18n.t('passwordNeedsLowercase', lang) };
	}
	if (!/^(?=.*[A-Z])/.test(password)) {
		return { valid: false, error: i18n.t('passwordNeedsUppercase', lang) };
	}
	if (!/^(?=.*[0-9])/.test(password)) {
		return { valid: false, error: i18n.t('passwordNeedsNumber', lang) };
	}
	if (!/^(?=.*[!@#$%^&*])/.test(password)) {
		return { valid: false, error: i18n.t('passwordNeedsSpecial', lang) };
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

