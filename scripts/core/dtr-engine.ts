/**
 * DTR CORE MODULE
 * Configuration, Models, and Fundamental Utilities
 */

import { z } from 'zod';
import { SecurityMonitor } from '../utils/security-monitor';
import { ThemeSync } from '../theme-sync';
import { DTRI18N } from '../dtr-i18n';
import { Store, DailyRecordData } from '../store';

export const DEFAULT_OJT_START = "2026-01-01";
export const DEFAULT_SEMESTER_END = "2026-12-31";
export let OJT_START: Date = new Date(`${DEFAULT_OJT_START}T00:00:00Z`);
export const MASTER_TARGET_HOURS = 500;
export const DAILY_TARGET_HOURS = 8;
export const DEFAULT_TIMEZONE = "UTC";

export const DTR_COLORS = {
    neutral: "var(--color-neutral)",
    warning: "var(--color-warning)",
    good: "var(--color-good)",
    excellent: "var(--color-excellent)",
    aux: "var(--chart-aux)"
};

export let editingIndex: number | null = null;
export let currentSortMode = "date-asc";
export let currentReflectionViewMode: "all" | "week" | "month" = "week";
export let currentSummaryRecord: DailyRecordData | null = null;
export const REQUIRED_OJT_HOURS_MIN = 1;

export class DailyRecord {
    date: string;
    hours: number;
    delta: number;
    reflection: string;
    accomplishments: string[];
    tools: string[];
    images: string[];
    imageIds: string[];
    personalHours: number;
    sleepHours: number;
    recoveryHours: number;
    commuteTotal: number;
    commuteProductive: number;
    identityScore: number | null;

    constructor(
        date: string,
        hours: number,
        reflection: string,
        accomplishments: string[] = [],
        tools: string[] = [],
        images: string[] = [],
        l2Data: any = {},
        imageIds: string[] = []
    ) {
        this.date = date;
        this.hours = hours;
        this.delta = hours - DAILY_TARGET_HOURS;
        this.reflection = reflection;
        this.accomplishments = Array.isArray(accomplishments) ? accomplishments : [];
        this.tools = Array.isArray(tools) ? tools : [];
        
        this.imageIds = Array.isArray(imageIds) ? imageIds : [];
        this.images = (this.imageIds.length > 0) ? [] : (Array.isArray(images) ? images : []);

        this.personalHours = parseFloat(l2Data.personalHours) || 0;
        this.sleepHours = parseFloat(l2Data.sleepHours) || 0;
        this.recoveryHours = parseFloat(l2Data.recoveryHours) || 0;
        this.commuteTotal = parseFloat(l2Data.commuteTotal) || 0;
        this.commuteProductive = parseFloat(l2Data.commuteProductive) || 0;
        this.identityScore = parseInt(l2Data.identityScore, 10) || null;
    }
}

// --- UTILITIES ---

export const DAY_MS = 24 * 60 * 60 * 1000;
const warnedInvalidDateInputs = new Set<string>();
let _cachedTimeZoneIds: string[] | null = null;

export function pad2(n: number | string): string {
    return String(n).padStart(2, "0");
}

export function warnInvalidDateInput(input: any): void {
    const key = String(input);
    if (warnedInvalidDateInputs.has(key)) return;
    warnedInvalidDateInputs.add(key);
    console.warn("Skipping invalid date input:", input);
}

export const SettingsSchema = z.object({
    timeZone: z.string().optional(),
    ojtStartDate: z.string().optional(),
    semesterEndDate: z.string().optional(),
    requiredOjtHours: z.number().min(1).optional()
}).strict();

export interface OjtSettings {
    timeZone?: string;
    ojtStartDate?: string;
    semesterEndDate?: string;
    requiredOjtHours?: number;
    [key: string]: unknown;
}

