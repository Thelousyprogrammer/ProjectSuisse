/**
 * DTR UI MODULE
 * Handles form clearing, summaries, modal logic, and reflection list rendering
 */

import { DTRI18N } from '../dtr-i18n';
import { SecurityMonitor } from '../utils/security-monitor';
import { Store, DailyRecordData } from '../store';
import {
    DAILY_TARGET_HOURS,
    DTR_COLORS,
    getWeekNumber,
    getTimelineWeekDayLabel,
    getTotalHours,
    getCurrentRequiredOjtHours,
    getWeekHours,
    getWeekDateRange,
    formatGmt8DateLabel,
    toGmt8DateKey,
    calculateForecastUnified,
    getCurrentOjtStartDate,
    getCurrentSemesterEndDate,
    DailyRecord
} from '../core/dtr-engine';
import { getRecordImageUrls, saveImageToStore, deleteImagesFromStore, archiveRecordsSnapshot } from '../dtr-image-store';
import { persistDTR } from '../dtr-storage';
import { renderDailyGraph, renderWeeklyGraph } from '../dtr-graphs';
import { updateStorageVisualizer } from '../dtr-storage-aux';
import {
    updateReflectionWeekOptions,
    getReflectionSelectedWeek,
    updateReflectionMonthOptions,
    getReflectionSelectedMonth,
    currentReflectionViewMode,
    currentSortMode,
    applyDtrDateIntegrityGuardToInputs
} from '../dtr-ui-aux';

export const GREAT_DELTA_THRESHOLD = 2;
export let editingIndex: number | null = null;
export let currentSummaryRecord: DailyRecordData | null = null;
export let _importedImageIds: string[] = [];

export function clearDTRForm(): void {
    const setVal = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el) el.value = val;
    };

    setVal("date", "");
    setVal("hours", "");
    setVal("reflection", "");
    setVal("accomplishments", "");
    setVal("tools", "");

    const imgInput = document.getElementById("images") as HTMLInputElement | null;
    if (imgInput) imgInput.value = "";

    const preview = document.getElementById("imagePreview");
    if (preview) preview.innerHTML = "";

    const counterEl = document.getElementById("weeklyCounter");
    if (counterEl) counterEl.innerHTML = "";

    setVal("personalHours", "");
    setVal("sleepHours", "");
    setVal("recoveryHours", "");
    setVal("commuteTotal", "");
    setVal("commuteProductive", "");
    setVal("identityScore", "0");

    _importedImageIds = [];
}

export function updateWeeklyCounter(dateInput: any): void {
    if (!dateInput) return;
    const counterEl = document.getElementById("weeklyCounter");
    const weekNum = getWeekNumber(dateInput);
    const weekHours = Store.getRecords()
        .filter(r => getWeekNumber(r.date) === weekNum)
        .reduce((sum, r) => sum + r.hours, 0);

    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let color = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) color = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) color = DTR_COLORS.good;

    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
    if (counterEl) {
        const weekHoursLabel = t ? t("week_hours_label", { week: String(weekNum) }) : `Week ${weekNum} Hours`;
        counterEl.innerHTML = `<span data-i18n="week_hours_label" data-i18n-args='{"week":${weekNum}}'>${weekHoursLabel}</span>: <span style="color:${color}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span>`;
        
        if (DTRI18N && typeof DTRI18N.applyTranslations === "function") {
            DTRI18N.applyTranslations();
        }
    }
}

