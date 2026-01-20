import { i18n } from "./i18n.js";
import { ApiClient } from "./api.js";
import { AuthManager } from "../user/auth.js";

/**
 *  Inserts language options into the language dropdown and sets up event listeners for language selection.
 *  @param availableLangs - An array of available language codes (e.g., ['en', 'fr', 'de']).
 *  @returns A promise that resolves when the dropdown is populated and event listeners are set.
*/
export async function populateLanguageDropdown(availableLangs: string[]) {
	const langDropdown = document.getElementById('langDropdown');


	if (langDropdown && availableLangs && availableLangs.length > 0) {
		availableLangs.forEach((langCode: string) => {
			const btn: HTMLButtonElement = document.createElement('button');
			btn.setAttribute('id', `btn-${langCode}`);
			btn.className = 'flex items-center gap-2 px-3 py-2 hover:bg-rose-800 w-full text-left px-2';
			btn.innerHTML = `<img src="img/flags/${langCode}.png" alt="${langCode.toUpperCase()}" class="w-5 h-5 rounded-full border border-amber-100" /> ${langCode.toUpperCase()}`;
			langDropdown.appendChild(btn);
		});
	}

	availableLangs.forEach(lang => {
		document.getElementById(`btn-${lang}`)?.addEventListener('click', async () => {
			await i18n.loadLanguage(lang);
			i18n.updateDOM();
			localStorage.setItem("lang", lang);
			updateLanguageButton(lang);
			langDropdown?.classList.add('hidden');
			
			// Sync language preference with backend if user is authenticated
			if (AuthManager.isAuthenticated()) {
				await ApiClient.updateLanguage(lang);
			}
		},);
	});
}

function fetchCurrentLanguage(): string {
	const langButton : HTMLElement | null = document.getElementById('langButton');

	if (langButton) {
		const currentLang : string | null = langButton.getAttribute('data-lang');
		if (currentLang) {
			return currentLang;
		}
	}

	// Fallback to localStorage or default
	return localStorage.getItem('lang') || 'en';
}

export function updateLanguageButton(langCode: string) {
	const langButton: HTMLElement | null = document.getElementById('langButton');
	const currentFlag: HTMLImageElement | null = document.getElementById('currentFlag') as HTMLImageElement;
	const currentLangText: HTMLSpanElement | null | undefined = langButton?.querySelector('span');

	if (langButton && currentFlag && currentLangText) {
		const createdButton: HTMLButtonElement = document.createElement('button');
		// Update the button's data-lang attribute

		// Update the flag image
		currentFlag.src = `img/flags/${langCode}.png`;
		currentFlag.alt = langCode.toUpperCase();

		// Update the text
		currentLangText.textContent = langCode.toUpperCase();
	}
}

export function initLanguageButton() {
	const currentLang = fetchCurrentLanguage();
	updateLanguageButton(currentLang);
}
