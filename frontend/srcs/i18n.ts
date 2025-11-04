type Translations = Record<string, string>;

class I18n {
  private translations: Record<string, Translations> = {};
  private currentLang: string = 'en';
  private missingKeys: Set<string> = new Set();

  constructor() {
    // expose for debugging from the console
    (window as any).i18n = this;
    // ensure DOM is (re-)translated after full load (in case init ran too early)
    window.addEventListener('load', () => this.updateDOM());
  }

  async init(defaultLang: string = 'en') {
    this.currentLang = defaultLang;
    await this.loadLanguage(defaultLang);
  }

  async loadLanguage(lang: string) {
    const candidates = [
      `/languages/${lang}.json`,
    ];

    let json: any = null;
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        console.debug('i18n: trying', path, '->', res.status);
        if (res.ok) {
          json = await res.json();
          this.translations[lang] = json;
          this.currentLang = lang;
          console.debug('i18n: loaded', path);
          console.debug('i18n: loaded keys:', Object.keys(json).slice(0, 200));
          this.updateDOM();
          return;
        }
      } catch (e) {
        console.debug('i18n: fetch error', path, e);
      }
    }

    console.warn('i18n: no language file found for', lang, '- falling back to keys');
    this.translations[lang] = {};
    this.currentLang = lang;
    this.updateDOM();
  }

  t(key: string): string {
    const dict = this.translations[this.currentLang] || {};
    const val = dict[key];
    if (val) return val;
    const mk = `${this.currentLang}:${key}`;
    if (!this.missingKeys.has(mk)) {
      console.debug('i18n: missing translation for', key, 'lang=', this.currentLang, 'available=', Object.keys(dict).slice(0,20));
      this.missingKeys.add(mk);
    }
    return key;
  }

  // helper for debugging
  getLoadedLanguages() {
    return Object.keys(this.translations);
  }

  // helper to get current language
  getCurrentLanguage() {
    return this.currentLang;
  }

  // helper to get raw translation for a key in the current language
  getTranslation(key: string) {
    return this.translations[this.currentLang]?.[key];
  }

  // debug helper: list all keys for a language
  listKeys(lang?: string) {
    const l = lang || this.currentLang;
    return Object.keys(this.translations[l] || {});
  }

  updateDOM() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) (el as HTMLElement).textContent = this.t(key);
    });

    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) (el as HTMLInputElement).placeholder = this.t(key);
    });

    // title
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) (el as HTMLElement).title = this.t(key);
    });

    // value (for inputs/buttons)
    document.querySelectorAll('[data-i18n-value]').forEach((el) => {
      const key = el.getAttribute('data-i18n-value');
      if (key) (el as HTMLInputElement).value = this.t(key);
    });
  }
}

export const i18n = new I18n();