export function getOjtSettings(): OjtSettings {
    try {
        const raw = localStorage.getItem("dtrSettings_v2");
        if (raw) return JSON.parse(raw);
        const old = localStorage.getItem("dtrSettings");
        if (old) {
            const parsed = JSON.parse(old);
            localStorage.setItem("dtrSettings_v2", JSON.stringify(parsed));
            return parsed;
        }
        return {};
    } catch (_) {
        localStorage.removeItem("dtrSettings_v2");
        return {};
    }
}

export function saveOjtSettings(next: Partial<OjtSettings>): void {
    SecurityMonitor.verifyDataIntegrity();
    try {
        const validated = SettingsSchema.parse(next || {});
        const merged = { ...getOjtSettings(), ...validated };
        localStorage.setItem("dtrSettings_v2", JSON.stringify(merged));
    } catch (e) {
        SecurityMonitor.reportIncident({ type: 'SETTINGS_VALIDATION_ERROR', error: e as object });
    }
}

export function toGmt8DateKey(input: any): string {
    if (!input) return "";
    if (typeof input === "string") {
        const m = input.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return "";
    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());
    return `${yyyy}-${mm}-${dd}`;
}

export function getCurrentOjtStartDate(): string {
    const settings = getOjtSettings();
    const key = toGmt8DateKey(settings.ojtStartDate || OJT_START || DEFAULT_OJT_START);
    return key || toGmt8DateKey(DEFAULT_OJT_START);
}

export function getKnownTimeZoneIds(): string[] {
    if (_cachedTimeZoneIds) return _cachedTimeZoneIds;
    const fromIntl = (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function")
        ? (Intl as any).supportedValuesOf("timeZone")
        : [];
    const supplemental = [
        "UTC",
        "Etc/GMT-12", "Etc/GMT-11", "Etc/GMT-10", "Etc/GMT-9", "Etc/GMT-8",
        "Etc/GMT-7", "Etc/GMT-6", "Etc/GMT-5", "Etc/GMT-4", "Etc/GMT-3",
        "Etc/GMT-2", "Etc/GMT-1", "Etc/GMT", "Etc/GMT+1", "Etc/GMT+2",
        "Etc/GMT+3", "Etc/GMT+4", "Etc/GMT+5", "Etc/GMT+6", "Etc/GMT+7",
        "Etc/GMT+8", "Etc/GMT+9", "Etc/GMT+10", "Etc/GMT+11", "Etc/GMT+12",
        "Etc/GMT+13", "Etc/GMT+14"
    ];
    _cachedTimeZoneIds = [...new Set([...fromIntl, ...supplemental])]
        .filter((tz: string) => !/^Etc\/GMT(?:[+-]\d{1,2})?$/.test(tz))
        .sort((a: string, b: string) => a.localeCompare(b));
    return _cachedTimeZoneIds;
}

export function getTimeZoneOffsetMinutes(timeZoneId: string, referenceDate = new Date()): number {
    if (!isValidTimeZoneId(timeZoneId)) return 0;
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZoneId,
            timeZoneName: "shortOffset"
        }).formatToParts(referenceDate);
        const zoneName = (parts.find((p) => p.type === "timeZoneName") || {}).value || "GMT";
        if (zoneName === "GMT" || zoneName === "UTC") return 0;
        const m = zoneName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
        if (!m) return 0;
        const sign = m[1] === "-" ? -1 : 1;
        const hh = parseInt(m[2], 10) || 0;
        const mm = parseInt(m[3] || "0", 10) || 0;
        return sign * (hh * 60 + mm);
    } catch (_) {
        return 0;
    }
}

export function formatUtcOffset(minutes: number): string {
    if (minutes === 0) return "UTC 00:00";
    const sign = minutes < 0 ? " -" : " +";
    const abs = Math.abs(minutes);
    const hh = pad2(Math.floor(abs / 60));
    const mm = pad2(abs % 60);
    return `UTC${sign}${hh}:${mm}`;
}

export function formatGmtOffset(minutes: number): string {
    if (minutes === 0) return "GMT 00:00";
    const sign = minutes < 0 ? " -" : "+";
    const abs = Math.abs(minutes);
    const hh = pad2(Math.floor(abs / 60));
    const mm = pad2(abs % 60);
    return `GMT${sign}${hh}:${mm}`;
}

