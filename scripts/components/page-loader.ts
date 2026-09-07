/**
 * PAGE LOADER & THEME SWITCH TRANSITION MANAGER
 */

import { DTRI18N } from '../dtr-i18n';

declare global {
    interface Window {
        PageLoader?: typeof PageLoader;
    }
}

export const PageLoader = {
    _timer: null as ReturnType<typeof setTimeout> | null,
    _visibleSince: 0,
    _minimumVisibleMs: 0,
    _scrollHandler: null as ((e: Event) => void) | null,

    get element(): HTMLElement | null {
        return document.getElementById('pageLoader');
    },

    getLogoForTheme(themeName: string): string {
        const map: Record<string, string> = {
            'f1': 'favicons/F1Favicon.svg',
            'f1-light': 'favicons/F1Favicon.svg',
            'cadillac': 'favicons/CaddyFavicon.svg',
            'apx': 'favicons/APXFavicon.svg',
            'mclaren': 'favicons/McLFavicon.svg',
            'kiki': 'favicons/KikiFavicon.svg',
            'ferrari': 'favicons/FerrariFavicon.svg',
            'ztmy': 'favicons/ZTMYFavicon.svg'
        };
        return map[themeName] || map['f1'];
    },

    setupScrollLock(): void {
        if (this._scrollHandler) return;
        this._scrollHandler = (e: Event) => {
            const loader = this.element;
            if (loader && !loader.classList.contains('page-loader-hidden')) {
                if (e.type === 'keydown') {
                    const keyEvent = e as KeyboardEvent;
                    const keys = ['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'End', 'Home'];
                    if (keys.includes(keyEvent.code)) {
                        e.preventDefault();
                    }
                } else {
                    e.preventDefault();
                }
            }
        };
        window.addEventListener('wheel', this._scrollHandler, { passive: false });
        window.addEventListener('touchmove', this._scrollHandler, { passive: false });
        window.addEventListener('keydown', this._scrollHandler, { passive: false });
    },

    init(themeName: string | null = null, autoDismissMs = 0): void {
        this.setupScrollLock();
        const activeTheme = themeName || localStorage.getItem('user-theme') || 'f1';
        this.show('loader.loading_dtr', activeTheme, autoDismissMs);
    },

    show(messageKey = 'loader.loading_dtr', themeName: string | null = null, minVisibleMs = 0, messageArgs: Record<string, unknown> | null = null): void {
        this.setupScrollLock();
        const loader = this.element;
        if (!loader) return;

        // Update text
        const textEl = loader.querySelector('.page-loader-text');
        if (textEl) {
            textEl.setAttribute('data-i18n', messageKey);
            if (messageArgs) {
                textEl.setAttribute('data-i18n-args', JSON.stringify(messageArgs));
            } else {
                textEl.removeAttribute('data-i18n-args');
            }
            if (DTRI18N && typeof DTRI18N.t === 'function') {
                const translated = DTRI18N.t(messageKey, messageArgs as any);
                if (translated && translated !== messageKey) {
                    textEl.textContent = translated.toUpperCase();
                } else {
                    const isAlreadyLocalized = textEl.textContent ? textEl.textContent.trim().length > 0 && textEl.textContent !== 'LOADING DTR...' : false;
                    if (!isAlreadyLocalized || messageKey === 'loader.verifying_theme') {
                        const fallbackText = messageKey === 'loader.syncing_telemetry' ? 'SYNCING TELEMETRY...' : 
                                             messageKey === 'loader.verifying_theme' ? `VERIFYING ${themeName}...` : 
                                             'LOADING DTR...';
                        textEl.textContent = fallbackText;
                    }
                }
            } else {
                const isAlreadyLocalized = textEl.textContent ? textEl.textContent.trim().length > 0 && textEl.textContent !== 'LOADING DTR...' : false;
                if (!isAlreadyLocalized || messageKey === 'loader.verifying_theme') {
                    const fallbackText = messageKey === 'loader.syncing_telemetry' ? 'SYNCING TELEMETRY...' : 
                                         messageKey === 'loader.verifying_theme' ? `VERIFYING ${themeName}...` : 
                                         'LOADING DTR...';
                    textEl.textContent = fallbackText;
                }
            }
        }

        const activeTheme = themeName || localStorage.getItem('user-theme') || 'f1';

        // Update logo based on theme
        const logoImg = loader.querySelector('.page-loader-logo') as HTMLImageElement | null;
        if (logoImg) {
            logoImg.src = this.getLogoForTheme(activeTheme);
        }

        // Handle light mode background styling
        if (activeTheme === 'f1-light') {
            loader.classList.add('page-loader-light');
        } else {
            loader.classList.remove('page-loader-light');
        }

        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }

        this._minimumVisibleMs = minVisibleMs;
        this._visibleSince = Date.now();

        // Lock scroll & interaction
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Show element
        loader.classList.remove('page-loader-hidden');
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        loader.style.visibility = 'visible';

        if (minVisibleMs > 0) {
            this._timer = setTimeout(() => {
                this.hide(true);
            }, minVisibleMs);
        }
    },

    hide(force = false): void {
        const loader = this.element;
        if (!loader) return;

        const elapsedMs = Date.now() - this._visibleSince;
        if (!force && this._minimumVisibleMs > 0 && elapsedMs < this._minimumVisibleMs) {
            const remainingMs = this._minimumVisibleMs - elapsedMs;
            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(() => {
                this.hide(true);
            }, remainingMs);
            return;
        }

        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }

        loader.classList.add('page-loader-hidden');
        
        // Restore scroll & interaction
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';

        // Wait for CSS transition to complete, then set display: none
        setTimeout(() => {
            if (loader.classList.contains('page-loader-hidden')) {
                loader.style.display = 'none';
            }
        }, 800);
    }
};

if (typeof window !== 'undefined') {
    window.PageLoader = PageLoader;
}
