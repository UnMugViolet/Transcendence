type Translations = Record<string, string>;

class I18n {
  private translations: Record<string, Translations> = {};
  private currentLang: string = "en";
  private missingKeys: Set<string> = new Set();

  constructor() {
    (window as any).i18n = this;
  }

  async init(currentLang: string = 'en') {
    this.currentLang = currentLang || 'en';

    await this.loadLanguage(this.currentLang);
    // ensure DOM is updated after language is loaded
    this.updateDOM();
    // also update DOM when page loads (in case init was called before DOM was ready)
    if (document.readyState === "loading") {
      window.addEventListener("load", () => this.updateDOM());
    }
  }

  async loadLanguage(lang: string) {
    const candidates = [`/languages/${lang}.json`];

    let json: any = null;
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          json = await res.json();
          this.translations[lang] = json;
          this.currentLang = lang;
          console.log(
            `i18n: loaded ${path} with ${Object.keys(json).length} keys`
          );
          this.updateDOM();
          return;
        } else {
          console.warn(`i18n: ${path} -> ${res.status}`);
        }
      } catch (e) {
        console.warn(`i18n: fetch error ${path}:`, e);
      }
    }

    console.warn("i18n: no language file found for", lang, "- falling back to keys");
    this.translations[lang] = {};
    this.currentLang = lang;
    this.updateDOM();
  }

  t(key: string): string {
    const dict = this.translations[this.currentLang] || {};
    const val = dict[key];
    if (val) return val;
    
    // Only log missing translations if we've actually tried to load the language
    const hasTriedToLoad = Object.keys(this.translations).length > 0;
    if (hasTriedToLoad) {
      const mk = `${this.currentLang}:${key}`;
      if (!this.missingKeys.has(mk)) {
        this.missingKeys.add(mk);
      }
    }
    return key;
  }

  getTranslations() {
    return this.translations;
  }

  updateDOM() {
    // textContent
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) (el as HTMLElement).textContent = this.t(key);
    });

    // placeholder
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) (el as HTMLInputElement).placeholder = this.t(key);
    });

    // title
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) (el as HTMLElement).title = this.t(key);
    });

    // value (for inputs/buttons)
    document.querySelectorAll("[data-i18n-value]").forEach((el) => {
      const key = el.getAttribute("data-i18n-value");
      if (key) (el as HTMLInputElement).value = this.t(key);
    });
  }
}

export const i18n = new I18n();
