import { z } from 'zod';
import { SecurityMonitor } from './utils/security-monitor';

interface Dictionary {
    [key: string]: any;
}

const ALLOWED_LOCALES = new Set([
    "en", "de", "es", "fr", "it", "pt", "nl", "fi", "sv", "no",
    "el", "vi", "ms", "id", "tl", "hi", "th", "lo", "mn", "ar",
    "ko", "zh", "zh-Hans", "zh-Hant", "pt-BR", "es-MX", "fr-CA", "ja"
]);

const LocaleDictionarySchema = z.record(z.string(), z.union([z.string(), z.record(z.string(), z.any())]));

const STORAGE_KEY = "dtr-language";
const LOCALES_DIR = "locales";
let DICT: Dictionary = {};
let CURRENT_LANG = "en";

    // --- NANO TOML PARSER ---
    function parseTOML(text: string): Dictionary {
        const result: Dictionary = Object.create(null);
        let currentTable = result;
        text.split(/\r?\n/).forEach(line => {
            line = line.trim();
            if (!line || line.startsWith("#")) return;

            // [table.subtable]
            const tableMatch = line.match(/^\[(.*)\]$/);
            if (tableMatch) {
                const parts = tableMatch[1].split(".");
                let cursor = result;
                for (const part of parts) {
                    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
                        throw new Error(`[SECURITY] Invalid table name in TOML: ${part}`);
                    }
                    if (!cursor[part] || typeof cursor[part] !== "object") {
                        cursor[part] = Object.create(null);
                    }
                    cursor = cursor[part];
                }
                currentTable = cursor;
                return;
            }
            const kvMatch = line.match(/^([\w.-]+)\s*=\s*["'](.*)["']$/);
            if (kvMatch) {
                const key = kvMatch[1].trim();
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
                let val = kvMatch[2].trim();
                val = val.replace(/\\n/g, "\n")
                         .replace(/\\"/g, '"')
                         .replace(/\\'/g, "'")
                         .replace(/\\\\/g, "\\");
                currentTable[key] = val;
            }
        });
        return result;
    }

    async function loadLocale(lang: string): Promise<boolean> {
        const cleanLang = String(lang || "").replace(/[^a-zA-Z0-9_-]/g, "");
        if (!ALLOWED_LOCALES.has(cleanLang)) {
            SecurityMonitor.reportIncident({ type: 'UNAUTHORIZED_LOCALE_REQUEST', locale: lang });
            return false;
        }

        let fileLang = cleanLang;
        if (cleanLang === "zh") fileLang = "zh-Hans";

        const baseLang = cleanLang.split('-')[0];
        const langsToTry = [fileLang];
        if (baseLang !== fileLang && ALLOWED_LOCALES.has(baseLang)) langsToTry.push(baseLang);

        const extensions = ["toml", "json"];
        
        for (const l of langsToTry) {
            for (const ext of extensions) {
                try {
                    const response = await fetch(`${LOCALES_DIR}/${encodeURIComponent(l)}.${ext}?v=4.3.1`);
                    if (!response.ok) continue;

                    let rawDict: any;
                    if (ext === "toml") {
                        const text = await response.text();
                        rawDict = parseTOML(text);
                    } else {
                        rawDict = await response.json();
                    }
                    
                    const validated = LocaleDictionarySchema.parse(rawDict);
                    DICT[cleanLang] = validated;
                    
                    console.log(`[i18n] Loaded ${l}.${ext} for '${cleanLang}'`);
                    return true;
                } catch (err) { /* silent fail */ }
            }
        }
        return false;
    }

    const FALLBACK_LANGS: { [key: string]: string } = {
        "zh-Hant": "zh-Hans",
        "pt-BR": "pt",
        "es-MX": "es",
        "fr-CA": "fr"
    };

    function t(keyPath: string, params: Record<string, string> = {}): string | null {
        const chain = [CURRENT_LANG];
        if (FALLBACK_LANGS[CURRENT_LANG]) chain.push(FALLBACK_LANGS[CURRENT_LANG]);
        
        // Add "base" language if regional (e.g., de-CH -> de)
        const base = CURRENT_LANG.split('-')[0];
        if (base !== CURRENT_LANG && !chain.includes(base)) chain.push(base);
        
        // Final fallback: en
        if (!chain.includes("en")) chain.push("en");

        function find(d: Dictionary, kp: string): any {
            if (!d || typeof d !== 'object') return null;
            // 1. Dotted
            let val = kp.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : null), d);
            // 2. Clear flat key search (if no dots)
            if (!val && !kp.includes('.')) {
                if (d[kp] !== undefined && typeof d[kp] !== 'object') return d[kp];
                for (const table in d) {
                    if (d[table] && typeof d[table] === 'object' && d[table][kp] !== undefined) {
                        return d[table][kp];
                    }
                }
            }
            if (!val) val = d[kp] || null;
            return val;
        }

        let val: any = null;
        for (const lang of chain) {
            val = find(DICT[lang], keyPath);
            if (val) break;
        }

        if (!val) val = keyPath;

        // Enhanced Interpolation: Replace {key} with params[key]
        if (typeof val === "string" && params && typeof params === "object") {
            Object.keys(params).forEach(key => {
                val = (val as string).replaceAll(`{${key}}`, String(params[key]));
            });
        }

        return val;
    }

    // --- THE CORE API ---
    export const DTRI18N = {
        t: t,
        getLanguage: () => CURRENT_LANG,
        getDict: () => DICT[CURRENT_LANG],
        
        applyTranslations: function() {
            function getArgs(el: Element): Record<string, string> {
                const raw = el.getAttribute("data-i18n-args");
                if (!raw) return {};
                try { return JSON.parse(raw); } catch(e) { return {}; }
            }

            // Body text
            document.querySelectorAll("[data-i18n]").forEach(el => {
                const key = el.getAttribute("data-i18n");
                if (!key) return;
                const translation = t(key, getArgs(el));
                if (translation !== key) {
                    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
                        // Keep content as is
                    } else {
                        const icon = el.querySelector(".material-symbols-outlined");
                        if (icon) {
                            // Preserving icon span, only update the text node
                            let found = false;
                            for (let i = 0; i < el.childNodes.length; i++) {
                                const node = el.childNodes[i];
                                if (node.nodeType === 3 && node.textContent && node.textContent.trim().length > 0) {
                                    node.textContent = (node.textContent.startsWith(" ") ? " " : "") + translation;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found && translation) el.appendChild(document.createTextNode(" " + translation));
                        } else {
                            if (translation) el.textContent = translation;
                        }
                    }
                }
            });

            // Attributes
            document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
                const key = el.getAttribute("data-i18n-placeholder");
                if (!key) return;
                const translation = t(key, getArgs(el));
                if (translation !== key && translation) (el as HTMLInputElement).placeholder = translation;
            });
            document.querySelectorAll("[data-i18n-title]").forEach(el => {
                const key = el.getAttribute("data-i18n-title");
                if (!key) return;
                const translation = t(key, getArgs(el));
                if (translation !== key && translation) (el as HTMLElement).title = translation;
            });

            console.log(`[i18n] Application Complete.`);
        },

        runMapper: function() {
            const elements = [
                ...document.querySelectorAll("[data-i18n]"),
                ...document.querySelectorAll("[data-i18n-placeholder]"),
                ...document.querySelectorAll("[data-i18n-title]")
            ];
            const currentDict = DICT[CURRENT_LANG] || DICT["en"] || {};

            elements.forEach(el => {
                const attrs = ["data-i18n", "data-i18n-placeholder", "data-i18n-title"];
                attrs.forEach(attr => {
                    if (!el.hasAttribute(attr)) return;
                    const currentKey = el.getAttribute(attr);
                    if (!currentKey) return;
                    
                    // Skip if already mapped (has dot)
                    if (currentKey.includes('.')) return;

                    // Deep Search: Find which table owns this key
                    let foundPath: string | null = null;
                    for (const table in currentDict) {
                        if (typeof currentDict[table] === 'object' && currentDict[table][currentKey]) {
                            foundPath = `${table}.${currentKey}`;
                            break;
                        }
                    }

                    if (foundPath) {
                        el.setAttribute(attr, foundPath);
                    } else {
                        // console.warn(`[i18n] Key "${currentKey}" not found in any TOML table.`);
                    }
                });
            });
            this.applyTranslations();
        },

        renderLanguageSelector: function() {
            const selector = document.getElementById("languageSelect") as HTMLSelectElement;
            if (!selector) return;

            // Complete list of supported languages
            const langs = [
                { code: "en", label: "English" },
                { code: "de", label: "Deutsch" },
                { code: "es", label: "Español" },
                { code: "fr", label: "Français" },
                { code: "it", label: "Italiano" },
                { code: "pt", label: "Português" },
                { code: "nl", label: "Nederlands" },
                { code: "fi", label: "Suomi" },
                { code: "sv", label: "Svenska" },
                { code: "no", label: "Norsk" },
                { code: "el", label: "Ελληνικά" },
                { code: "vi", label: "Tiếng Việt" },
                { code: "ms", label: "Bahasa Melayu" },
                { code: "id", label: "Bahasa Indonesia" },
                { code: "tl", label: "Tagalog" },
                { code: "hi", label: "हिन्दी" },
                { code: "th", label: "ไทย" },
                { code: "ar", label: "العربية" },
                { code: "ko", label: "한국어" },
                { code: "zh-Hans", label: "简体中文" },
                { code: "zh-Hant", label: "繁體中文" },
                { code: "ja", label: "日本語" }
            ];

            selector.innerHTML = "";
            langs.forEach(l => {
                const opt = document.createElement("option");
                opt.value = l.code;
                opt.textContent = l.label;
                if (l.code === CURRENT_LANG) opt.selected = true;
                selector.appendChild(opt);
            });

            selector.onchange = (e) => this.setLanguage((e.target as HTMLSelectElement).value);
            console.log("[i18n] Language Selector Rendered.");
        },

        bootstrap: async function() {
            const savedLang = localStorage.getItem(STORAGE_KEY);
            // Default to 'en' or browser lang if supported
            CURRENT_LANG = savedLang || "en";
            
            await loadLocale("en");
            if (CURRENT_LANG !== "en") {
                const success = await loadLocale(CURRENT_LANG);
                if (!success) CURRENT_LANG = "en";
            }
            
            document.documentElement.lang = CURRENT_LANG;
            this.renderLanguageSelector();
            this.runMapper();
            document.dispatchEvent(new CustomEvent("dtr:languageChanged", { detail: { lang: CURRENT_LANG } }));
        },
    
        setLanguage: async function(lang: string) {
            const success = await loadLocale(lang);
            if (success) {
                CURRENT_LANG = lang;
                document.documentElement.lang = lang;
                localStorage.setItem(STORAGE_KEY, lang);
                this.runMapper();
                document.dispatchEvent(new CustomEvent("dtr:languageChanged", { detail: { lang: lang } }));
            }
        }
    };