export function buildTimeZoneDisplayLabel(timeZoneId: string, offsetMinutes: number): string {
    const utcLabel = formatUtcOffset(offsetMinutes);
    const gmtLabel = formatGmtOffset(offsetMinutes);
    return `(${utcLabel} | ${gmtLabel}) ${timeZoneId}`;
}

export function getTimeZoneOptionsByOffset(referenceDate = new Date()): Array<{ id: string; offsetMinutes: number; offsetLabel: string; label: string }> {
    return getKnownTimeZoneIds()
        .map((id) => {
            const offsetMinutes = getTimeZoneOffsetMinutes(id, referenceDate);
            return {
                id,
                offsetMinutes,
                offsetLabel: formatUtcOffset(offsetMinutes),
                label: buildTimeZoneDisplayLabel(id, offsetMinutes)
            };
        })
        .sort((a, b) => (a.offsetMinutes - b.offsetMinutes) || a.id.localeCompare(b.id));
}

export function isValidTimeZoneId(tz: unknown): boolean {
    if (!tz || typeof tz !== "string") return false;
    try {
        Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
        return true;
    } catch (_) {
        return false;
    }
}

export function getCurrentTimeZone(): string {
    const settings = getOjtSettings();
    const raw = settings.timeZone;
    if (isValidTimeZoneId(raw)) return raw!;
    return DEFAULT_TIMEZONE;
}

export function applyTimeZone(timeZoneId: string): boolean {
    if (!isValidTimeZoneId(timeZoneId)) return false;
    saveOjtSettings({ timeZone: timeZoneId });
    return true;
}

export function getCurrentSemesterEndDate(): string {
    const settings = getOjtSettings();
    const key = toGmt8DateKey(settings.semesterEndDate || DEFAULT_SEMESTER_END);
    return key || toGmt8DateKey(DEFAULT_SEMESTER_END);
}

export function getCurrentRequiredOjtHours(): number {
    const settings = getOjtSettings();
    const parsed = typeof settings.requiredOjtHours === 'number' ? settings.requiredOjtHours : parseFloat(String(settings.requiredOjtHours));
    if (Number.isFinite(parsed) && parsed >= REQUIRED_OJT_HOURS_MIN) {
        return parsed;
    }
    return MASTER_TARGET_HOURS;
}

export function parseDateKeyGmt8(dateKey: any): Date | null {
    if (typeof dateKey !== "string") return null;
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        warnInvalidDateInput(dateKey);
        return null;
    }
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0);
    const parsed = new Date(utcMs);
    if (Number.isNaN(parsed.getTime())) {
        warnInvalidDateInput(dateKey);
        return null;
    }
    return parsed;
}

export function applyOjtStartDate(startDateLike: any): boolean {
    const key = toGmt8DateKey(startDateLike);
    if (!key) return false;
    const parsed = parseDateKeyGmt8(key);
    if (!parsed) return false;
    OJT_START = parsed;
    saveOjtSettings({ ojtStartDate: key });
    return true;
}

export function applySemesterEndDate(endDateLike: any): boolean {
    const key = toGmt8DateKey(endDateLike);
    if (!key) return false;
    saveOjtSettings({ semesterEndDate: key });
    return true;
}

export function applyRequiredOjtHours(hoursLike: any): boolean {
    const parsed = parseFloat(hoursLike);
    if (!Number.isFinite(parsed) || parsed < REQUIRED_OJT_HOURS_MIN) return false;
    saveOjtSettings({ requiredOjtHours: parsed });
    return true;
}

export function hydrateOjtSettingsFromStorage(): {
    startDateKey: string;
    requiredHours: number;
    semesterEndDateKey: string;
    timeZone: string;
} {
    const key = getCurrentOjtStartDate();
    const parsed = parseDateKeyGmt8(key);
    if (parsed) OJT_START = parsed;
    return {
        startDateKey: key,
        requiredHours: getCurrentRequiredOjtHours(),
        semesterEndDateKey: getCurrentSemesterEndDate(),
        timeZone: getCurrentTimeZone()
    };
}

