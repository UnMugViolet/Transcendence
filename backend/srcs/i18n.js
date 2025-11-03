import fs from "fs";
import path from "path";

class I18n {
	constructor() {
		this.translations = {};
		this.defaultLang = "en";
		this.loadLanguages();
	}

	loadLanguages() {
		const langDir = path.join(process.cwd(), 'languages');
		if (!fs.existsSync(langDir)) {
			console.warn("⚠️ No language directory found at", langDir);
			return;
		}

		for (const file of fs.readdirSync(langDir)) {
			if (file.endsWith(".json")) {
				const langCode = file.replace(".json", "");
				const filePath = path.join(langDir, file);
				try {
					const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
					this.translations[langCode] = data;
					console.log(`✅ Loaded language: ${langCode} (${Object.keys(data).length} keys)`);
				} catch (err) {
					console.error(`❌ Error parsing ${file}:`, err);
				}
			}
		}
	}

	/**
	 * Récupère une traduction
	 * @param {string} key - Clé de traduction (ex: "notEnough")
	 * @param {string} lang - Langue désirée ("en", "fr", etc.)
	 * @returns {string}
	 */
	t(key, lang = this.defaultLang) {
		const dict = this.translations[lang] || this.translations[this.defaultLang] || {};
		return dict[key] || key;
	}
}

export const i18n = new I18n();