export function showSummary(record: any): void {
    currentSummaryRecord = record;
    const s = document.getElementById("summary");
    if (!s) return;
    s.style.display = "block";
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;

    if (!record || !record.date) {
        const sessionDeltaSummary = t ? t("session_delta_summary") : "Session Delta Summary";
        const noRecordSelected = t ? t("no_record_selected") : "No record selected.";
        s.innerHTML = `<h2 data-i18n="session_delta_summary">${sessionDeltaSummary}</h2><p data-i18n="no_record_selected">${noRecordSelected}</p>`;
        return;
    }

    const previousDelta = Store.getRecords().length > 1 ? (Store.getRecords()[Store.getRecords().length - 2].delta || 0) : 0;
    const delta = typeof record.delta === 'number' ? record.delta : (record.hours - DAILY_TARGET_HOURS);
    
    let deltaColor = DTR_COLORS.neutral;
    if (delta <= 0) deltaColor = DTR_COLORS.warning;
    else if (delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

    let trendKey = "trend_no_previous_record";
    let trendColor = DTR_COLORS.neutral;
    if (Store.getRecords().length > 1) {
        if (delta > previousDelta) { trendKey = "trend_improved"; trendColor = DTR_COLORS.good; }
        else if (delta < previousDelta) { trendKey = "trend_declined"; trendColor = DTR_COLORS.warning; }
        else { trendKey = "trend_same_as_before"; trendColor = DTR_COLORS.neutral; }
    }
    const trendLabel = t ? t(trendKey) : trendKey;

    const hasSummaryImages = (record.imageIds && record.imageIds.length) || (record.images && record.images.length);
    const summaryImagesContainer = hasSummaryImages
        ? '<div class="summary-images" style="display:flex; gap:6px; flex-wrap:wrap; justify-content: flex-end;"></div>'
        : "";

    const totalHours = getTotalHours();
    const targetHours = getCurrentRequiredOjtHours();
    const overallColor = (totalHours >= targetHours) ? DTR_COLORS.excellent : DTR_COLORS.good;
    
    const weekNum = record.date ? getWeekNumber(record.date) : null;
    const timelineWeekDayLabel = record.date ? getTimelineWeekDayLabel(record.date) : "Week: 1 | Day: 1";
    const weekHours = weekNum ? getWeekHours(weekNum) : 0;
    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let weekColor = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
    else weekColor = DTR_COLORS.excellent;

    const identityLabels: Record<number, string> = {
        0: (t && t("identity_0")) ? t("identity_0")! : "Not Set",
        1: (t && t("identity_1")) ? t("identity_1")! : "1 - Drifting",
        2: (t && t("identity_2")) ? t("identity_2")! : "2 - Re-centering",
        3: (t && t("identity_3")) ? t("identity_3")! : "3 - Aligned",
        4: (t && t("identity_4")) ? t("identity_4")! : "4 - Compounding",
        5: (t && t("identity_5")) ? t("identity_5")! : "5 - Mission Locked"
    };
    const commuteEff = record.commuteTotal > 0
        ? ((record.commuteProductive / record.commuteTotal) * 100).toFixed(1) + "%"
        : (DTRI18N ? DTRI18N.t("na_short") : "N/A");

    const f = calculateForecastUnified({ logs: Store.getRecords() });
    const absDelta = Math.abs(f.currentStatusDelta).toFixed(1);
    const statusKey = f.currentStatusDelta > 0 ? "status_ahead_hours" : (f.currentStatusDelta < 0 ? "status_behind_hours" : "status_on_track");
    const statusArgs = f.currentStatusDelta !== 0 ? JSON.stringify({ hours: absDelta }) : "{}";
    const statusText = t ? t(statusKey, JSON.parse(statusArgs)) : statusKey;

    s.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 20px;">
            <div style="flex: 1;">
                <h2 data-i18n="session_delta_summary">Session Delta Summary</h2>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="margin:0;"><strong><span data-i18n="summary_date">Date</span>:</strong> ${record.date}</p>
                    <span style="font-size:0.8em; color:${f.isAhead ? DTR_COLORS.good : DTR_COLORS.warning}; font-family:var(--font-body); text-transform:uppercase; font-weight:bold;" data-i18n="${statusKey}" data-i18n-args='${statusArgs}'>${statusText}</span>
                </div>
                <p><strong><span data-i18n="summary_timeline">Timeline</span>:</strong> ${timelineWeekDayLabel}</p>
                <p><strong><span data-i18n="summary_hours_worked">Hours Worked</span>:</strong> ${record.hours}</p>
                <p><strong><span data-i18n="summary_delta">Delta</span>:</strong> <span style="color:${deltaColor}; font-weight:bold;">${delta >= 0 ? "+" : ""}${delta.toFixed(2)} <span data-i18n="hours_unit">hours</span></span></p>
                <p><strong><span data-i18n="summary_trend">Trend</span>:</strong> <span style="color:${trendColor}; font-weight:bold;" data-i18n="${trendKey}">${trendLabel}</span></p>
                <p><strong><span data-i18n="summary_overall">Overall</span>:</strong> <span style="color:${overallColor}; font-weight:bold;">${totalHours} / ${targetHours}h</span></p>
                <p><strong><span data-i18n="summary_weekly">Weekly</span>:</strong> <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span></p>
            </div>
            <div style="max-width:300px;">
                ${summaryImagesContainer}
            </div>
        </div>
        <p><strong><span data-i18n="daily_reflection">Daily Reflection</span>:</strong> ${SecurityMonitor.sanitizeHtml(record.reflection || "")}</p>
        <p><strong><span data-i18n="tools_used">Tools Used (comma separated)</span>:</strong> ${(Array.isArray(record.tools) ? record.tools.join(", ") : (record.tools || "")).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        <div style="margin-top:20px; padding-top:15px; border-top: 1px dotted var(--border); display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em;">
            <div><strong><span data-i18n="summary_personal">Personal</span>:</strong> ${record.personalHours || 0}h</div>
            <div><strong><span data-i18n="summary_sleep">Sleep</span>:</strong> ${record.sleepHours || 0}h</div>
            <div><strong><span data-i18n="summary_recovery">Recovery</span>:</strong> ${record.recoveryHours || 0}h</div>
            <div><strong><span data-i18n="summary_identity">Identity</span>:</strong> <span data-i18n="identity_${record.identityScore || 0}">${identityLabels[record.identityScore] || (t ? t("identity_0") : "Not Set")}</span></div>
            <div style="grid-column: span 2;"><strong><span data-i18n="summary_commute_eff">Commute Eff</span>:</strong> ${commuteEff}</div>
        </div>
        
        <div style="margin-top:15px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border-left:4px solid ${f.isAhead ? DTR_COLORS.good : DTR_COLORS.warning};">
            <h4 style="margin:0 0 8px 0; font-size:0.9em; text-transform:uppercase; color:var(--accent); font-family:var(--font-body);" data-i18n="summary_ojt_forecast">OJT Forecast</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.85em; font-family:var(--font-body);">
                <div><span data-i18n="summary_total_rendered">Total Rendered</span>: <strong>${Math.round(f.totalActualHours)}h</strong></div>
                <div><span data-i18n="summary_remaining_hours">Rem. Hours</span>: <strong>${Math.round(f.remainingHours)}h</strong></div>
                <div><span data-i18n="summary_need_pace">Need Pace</span>: <strong>${Math.ceil(f.requiredRate)}h/day</strong></div>
                <div><span data-i18n="summary_projected">Projected</span>: <strong>${formatGmt8DateLabel(f.projectedDate, {month:'short', day:'numeric'})}</strong></div>
            </div>
        </div>
    `;

    if (DTRI18N && typeof DTRI18N.applyTranslations === "function") {
        DTRI18N.applyTranslations();
    }
    if (hasSummaryImages) {
        const container = s.querySelector(".summary-images");
        if (container) {
            getRecordImageUrls(record).then((urls) => {
                const sessionLabel = "Session";
                urls.forEach((src) => {
                    if (!src || typeof src !== "string") return;
                    const img = document.createElement("img");
                    img.src = src;
                    img.setAttribute("style", "width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border); transition: transform 0.2s;");
                    img.addEventListener("error", () => { img.style.visibility = "hidden"; });
                    img.addEventListener("mouseover", () => { img.style.transform = "scale(2.5)"; img.style.zIndex = "100"; });
                    img.addEventListener("mouseout", () => { img.style.transform = "scale(1)"; img.style.zIndex = "1"; });
                    container.appendChild(img);
                });
            });
        }
    }
}

export function loadReflectionViewer(): void {
    const viewer = document.getElementById("reflectionViewer");
    if (!viewer) return;
    viewer.innerHTML = "";
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;

    if (Store.getRecords().length === 0) {
        const emptyText = t ? t("no_reflections_saved") : "No reflections saved yet.";
        viewer.innerHTML = `<p class="empty" data-i18n="no_reflections_saved">${emptyText}</p>`;
        return;
    }

    const dedupedMap = new Map<string, { r: DailyRecordData; originalIndex: number }>();
    Store.getRecords().forEach((r, idx) => {
        const dateKey = toGmt8DateKey(r && r.date) || (r && r.date);
        if (!dateKey) return;
        dedupedMap.set(dateKey, { r: { ...r, date: dateKey }, originalIndex: idx });
    });
    const dedupedEntries = Array.from(dedupedMap.values()).sort((a, b) => a.r.date.localeCompare(b.r.date));
    const duplicateCount = Math.max(0, Store.getRecords().length - dedupedEntries.length);

    updateReflectionWeekOptions();
    updateReflectionMonthOptions();

    const weekFilter = currentReflectionViewMode === "week" ? getReflectionSelectedWeek() : null;
    const monthFilter = currentReflectionViewMode === "month" ? getReflectionSelectedMonth() : null;

    let sourceEntries = dedupedEntries;
    if (weekFilter !== null) {
        sourceEntries = dedupedEntries.filter(entry => getWeekNumber(entry.r.date) === weekFilter);
    } else if (monthFilter !== null) {
        sourceEntries = dedupedEntries.filter(entry => (entry.r.date || "").startsWith(monthFilter));
    }

    const sourceRecords = sourceEntries.map(entry => entry.r);

    if (!sourceRecords.length) {
        let emptyKey = "no_reflections_saved";
        let emptyDefault = "No reflections saved yet.";
        if (currentReflectionViewMode === "week") {
            emptyKey = "no_reflections_for_week";
            emptyDefault = "No reflections for the selected week.";
        } else if (currentReflectionViewMode === "month") {
            emptyKey = "no_reflections_for_month";
            emptyDefault = "No reflections for the selected month.";
        }
        const emptyText = t ? t(emptyKey) : emptyDefault;
        viewer.innerHTML = `<p class="empty" data-i18n="${emptyKey}">${emptyText}</p>`;
        return;
    }

    if (duplicateCount > 0) {
        const duplicateNotice = document.createElement("p");
        duplicateNotice.style.margin = "0 0 10px 0";
        duplicateNotice.style.fontSize = "0.9em";
        duplicateNotice.style.opacity = "0.8";
        duplicateNotice.textContent = "Duplicate records hidden in the Reflection Viewer.";
        viewer.appendChild(duplicateNotice);
    }

    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    if (weekFilter !== null) {
        const weekHoursLabel = t ? t("week_hours_label", { week: String(weekFilter) }) : ("Week " + weekFilter + " Hours");
        const weekHours = getWeekHours(weekFilter);
        let weekColor = DTR_COLORS.neutral;
        if (weekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
        else if (weekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
        const range = getWeekDateRange(weekFilter);
        const counterDiv = document.createElement("div");
        counterDiv.style.marginBottom = "10px";
        counterDiv.innerHTML = `<strong><span data-i18n="week_hours_label" data-i18n-args='{"week":${weekFilter}}'>${weekHoursLabel}</span>:</strong> <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span> <span style="opacity:0.7; font-size:0.9em;">(${range.start} - ${range.end})</span>`;
        viewer.appendChild(counterDiv);
    } else if (monthFilter !== null) {
        const monthHours = sourceRecords.reduce((sum, r) => sum + (r.hours || 0), 0);
        const [yearStr, monthStr] = monthFilter.split("-");
        const monthDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
        const monthName = monthDate.toLocaleDateString("en-US", { month: "long" });
        const monthLabelText = `${monthName} ${yearStr}`;
        const monthHoursLabel = t ? t("month_hours_label", { month: monthLabelText }) : `${monthLabelText} Hours`;
        const counterDiv = document.createElement("div");
        counterDiv.style.marginBottom = "10px";
        counterDiv.innerHTML = `<strong><span>${monthHoursLabel}</span>:</strong> <span style="color:var(--accent); font-weight:bold;">${monthHours}h</span> <span style="opacity:0.7; font-size:0.9em;">(${sourceRecords.length} days logged)</span>`;
        viewer.appendChild(counterDiv);
    } else {
        const latestDate = Store.getRecords()[Store.getRecords().length - 1].date;
        const currentWeek = getWeekNumber(latestDate);
        const weekHoursLabel = t ? t("week_hours_label", { week: String(currentWeek) }) : ("Week " + currentWeek + " Hours");
        const currentWeekHours = getWeekHours(currentWeek);
        let weekColor = DTR_COLORS.neutral;
        if (currentWeekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
        else if (currentWeekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
        const counterDiv = document.createElement("div");
        counterDiv.style.marginBottom = "10px";
        counterDiv.innerHTML = `<strong><span data-i18n="week_hours_label" data-i18n-args='{"week":${currentWeek}}'>${weekHoursLabel}</span>:</strong> <span style="color:${weekColor}; font-weight:bold;">${currentWeekHours} / ${maxWeeklyHours}</span> <span style="opacity:0.7; font-size:0.9em;">(${sourceRecords.length} total entries)</span>`;
        viewer.appendChild(counterDiv);
    }

    const displayItems = sourceEntries.map((entry) => {
        const r = entry.r;
        const originalIndex = entry.originalIndex;
        const delta = r.delta ?? (r.hours - DAILY_TARGET_HOURS);
        let trendKey = "trend_no_previous_record";
        let trendColor = DTR_COLORS.neutral;
        if (originalIndex > 0) {
            const prevDelta = Store.getRecords()[originalIndex - 1].delta ?? 0;
            if (delta > prevDelta) { trendKey = "trend_improved"; trendColor = DTR_COLORS.good; }
            else if (delta < prevDelta) { trendKey = "trend_declined"; trendColor = DTR_COLORS.warning; }
            else { trendKey = "trend_same_as_before"; trendColor = DTR_COLORS.neutral; }
        }
        const trendLabel = t ? t(trendKey) : trendKey;
        return { r, delta, originalIndex, trendKey, trendLabel, trendColor };
    });

    if (currentSortMode === "date-desc") displayItems.sort((a,b) => (toGmt8DateKey(b.r.date) || "").localeCompare(toGmt8DateKey(a.r.date) || ""));
    else if (currentSortMode === "delta-desc") displayItems.sort((a,b) => b.delta - a.delta);
    else if (currentSortMode === "delta-asc") displayItems.sort((a,b) => a.delta - b.delta);

    displayItems.forEach(item => {
        const r = item.r;
        const timelineWeekDayLabel = getTimelineWeekDayLabel(r.date);
        let deltaColor = DTR_COLORS.neutral;
        if (item.delta <= 0) deltaColor = DTR_COLORS.warning;
        else if (item.delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

        const hasImages = (r.imageIds && r.imageIds.length) || (r.images && r.images.length);
        const reflectionImagesHTML = hasImages
            ? '<div class="reflection-images" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;"></div>'
            : "";

        const div = document.createElement("div");
        div.className = "reflection-item";

        const identityLabels: Record<number, string> = {
            0: (t && t("identity_0")) ? t("identity_0")! : "Not Set",
            1: (t && t("identity_1")) ? t("identity_1")! : "1 - Drifting",
            2: (t && t("identity_2")) ? t("identity_2")! : "2 - Re-centering",
            3: (t && t("identity_3")) ? t("identity_3")! : "3 - Aligned",
            4: (t && t("identity_4")) ? t("identity_4")! : "4 - Compounding",
            5: (t && t("identity_5")) ? t("identity_5")! : "5 - Mission Locked"
        };
        const commuteEff = (r.commuteTotal || 0) > 0
            ? (((r.commuteProductive || 0) / r.commuteTotal!) * 100).toFixed(1) + "%"
            : (DTRI18N ? DTRI18N.t("na_short") : "N/A");

        const safeReflection = SecurityMonitor.sanitizeHtml(r.reflection || "");

        const toolsHTML = (Array.isArray(r.tools) && r.tools.length)
            ? r.tools.map(tItem => {
                const safeT = String(tItem).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `<span style="display:inline-block; padding:2px 8px; margin:2px 3px 2px 0; border:1px solid var(--accent); border-radius:12px; font-size:0.78em; color:var(--accent); white-space:nowrap;">${safeT}</span>`;
            }).join("")
            : `<span style="opacity:0.5;">${DTRI18N ? DTRI18N.t("na_short") : "N/A"}</span>`;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${item.originalIndex + 1}. ${r.date} (${timelineWeekDayLabel})</strong>
                <button class="edit-btn" data-action="edit-record" data-index="${item.originalIndex}">✎ Edit</button>
            </div>
            <p>${safeReflection}</p>
            <div style="margin: 8px 0; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 3px solid var(--accent); font-size: 0.85em;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px;">
                    <div><strong><span data-i18n="summary_hours_worked">Hours Worked</span>:</strong> ${r.hours}h (Δ ${item.delta.toFixed(2)})</div>
                    <div><strong><span data-i18n="summary_trend">Trend</span>:</strong> <span style="color:${item.trendColor}" data-i18n="${item.trendKey}">${item.trendLabel}</span></div>
                    <div><strong><span data-i18n="summary_personal">Personal</span>:</strong> ${r.personalHours || 0}h</div>
                    <div><strong><span data-i18n="summary_sleep">Sleep</span>:</strong> ${r.sleepHours || 0}h</div>
                    <div><strong><span data-i18n="summary_recovery">Recovery</span>:</strong> ${r.recoveryHours || 0}h</div>
                    <div><strong><span data-i18n="summary_identity">Identity</span>:</strong> <span data-i18n="identity_${r.identityScore || 0}">${identityLabels[r.identityScore || 0] || "Not Set"}</span></div>
                    <div style="grid-column: span 2;"><strong><span data-i18n="summary_commute_eff">Commute Eff</span>:</strong> ${commuteEff}</div>
                    <div style="grid-column: span 2; margin-top: 4px;"><strong><span data-i18n="summary_tools_used">Tools Used</span>:</strong><br>${toolsHTML}</div>
                </div>
            </div>
            ${reflectionImagesHTML}
            <hr>
        `;
        if (hasImages) {
            const imgContainer = div.querySelector(".reflection-images");
            const thumbStyle = "width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid var(--border); cursor:zoom-in; background:rgba(255,255,255,0.05);";
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        getRecordImageUrls(r).then((urls) => {
                            if (!imgContainer) return;
                            imgContainer.innerHTML = "";
                            urls.forEach((src) => {
                                if (!src || typeof src !== "string") return;
                                const img = document.createElement("img");
                                img.src = src;
                                img.setAttribute("style", thumbStyle);
                                img.alt = "Reflection";
                                img.addEventListener("error", () => { img.style.visibility = "hidden"; img.title = "Image failed to load"; });
                                img.addEventListener("click", function (this: HTMLImageElement) {
                                    this.style.width = "auto"; this.style.height = "300px"; this.style.position = "fixed";
                                    this.style.top = "50%"; this.style.left = "50%"; this.style.transform = "translate(-50%, -50%)";
                                    this.style.zIndex = "9999"; this.style.boxShadow = "0 0 20px rgba(0,0,0,0.8)";
                                    const revert = () => {
                                        this.style.width = "50px"; this.style.height = "50px"; this.style.position = "static";
                                        this.style.transform = "none"; this.style.zIndex = "1"; this.style.boxShadow = "none";
                                        this.removeEventListener("click", revert);
                                    };
                                    this.addEventListener("click", revert);
                                });
                                imgContainer.appendChild(img);
                            });
                        });
                        observer.unobserve(div);
                    }
                });
            }, { rootMargin: "100px" });

            observer.observe(div);
        }
        viewer.appendChild(div);
    });

    if (DTRI18N && typeof DTRI18N.applyTranslations === "function") {
        DTRI18N.applyTranslations();
    }
}