export function nowGmt8StartOfDay(): Date | null {
    return parseDateKeyGmt8(toGmt8DateKey(new Date()));
}

export function addDaysGmt8(date: any, n: number): Date | null {
    const baseKey = toGmt8DateKey(date);
    const baseDate = parseDateKeyGmt8(baseKey);
    if (!baseDate) return null;
    return new Date(baseDate.getTime() + (n * DAY_MS));
}

export function diffDaysGmt8(a: Date | null, b: Date | null): number {
    if (!a || !b) return 0;
    return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

export function getGmt8Weekday(date: Date | null): number {
    if (!date) return 0;
    return date.getUTCDay();
}

export function isWorkdayGmt8(date: Date | null): boolean {
    if (!date) return false;
    return getGmt8Weekday(date) !== 0;
}

export function countWorkdaysGmt8(start: Date | null, endInclusive: Date | null): number {
    if (!start || !endInclusive) return 0;
    let count = 0;
    for (let d: Date | null = new Date(start.getTime()); d && d <= endInclusive; d = addDaysGmt8(d, 1)) {
        if (isWorkdayGmt8(d)) count++;
    }
    return count;
}

export function formatGmt8DateLabel(input: any, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
    const key = toGmt8DateKey(input);
    if (!key) return "";
    const date = parseDateKeyGmt8(key);
    if (!date) return "";
    const lang = (DTRI18N && typeof DTRI18N.getLanguage === "function") ? DTRI18N.getLanguage() : "en-US";
    return date.toLocaleDateString(lang, { ...options, timeZone: "UTC" });
}

export function getWeekNumber(date: any, reference = OJT_START): number {
    const d = parseDateKeyGmt8(toGmt8DateKey(date));
    const ref = parseDateKeyGmt8(toGmt8DateKey(reference));
    if (!d || !ref) return 1;
    const diff = d.getTime() - ref.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / (7 * DAY_MS)) + 1;
}

export function getDayNumberInOjtWeek(date: any, reference = OJT_START): number {
    const d = parseDateKeyGmt8(toGmt8DateKey(date));
    const ref = parseDateKeyGmt8(toGmt8DateKey(reference));
    if (!d || !ref) return 1;
    const diff = d.getTime() - ref.getTime();
    if (diff < 0) return 1;
    return Math.floor(diff / DAY_MS) % 7 + 1;
}

export function getTimelineWeekDayLabel(date: any, reference = OJT_START): string {
    const week = getWeekNumber(date, reference);
    const day = getDayNumberInOjtWeek(date, reference);
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
    if (t) {
        const val = t("timeline_label", { week: String(week), day: String(day) });
        if (val) return val;
    }
    return `Week: ${week} | Day: ${day}`;
}

export function getTotalHours(): number {
    return Store.getRecords().reduce((sum, r) => sum + r.hours, 0);
}

export function getOverallDelta(): number {
    return getTotalHours() - getCurrentRequiredOjtHours();
}

export function getWeekHours(weekNumber: number): number {
    return Store.getRecords()
        .filter(r => getWeekNumber(r.date) === weekNumber)
        .reduce((sum, r) => sum + r.hours, 0);
}

export function getWeekDateRange(weekNumber: number): { start: string; end: string; startDate: Date | null; endDate: Date | null } {
    const ref = parseDateKeyGmt8(toGmt8DateKey(OJT_START));
    const start = addDaysGmt8(ref, (weekNumber - 1) * 7);
    const end = addDaysGmt8(start, 6);
    const fmt = (d: Date | null) => d ? formatGmt8DateLabel(d, { month: "short", day: "numeric", year: "numeric" }) : "";
    return { start: fmt(start), end: fmt(end), startDate: start, endDate: end };
}

