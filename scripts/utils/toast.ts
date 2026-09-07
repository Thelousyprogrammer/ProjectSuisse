/**
 * Toast Notification Utility
 * Lightweight, non-intrusive floating toasts with smooth transitions and auto-dismissal.
 */

export function showToast(
    message: string,
    type: 'warning' | 'info' | 'error' | 'success' = 'warning',
    durationMs: number = 4000
): void {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('dtrToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dtrToastContainer';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            max-width: 92vw;
            width: 380px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `dtr-toast dtr-toast-${type}`;
    const borderColor = type === 'warning' 
        ? 'var(--color-warning, #f59e0b)' 
        : type === 'error' 
            ? 'var(--accent, #e10600)' 
            : 'var(--color-good, #10b981)';

    toast.style.cssText = `
        background: rgba(16, 20, 29, 0.95);
        border: 1px solid ${borderColor};
        color: var(--text, #ffffff);
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: var(--font-body, system-ui, sans-serif);
    `;

    const icon = document.createElement('span');
    icon.style.fontSize = '18px';
    icon.style.flexShrink = '0';
    icon.textContent = type === 'warning' ? '⚠️' : type === 'error' ? '🚫' : 'ℹ️';

    const text = document.createElement('span');
    text.style.flex = '1';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, durationMs);
}