export function closeEditModal(): void {
    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "none";
    editingIndex = null;
}

export function saveEditModal(): void {
    if (editingIndex === null) return;

    const date = (document.getElementById("editDate") as HTMLInputElement).value;
    const hours = parseFloat((document.getElementById("editHours") as HTMLInputElement).value);
    const reflection = (document.getElementById("editReflection") as HTMLInputElement).value;
    const accomplishments = (document.getElementById("editAccomplishments") as HTMLTextAreaElement).value.split("\n").map(a => a.trim()).filter(Boolean);
    const tools = (document.getElementById("editTools") as HTMLInputElement).value.split(",").map(t => t.trim()).filter(Boolean);

    const l2Data = {
        personalHours: parseFloat((document.getElementById("editPersonalHours") as HTMLInputElement).value) || 0,
        sleepHours: parseFloat((document.getElementById("editSleepHours") as HTMLInputElement).value) || 0,
        recoveryHours: parseFloat((document.getElementById("editRecoveryHours") as HTMLInputElement).value) || 0,
        commuteTotal: parseFloat((document.getElementById("editCommuteTotal") as HTMLInputElement).value) || 0,
        commuteProductive: parseFloat((document.getElementById("editCommuteProductive") as HTMLInputElement).value) || 0,
        identityScore: parseInt((document.getElementById("editIdentityScore") as HTMLInputElement).value, 10) || null
    };
    const startDate = getCurrentOjtStartDate();
    const dateKey = toGmt8DateKey(date);
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const editImagesInput = document.getElementById("editImages") as HTMLInputElement | null;
    const files = editImagesInput && editImagesInput.files ? Array.from(editImagesInput.files) : [];
    
    if (files.length > 0) {
        Promise.allSettled(files.map((file) => saveImageToStore(file)))
            .then((results) => {
                const newImageIds = results
                    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
                    .map((r) => r.value);
                const failedCount = results.filter((r) => r.status === "rejected").length;

                if (!newImageIds.length) {
                    const old = Store.getRecords()[editingIndex!];
                    if (failedCount > 0) {
                        alert("Image upload failed for " + failedCount + " image(s). Keeping old images.");
                    }
                    finalizeSave(date, hours, reflection, accomplishments, tools, old.imageIds || [], l2Data);
                    return;
                }

                if (failedCount > 0) {
                    alert("Some images failed to upload (" + failedCount + "). Saving only successfully uploaded images.");
                }

                const old = Store.getRecords()[editingIndex!];
                const oldIds = old.imageIds || [];
                if (oldIds.length) {
                    deleteImagesFromStore(oldIds).catch(() => {});
                }

                finalizeSave(date, hours, reflection, accomplishments, tools, newImageIds, l2Data);
            })
            .catch((err) => {
                console.error("Edit: IndexedDB save error:", err);
                alert("Failed to save images to storage: " + (err && err.message ? err.message : err));
            });
    } else {
        const old = Store.getRecords()[editingIndex];
        finalizeSave(date, hours, reflection, accomplishments, tools, old.imageIds || [], l2Data);
    }
}