export function getTodayFileName(prefix: string, ext: string): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${prefix}_${yyyy}-${mm}-${dd}.${ext}`;
}

export function setTheme(themeName: string, options: any = {}): void {
    const fallbackTheme = (ThemeSync && typeof ThemeSync.sanitizeTheme === "function")
        ? ThemeSync.sanitizeTheme(themeName)
        : (themeName || "f1");

    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme && currentTheme !== fallbackTheme) {
        if (typeof window !== "undefined" && (window as any).PageLoader && typeof (window as any).PageLoader.init === "function") {
            (window as any).PageLoader.init(fallbackTheme, 5000);
        }
    }

    if (ThemeSync && typeof ThemeSync.setTheme === "function") {
        ThemeSync.setTheme(fallbackTheme, options)
            .then((appliedTheme) => {
                try { updateFavicon(appliedTheme); } catch (_) {}
            })
            .catch(() => {
                document.documentElement.setAttribute("data-theme", fallbackTheme);
                localStorage.setItem("user-theme", fallbackTheme);
                try { updateFavicon(fallbackTheme); } catch (_) {}
            });
        return;
    }

    document.documentElement.setAttribute("data-theme", fallbackTheme);
    localStorage.setItem("user-theme", fallbackTheme);
    try { updateFavicon(fallbackTheme); } catch (_) {}
}

export function syncF1LightToggleLabel(): void {
    const btns = [
        document.getElementById('f1LightToggleBtn'),
        document.getElementById('telemetryF1LightToggleBtn')
    ];

    const activeTheme = (ThemeSync && typeof ThemeSync.getLocalTheme === "function")
        ? ThemeSync.getLocalTheme()
        : (localStorage.getItem("user-theme") || "f1");

    const isLightOn = activeTheme.includes("light");
    const iconName = isLightOn ? 'dark_mode' : 'light_mode';

    btns.forEach(btn => {
        if (!btn) return;
        const iconSpan = btn.querySelector('.material-symbols-outlined');
        if (iconSpan) {
            iconSpan.textContent = iconName;
            iconSpan.classList.add('notranslate');
            iconSpan.setAttribute('translate', 'no');
        } else {
            btn.innerHTML = `<span class="material-symbols-outlined notranslate" translate="no">${iconName}</span>`;
        }
    });

    const themeDropdown = document.getElementById('themeSelect') as HTMLSelectElement | null;
    if (themeDropdown) {
        let baseTheme = activeTheme;
        if (baseTheme.endsWith('-light')) {
            baseTheme = baseTheme.replace('-light', '');
        }
        if (Array.from(themeDropdown.options).some(opt => opt.value === baseTheme)) {
            themeDropdown.value = baseTheme;
        }
    }
}

export function toggleF1LightMode(): void {
    const activeTheme = (ThemeSync && typeof ThemeSync.getLocalTheme === "function")
        ? ThemeSync.getLocalTheme()
        : (localStorage.getItem("user-theme") || "f1");
    if (activeTheme !== "f1" && activeTheme !== "f1-light") return;
    const nextTheme = activeTheme === "f1-light" ? "f1" : "f1-light";
    setTheme(nextTheme);
}

export function updateFavicon(themeName: string): void {
    const map: Record<string, string> = {
        'f1': 'favicons/F1Favicon32.png',
        'f1-light': 'favicons/F1Favicon32.png',
        'cadillac': 'favicons/CaddyFavicon32.png',
        'apx': 'favicons/APXFavicon32.png',
        'mclaren': 'favicons/McLFavicon32.png',
        'kiki': 'favicons/KikiFavicon32.png',
        'ferrari': 'favicons/FerrariFavicon32.png',
        'ztmy': 'favicons/ZTMYFavicon32.png'
    };
    const href = map[themeName] || map['f1'];
    let link = document.getElementById('site-favicon') as HTMLLinkElement | null;
    if (!link) {
        link = document.querySelector('link[rel~="icon"]') as HTMLLinkElement | null;
    }
    if (!link) {
        link = document.createElement('link') as HTMLLinkElement;
        link.id = 'site-favicon';
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = href;
    link.type = 'image/png';
    link.sizes = '32x32';
}

export function getIdentityAlignmentLabel(score: number | string): string {
    const map: Record<number, string> = {
        0: "Not Set",
        1: "1 - Drifting",
        2: "2 - Re-centering",
        3: "3 - Aligned",
        4: "4 - Compounding",
        5: "5 - Mission Locked"
    };
    return map[parseInt(String(score), 10)] || map[0];
}

export function normalizeForecastLogs(logs: any[] = Store.getRecords()): any[] {
    const normalized: any[] = [];
    (logs || []).forEach((r) => {
        const dateKey = toGmt8DateKey(r && r.date);
        if (!dateKey) return;
        normalized.push({ ...r, dateKey, hours: parseFloat(r.hours) || 0 });
    });
    normalized.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return normalized;
}

export function calculateForecastUnified({
    logs = Store.getRecords(),
    paceOverride = null as number | null,
    startDate = OJT_START,
    deadlineDate = null as string | null,
    todayOverride = null as string | null
} = {}): any {
    const targetHours = getCurrentRequiredOjtHours();
    const effectiveDeadline = deadlineDate || getCurrentSemesterEndDate();
    const rawLogs = normalizeForecastLogs(logs);
    // Hard cutoff: Telemetry and forecast stop recording beyond the specified semester end date
    const normalizedLogs = effectiveDeadline
        ? rawLogs.filter((r) => r.dateKey <= effectiveDeadline)
        : rawLogs;
    const totalActualHours = normalizedLogs.reduce((sum, r) => sum + (r.hours || 0), 0);
    const remainingHours = Math.max(0, targetHours - totalActualHours);

    const start = parseDateKeyGmt8(toGmt8DateKey(startDate));
    const deadline = parseDateKeyGmt8(toGmt8DateKey(effectiveDeadline));
    const today = todayOverride ? parseDateKeyGmt8(toGmt8DateKey(todayOverride)) : nowGmt8StartOfDay();

    let idealHoursToDate = 0;
    if (start && today) {
        for (let d: Date | null = new Date(start.getTime()); d && d <= today && (!deadline || d <= deadline); d = addDaysGmt8(d, 1)) {
            if (isWorkdayGmt8(d)) idealHoursToDate += DAILY_TARGET_HOURS;
        }
    }
    idealHoursToDate = Math.min(targetHours, idealHoursToDate);
    const currentStatusDelta = totalActualHours - idealHoursToDate;

    let workDaysRemaining = 0;
    if (today && deadline && today < deadline) {
        for (let d = addDaysGmt8(today, 1); d && d <= deadline; d = addDaysGmt8(d, 1)) {
            if (isWorkdayGmt8(d)) workDaysRemaining++;
        }
    }
    const calendarDaysRemaining = today && deadline ? Math.max(0, diffDaysGmt8(today, deadline)) : 0;
    const requiredRate = workDaysRemaining > 0 ? (remainingHours / workDaysRemaining) : 0;

    let paceUsed = 8;
    if (paceOverride !== null && !Number.isNaN(parseFloat(String(paceOverride)))) {
        paceUsed = Math.max(0.1, parseFloat(String(paceOverride)));
    } else {
        const recentLogs = normalizedLogs.slice(-7);
        const recentAvg = recentLogs.length > 0
            ? recentLogs.reduce((s, r) => s + (r.hours || 0), 0) / recentLogs.length
            : 8;
        paceUsed = Math.max(0.1, recentAvg);
    }

    let projectedDate: Date | null = today ? new Date(today.getTime()) : parseDateKeyGmt8(toGmt8DateKey(new Date()));
    let projHoursAccum = totalActualHours;
    let safety = 0;
    while (remainingHours > 0 && projHoursAccum < targetHours && safety < 5000) {
        safety++;
        projectedDate = addDaysGmt8(projectedDate, 1);
        if (projectedDate && isWorkdayGmt8(projectedDate)) projHoursAccum += paceUsed;
    }

    const projectedDateKey = toGmt8DateKey(projectedDate);
    const projectedDateLabel = formatGmt8DateLabel(projectedDate, { month: "short", day: "numeric", year: "numeric" });
    const isAhead = totalActualHours >= idealHoursToDate;
    const isSemesterEnded = !!(today && deadline && today >= deadline);
    const willFinishBeforeSemesterEnd = !!(projectedDate && deadline && projectedDate <= deadline);

    return {
        totalActualHours,
        remainingHours,
        workDaysRemaining,
        calendarDaysRemaining,
        requiredRate,
        paceUsed,
        idealHoursToDate,
        currentStatusDelta,
        isAhead,
        projectedDateKey,
        projectedDateLabel,
        projectedDate,
        recentAvg: paceUsed,
        daysRemaining: calendarDaysRemaining,
        workDaysUntilDeadline: workDaysRemaining,
        targetHours,
        effectiveDeadline,
        isSemesterEnded,
        willFinishBeforeSemesterEnd
    };
}

export function buildTrajectorySeries({
    logs = Store.getRecords(),
    paceOverride = null as number | null,
    startDate = OJT_START,
    deadlineDate = null as string | null
} = {}): any {
    const effectiveDeadline = deadlineDate || getCurrentSemesterEndDate();
    const normalizedLogs = normalizeForecastLogs(logs);
    const forecast = calculateForecastUnified({ logs: normalizedLogs, paceOverride, startDate, deadlineDate: effectiveDeadline });
    const targetHours = forecast.targetHours;
    const start = parseDateKeyGmt8(toGmt8DateKey(startDate));
    const deadline = parseDateKeyGmt8(toGmt8DateKey(effectiveDeadline));
    const today = nowGmt8StartOfDay();
    const lastLogKey = normalizedLogs.length ? normalizedLogs[normalizedLogs.length - 1].dateKey : null;
    const lastLogDate = lastLogKey ? parseDateKeyGmt8(lastLogKey) : null;
    const projectionStartDate = lastLogDate && today && lastLogDate > today ? lastLogDate : today;

    const logMap: Record<string, number> = {};
    normalizedLogs.forEach((l) => {
        logMap[l.dateKey] = (logMap[l.dateKey] || 0) + l.hours;
    });

    const labels: string[] = [];
    const labelDateKeys: string[] = [];
    const actualCumulative: Array<number | null> = [];
    const projectedCumulative: Array<number | null> = [];
    const idealCumulative: Array<number | null> = [];

    let currentSum = 0;
    let projSum = 0;
    let idealSum = 0;

    if (start && deadline && projectionStartDate) {
        for (let d: Date | null = new Date(start.getTime()); d && d <= deadline; d = addDaysGmt8(d, 1)) {
            const dateKey = toGmt8DateKey(d);
            labelDateKeys.push(dateKey);
            labels.push(formatGmt8DateLabel(d, { month: "short", day: "numeric" }));

            const dayHours = logMap[dateKey];
            if (dayHours !== undefined) currentSum += dayHours;

            if (d <= projectionStartDate) {
                actualCumulative.push(currentSum);
                if (!lastLogDate || d <= lastLogDate) projSum = currentSum;
                projectedCumulative.push(null);
            } else {
                actualCumulative.push(null);
                if (isWorkdayGmt8(d)) projSum += forecast.paceUsed;
                projectedCumulative.push(Math.round(projSum));
            }

            if (isWorkdayGmt8(d)) idealSum += DAILY_TARGET_HOURS;
            idealCumulative.push(Math.min(targetHours, idealSum));
        }
    }

    return {
        labels,
        labelDateKeys,
        actualCumulative,
        projectedCumulative,
        idealCumulative,
        forecast
    };
}

export function calculateForecast(logs: any[] = Store.getRecords(), overridePace: number | null = null): any {
    return calculateForecastUnified({ logs, paceOverride: overridePace });
}
