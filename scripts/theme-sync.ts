/**
 * Shared theme sync helper (frontend-only).
 * Uses localStorage as source of truth and syncs across tabs via storage/BroadcastChannel.
 */

declare global {
    interface Window {
        __dtrThemeSyncBound?: boolean;
    }
}

const DEFAULT_THEME = "f1";
const ALLOWED_THEMES = new Set(["f1", "f1-light", "cadillac", "apx", "mclaren", "ferrari", "kiki", "ztmy"]);
const THEME_KEY = "user-theme";
const EVENT_KEY = "user-theme-updated-at";
const BC_NAME = "dtr-theme-sync";
const bc = (typeof BroadcastChannel !== "undefined") ? new BroadcastChannel(BC_NAME) : null;

export interface SetThemeOptions {
    broadcast?: boolean;
    rerender?: boolean;
    [key: string]: unknown;
}

function sanitizeTheme(themeName?: string | null): string {
    const raw = String(themeName || "").trim().toLowerCase();
    return ALLOWED_THEMES.has(raw) ? raw : DEFAULT_THEME;
}

function applyDomTheme(themeName?: string | null): string {
    const safeTheme = sanitizeTheme(themeName);
    document.documentElement.setAttribute("data-theme", safeTheme);
    try {
        localStorage.setItem(THEME_KEY, safeTheme);
    } catch (_) {}
    return safeTheme;
}

function notifyThemeChanged(themeName: string): void {
    try {
        localStorage.setItem(EVENT_KEY, String(Date.now()));
    } catch (_) {}
    try {
        if (bc) bc.postMessage({ theme: themeName });
    } catch (_) {}
}

function getLocalTheme(): string {
    try {
        return sanitizeTheme(localStorage.getItem(THEME_KEY));
    } catch (_) {
        return DEFAULT_THEME;
    }
}

function emitChange(themeName: string): void {
    try {
        document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: themeName } }));
    } catch (_) {}
}

async function setTheme(themeName: string, options: SetThemeOptions = {}): Promise<string> {
    const safeTheme = applyDomTheme(themeName);
    if (options.broadcast !== false) {
        notifyThemeChanged(safeTheme);
    }
    emitChange(safeTheme);
    return safeTheme;
}

function bindCrossTabSync(): void {
    if (typeof window === "undefined" || window.__dtrThemeSyncBound) return;
    window.__dtrThemeSyncBound = true;

    window.addEventListener("storage", (event: StorageEvent) => {
        if (event.key !== THEME_KEY && event.key !== EVENT_KEY) return;
        const current = document.documentElement.getAttribute("data-theme");
        const next = getLocalTheme();
        if (next !== current) {
            applyDomTheme(next);
            emitChange(next);
        }
    });

    if (bc) {
        bc.addEventListener("message", (event: MessageEvent) => {
            const incoming = sanitizeTheme(event && event.data && event.data.theme);
            const current = document.documentElement.getAttribute("data-theme");
            if (incoming !== current) {
                applyDomTheme(incoming);
                emitChange(incoming);
            }
        });
    }
}

bindCrossTabSync();

export const ThemeSync = {
    DEFAULT_THEME,
    ALLOWED_THEMES,
    sanitizeTheme,
    applyDomTheme,
    getLocalTheme,
    setTheme
};