export async function finalizeSave(
    date: string,
    hours: number,
    reflection: string,
    accomplishments: string[],
    tools: string[],
    imageIds: string[],
    l2Data: any
): Promise<void> {
    const startDate = getCurrentOjtStartDate();
    const semesterEndDate = getCurrentSemesterEndDate();
    const dateKey = toGmt8DateKey(date);
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }
    if (semesterEndDate && dateKey && dateKey > semesterEndDate) {
        alert(`DTR Date cannot be later than Semester End Date (${semesterEndDate}).`);
        return;
    }

    const normalizedDate = dateKey || date;
    const duplicateIndex = Store.getRecords().findIndex((r, idx) =>
        idx !== editingIndex && (toGmt8DateKey(r.date) || r.date) === normalizedDate
    );
    if (duplicateIndex !== -1) {
        if (!confirm("A DTR record for " + normalizedDate + " already exists. Overwrite it with this edit?")) {
            return;
        }
        const replacedRecord = Store.getRecords()[duplicateIndex];
        if (replacedRecord && typeof archiveRecordsSnapshot === "function") {
            archiveRecordsSnapshot([replacedRecord], "edit_overwrite").catch(() => {});
        }
        Store.removeRecordAt(duplicateIndex);
        if (editingIndex !== null && duplicateIndex < editingIndex) editingIndex -= 1;
    }

    if (editingIndex !== null) {
        Store.updateRecord(editingIndex, new DailyRecord(normalizedDate, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []));
    }
    Store.getRecords().sort((a, b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));
    const ok = await persistDTR(Store.getRecords());
    if (!ok) {
        alert("Failed to save record update.");
        return;
    }

    closeEditModal();
    updateReflectionWeekOptions();
    loadReflectionViewer();
    const newIndex = Store.getRecords().findIndex(r => r.date === date);
    if (newIndex !== -1) {
        showSummary(Store.getRecords()[newIndex]);
    }
    renderDailyGraph();
    renderWeeklyGraph();
    updateStorageVisualizer();
    alert("Record updated successfully!");
}

