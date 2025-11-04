

export function populateLanguageDropdown(availableLangs: string[]) {
	const langDropdown = document.getElementById('langDropdown');

	console.log("Populating language dropdown with languages:", availableLangs);

	if (langDropdown && availableLangs && availableLangs.length > 0) {
		availableLangs.forEach((langCode: string) => {
			const btn = document.createElement('button');
			btn.setAttribute('data-lang', langCode);
			btn.className = 'flex items-center gap-2 px-3 py-2 hover:bg-rose-800 w-full text-left';
			btn.innerHTML = `<img src="img/flags/${langCode}.png" alt="${langCode.toUpperCase()}" class="w-5 h-5 rounded-full border border-amber-100" /> ${langCode.toUpperCase()}`;
			langDropdown.appendChild(btn);
		});
	}
}

function fetchCurrentLanguage(): string {
	const langButton = document.getElementById('langButton');

	if (langButton) {
		const currentLang = langButton.getAttribute('data-lang');
		if (currentLang) {
			return currentLang;
		}
	}
	
	// Fallback to localStorage or default
	return localStorage.getItem('lang') || 'en';
}

export function updateLanguageButton(langCode: string) {
	const langButton = document.getElementById('langButton');
	const currentFlag = document.getElementById('currentFlag') as HTMLImageElement;
	const currentLangText = langButton?.querySelector('span');

	if (langButton && currentFlag && currentLangText) {
		// Update the button's data-lang attribute
		langButton.setAttribute('data-lang', langCode);
		
		// Update the flag image
		currentFlag.src = `img/flags/${langCode}.png`;
		currentFlag.alt = langCode.toUpperCase();
		
		// Update the text
		currentLangText.textContent = langCode.toUpperCase();
		
		// console.log(`Language button updated to: ${langCode}`);
	}
}

export function initLanguageButton() {
	const currentLang = fetchCurrentLanguage();
	updateLanguageButton(currentLang);
}
