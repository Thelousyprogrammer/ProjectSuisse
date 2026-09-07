/**
 * DTR DATE & MATH UTILITIES (UTC Default)
 */

function toUtcDateKey(dateInput: Date | string | number | null | undefined): string {
    if (!dateInput) return "";
    if (typeof dateInput === "string") {
        const m = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function parseDateKeyUtc(dateKey: string | null | undefined): Date | null {
    if (!dateKey || typeof dateKey !== "string") return null;
    const parts = dateKey.split("-");
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(Date.UTC(y, m, d, 0, 0, 0));
    return isNaN(date.getTime()) ? null : date;
}

function nowUtcStartOfDay(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

function addDaysUtc(date: Date | string | number, days: number): Date {
    const d = typeof date === "string" ? (parseDateKeyUtc(date) || new Date(date)) : new Date(date);
    const result = new Date(d);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function isWorkdayUtc(date: Date): boolean {
    const day = date.getUTCDay();
    return day !== 0; // Mon-Sat
}

function getUtcWeekday(date: Date): number {
    return date.getUTCDay();
}

function formatUtcDateLabel(input: any, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
    const dateKey = toUtcDateKey(input);
    const parsed = parseDateKeyUtc(dateKey);
    if (!parsed) return "";
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(parsed);
}

function getWeekNumber(d: Date | string): number {
    const dateObj = typeof d === "string" ? parseDateKeyUtc(d) : d;
    if (!dateObj) return 1;
    const startStr: string = ((window as any).OJT_START) || (typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : "2024-01-01");
    const start = parseDateKeyUtc(startStr);
    if (!start) return 1;
    const diff = dateObj.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.max(1, Math.floor(diff / (oneDay * 7)) + 1);
}

function getWeekDateRange(weekNum: number): { start: Date | null; end: Date | null } {
    const startStr: string = ((window as any).OJT_START) || (typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : "2024-01-01");
    const start = parseDateKeyUtc(startStr);
    if (!start) return { start: null, end: null };
    const wStart = addDaysUtc(start, (weekNum - 1) * 7);
    const wEnd = addDaysUtc(wStart, 6);
    return { start: wStart, end: wEnd };
}

function withAlpha(hex: string | null | undefined, alpha: number): string | null | undefined {
    if (!hex || typeof hex !== 'string') return hex;
    if (hex.startsWith('rgba')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function boostColor(hex: string | null | undefined, amount: number): string | null | undefined {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + (255 * amount));
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + (255 * amount));
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + (255 * amount));
    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Aliases for backward compatibility
const toGmt8DateKey = toUtcDateKey;
const parseDateKeyGmt8 = parseDateKeyUtc;
const addDaysGmt8 = addDaysUtc;
const isWorkdayGmt8 = isWorkdayUtc;
const getGmt8Weekday = getUtcWeekday;
const formatGmt8DateLabel = formatUtcDateLabel;
const nowGmt8StartOfDay = nowUtcStartOfDay;

export {
    toUtcDateKey,
    parseDateKeyUtc,
    nowUtcStartOfDay,
    addDaysUtc,
    isWorkdayUtc,
    getUtcWeekday,
    formatUtcDateLabel,
    toGmt8DateKey,
    parseDateKeyGmt8,
    addDaysGmt8,
    isWorkdayGmt8,
    getGmt8Weekday,
    formatGmt8DateLabel,
    nowGmt8StartOfDay,
    getWeekNumber,
    getWeekDateRange,
    withAlpha,
    boostColor
};

