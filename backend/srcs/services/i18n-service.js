import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { userQueries } from './database-queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * I18n service for backend translation support
 */
class I18nService {
	constructor() {
		this.translations = {};
		this.defaultLang = 'en';
		this.loadAllLanguages();
	}

	loadAllLanguages() {
		const languagesDir = path.join(__dirname, '../../languages');
		
		try {
			const files = fs.readdirSync(languagesDir);
			
			files.forEach(file => {
				if (file.endsWith('.json')) {
					const lang = file.replace('.json', '');
					const filePath = path.join(languagesDir, file);
					const content = fs.readFileSync(filePath, 'utf-8');
					this.translations[lang] = JSON.parse(content);
					console.log(`Loaded language: ${lang}`);
				}
			});
		} catch (error) {
			console.error('Error loading language files:', error);
		}
	}

	/**
	 * Get translation for a key in a specific language
	 * @param {string} key - Translation key
	 * @param {string} lang - Language code (e.g., 'en', 'fr', 'ch')
	 * @param {object} params - Parameters to interpolate into the translation
	 * @returns {string} Translated text
	 */
	t(key, lang = 'en', params = {}) {
		const langTranslations = this.translations[lang] || this.translations[this.defaultLang];
		let text = langTranslations?.[key] || key;

		// Simple parameter interpolation: replace {{param}} with values
		Object.keys(params).forEach(param => {
			text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
		});

		return text;
	}

	/**
	 * Get translation for a key using a user's preferred language
	 * @param {string} key - Translation key
	 * @param {number} userId - User ID to fetch language preference
	 * @param {object} params - Parameters to interpolate
	 * @returns {string} Translated text
	 */
	tUser(key, userId, params = {}) {
		const lang = userQueries.getLanguageById(userId) || this.defaultLang;
		return this.t(key, lang, params);
	}

	/**
	 * Get translations for multiple users (for party messages)
	 * @param {string} key - Translation key
	 * @param {number[]} userIds - Array of user IDs
	 * @param {object} params - Parameters to interpolate
	 * @returns {Map<number, string>} Map of userId -> translated text
	 */
	tUsers(key, userIds, params = {}) {
		const translations = new Map();
		
		userIds.forEach(userId => {
			const lang = userQueries.getLanguageById(userId) || this.defaultLang;
			translations.set(userId, this.t(key, lang, params));
		});

		return translations;
	}

	/**
	 * Check if a language is supported
	 * @param {string} lang - Language code
	 * @returns {boolean}
	 */
	isSupported(lang) {
		return !!this.translations[lang];
	}

	/**
	 * Get all supported languages
	 * @returns {string[]}
	 */
	getSupportedLanguages() {
		return Object.keys(this.translations);
	}
}

// Export singleton instance
export const i18n = new I18nService();