export function openEditModal(target: HTMLElement): void {
    if (!target) return;
    editingIndex = Number(target.getAttribute("data-index"));
    const r = Store.getRecords()[editingIndex];
    if (!r) return;

    applyDtrDateIntegrityGuardToInputs();

    const setVal = (id: string, val: string | number) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el) el.value = String(val);
    };

    setVal("editDate", r.date);
    setVal("editHours", r.hours);
    setVal("editReflection", r.reflection || "");
    setVal("editAccomplishments", Array.isArray(r.accomplishments) ? r.accomplishments.join("\n") : (r.accomplishments || ""));
    setVal("editTools", Array.isArray(r.tools) ? r.tools.join(", ") : (r.tools || ""));

    setVal("editPersonalHours", r.personalHours || 0);
    setVal("editSleepHours", r.sleepHours || 0);
    setVal("editRecoveryHours", r.recoveryHours || 0);
    setVal("editIdentityScore", r.identityScore || 0);
    setVal("editCommuteTotal", r.commuteTotal || 0);
    setVal("editCommuteProductive", r.commuteProductive || 0);

    const imgInput = document.getElementById("editImages") as HTMLInputElement | null;
    if (imgInput) imgInput.value = "";
    const imgPreview = document.getElementById("editImagePreview");
    if (imgPreview) {
        imgPreview.innerHTML = "";
        const hasImages = (r.imageIds && r.imageIds.length) || (r.images && r.images.length);
        if (hasImages) {
            const p = document.createElement("p");
            p.style.width = "100%";
            p.style.fontSize = "10px";
            p.style.margin = "0 0 5px 0";
            p.innerText = "Current Images:";
            imgPreview.appendChild(p);
            getRecordImageUrls(r).then((urls) => {
                urls.forEach((src) => {
                    const img = document.createElement("img");
                    img.src = src;
                    img.style.width = "40px";
                    img.style.height = "40px";
                    img.style.objectFit = "cover";
                    img.style.borderRadius = "4px";
                    img.style.opacity = "0.5";
                    imgPreview.appendChild(img);
                });
            });
        }
    }

    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "flex";
}

if (typeof window !== "undefined") {
    (window as any).loadReflectionViewer = loadReflectionViewer;
    (window as any).showSummary = showSummary;
    (window as any).updateWeeklyCounter = updateWeeklyCounter;
    (window as any).clearDTRForm = clearDTRForm;
    (window as any).openEditModal = openEditModal;
    (window as any).closeEditModal = closeEditModal;
    (window as any).saveEditModal = saveEditModal;
}
