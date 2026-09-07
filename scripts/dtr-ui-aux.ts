/**
 * DTR UI AUX MODULE
 * Auxiliary UI flows separated from core submit/edit/summary logic.
 */

import { Store } from './store';
import { DTRI18N } from './dtr-i18n';
import {
    getWeekNumber,
    getWeekDateRange,
    toGmt8DateKey,
    DEFAULT_TIMEZONE,
    getTimeZoneOptionsByOffset,
    getCurrentTimeZone,
    isValidTimeZoneId,
    getCurrentOjtStartDate,
    getCurrentSemesterEndDate,
    getCurrentRequiredOjtHours,
    getOjtSettings,
    applyOjtStartDate,
    applyRequiredOjtHours,
    applySemesterEndDate,
    applyTimeZone,
    hydrateOjtSettingsFromStorage,
    syncF1LightToggleLabel
} from './core/dtr-engine';
import { clearRecordsFromStore, deleteImagesFromStore } from './dtr-image-store';
import { clearDTRForm, showSummary, loadReflectionViewer, updateWeeklyCounter } from './ui/dtr-view';
import { renderDailyGraph, renderWeeklyGraph } from './dtr-graphs';
import { updateExportWeekOptions } from './dtr-exports';
import { updateStorageVisualizer } from './dtr-storage-aux';

export let currentSortMode = "date-asc";
export let currentReflectionViewMode: "all" | "week" | "month" = (typeof localStorage !== "undefined" && localStorage.getItem("dtr-reflection-view-mode") as any) || "week";

function changeSortMode(mode: string): void {
    currentSortMode = mode;
    loadReflectionViewer();
}

function getReflectionSelectedWeek(): number | null {
    const select = document.getElementById("reflectionWeekSelect") as HTMLSelectElement | null;
    if (!select) return null;
    const raw = select.value;
    if (raw === "current") {
        const latestDate = Store.getRecords().length ? Store.getRecords()[Store.getRecords().length - 1].date : toGmt8DateKey(new Date());
        return getWeekNumber(latestDate);
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}

function updateReflectionWeekOptions(): void {
    const select = document.getElementById("reflectionWeekSelect") as HTMLSelectElement | null;
    if (!select) return;

    const currentValue = select.value || "current";
    const currentWeekLabel = DTRI18N ? DTRI18N.t("current_week") : "Current Week";
    select.innerHTML = `<option value="current">${currentWeekLabel}</option>`;

    const weeks = [...new Set(Store.getRecords().map(r => getWeekNumber(r.date)))].sort((a, b) => b - a);
    weeks.forEach((w) => {
        const range = getWeekDateRange(w);
        const opt = document.createElement("option");
        opt.value = String(w);
        opt.textContent = DTRI18N ? DTRI18N.t("week_label", { week: String(w) }) : `Week ${w}`;
        opt.title = `${range.start} - ${range.end}`;
        select.appendChild(opt);
    });

    if (select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }

    const viewMode = document.getElementById("reflectionViewMode") as HTMLSelectElement | null;
    if (viewMode && viewMode.value !== "week") {
        select.style.display = "none";
    }
}

function getReflectionSelectedMonth(): string | null {
    const select = document.getElementById("reflectionMonthSelect") as HTMLSelectElement | null;
    if (!select) return null;
    const raw = select.value;
    if (raw === "current") {
        const latestDate = Store.getRecords().length ? Store.getRecords()[Store.getRecords().length - 1].date : toGmt8DateKey(new Date());
        return (latestDate || "").slice(0, 7) || null;
    }
    return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function updateReflectionMonthOptions(): void {
    const select = document.getElementById("reflectionMonthSelect") as HTMLSelectElement | null;
    if (!select) return;

    const currentValue = select.value || "current";
    const currentMonthLabel = DTRI18N ? DTRI18N.t("current_month") : "Current Month";
    select.innerHTML = `<option value="current">${currentMonthLabel}</option>`;

    const months = [...new Set(Store.getRecords().map(r => (r.date || "").slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    months.forEach((m) => {
        const [yearStr, monthStr] = m.split("-");
        const monthNum = parseInt(monthStr, 10);
        const dateObj = new Date(parseInt(yearStr, 10), monthNum - 1, 1);
        const monthName = dateObj.toLocaleDateString("en-US", { month: "long" });
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = `${monthName} ${yearStr}`;
        select.appendChild(opt);
    });

    if (select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }

    const viewMode = document.getElementById("reflectionViewMode") as HTMLSelectElement | null;
    if (viewMode && viewMode.value !== "month") {
        select.style.display = "none";
    }
}

function changeReflectionViewMode(mode: string): void {
    currentReflectionViewMode = (mode === "week" || mode === "month") ? mode : "all";
    try {
        localStorage.setItem("dtr-reflection-view-mode", currentReflectionViewMode);
    } catch (_) {}

    const weekLabel = document.getElementById("reflectionWeekLabel") || document.querySelector('label[for="reflectionWeekSelect"]') as HTMLElement | null;
    const weekSelect = document.getElementById("reflectionWeekSelect") as HTMLElement | null;
    const monthLabel = document.getElementById("reflectionMonthLabel") || document.querySelector('label[for="reflectionMonthSelect"]') as HTMLElement | null;
    const monthSelect = document.getElementById("reflectionMonthSelect") as HTMLElement | null;

    const showWeek = currentReflectionViewMode === "week";
    const showMonth = currentReflectionViewMode === "month";

    if (weekLabel) weekLabel.style.display = showWeek ? "inline-block" : "none";
    if (weekSelect) weekSelect.style.display = showWeek ? "inline-block" : "none";
    if (monthLabel) monthLabel.style.display = showMonth ? "inline-block" : "none";
    if (monthSelect) monthSelect.style.display = showMonth ? "inline-block" : "none";

    if (showWeek) updateReflectionWeekOptions();
    if (showMonth) updateReflectionMonthOptions();
    loadReflectionViewer();
}

function closeOjtConfirmModal(): void {
    const modal = document.getElementById("ojtConfirmModal");
    if (modal) modal.style.display = "none";
}

function applyDtrDateIntegrityGuardToInputs(): void {
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : "";
    const semesterEndDate = typeof getCurrentSemesterEndDate === "function" ? getCurrentSemesterEndDate() : "";
    ["date", "editDate"].forEach((id) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) {
            if (startDate) input.min = startDate;
            if (semesterEndDate) input.max = semesterEndDate;
        }
    });
}

function populateOjtTimeZoneOptions(selectedTz: string | null = null): void {
    const select = document.getElementById("ojtTimeZone") as HTMLSelectElement | null;
    if (!select) return;
    const zoneOptions = typeof getTimeZoneOptionsByOffset === "function"
        ? getTimeZoneOptionsByOffset()
        : [{ id: DEFAULT_TIMEZONE, label: `(UTC0 | GMT0) ${DEFAULT_TIMEZONE}` }];
    const current = selectedTz || (typeof getCurrentTimeZone === "function" ? getCurrentTimeZone() : DEFAULT_TIMEZONE);
    select.innerHTML = "";
    const options = [...zoneOptions];
    const zoneIds = options.map((z) => z.id);
    if (current && !zoneIds.includes(current) && typeof isValidTimeZoneId === "function" && isValidTimeZoneId(current)) {
        options.unshift({
            id: current,
            label: `${current} (Legacy: uses inverted Etc/GMT naming)`
        });
    }
    options.forEach((tz) => {
        const opt = document.createElement("option");
        opt.value = tz.id;
        opt.textContent = tz.label;
        select.appendChild(opt);
    });
    const finalIds = options.map((z) => z.id);
    if (finalIds.includes(current)) {
        select.value = current;
    } else if (finalIds.includes(DEFAULT_TIMEZONE)) {
        select.value = DEFAULT_TIMEZONE;
    }
}

function saveOjtStartDateFromUI(): void {
    const input = document.getElementById("ojtStartDate") as HTMLInputElement | null;
    if (!input || !input.value) {
        alert("Please choose a valid starting date.");
        return;
    }

    const requiredInput = document.getElementById("ojtRequiredHours") as HTMLInputElement | null;
    const requiredHours = requiredInput ? parseFloat(requiredInput.value) : getCurrentRequiredOjtHours();
    if (!Number.isFinite(requiredHours) || requiredHours < 1) {
        alert("Please enter a valid Required OJT Hours value (minimum 1).");
        return;
    }

    const semesterEndInput = document.getElementById("semesterEndDate") as HTMLInputElement | null;
    const semesterEndDate = semesterEndInput ? semesterEndInput.value : "";
    if (!semesterEndDate) {
        alert("Please choose a valid Semester End Date.");
        return;
    }
    if (semesterEndDate < input.value) {
        alert("Semester End Date cannot be earlier than Starting Date.");
        return;
    }

    const timezoneSelect = document.getElementById("ojtTimeZone") as HTMLSelectElement | null;
    const selectedTz = timezoneSelect ? timezoneSelect.value : getCurrentTimeZone();
    const selectedTzLabel = timezoneSelect && timezoneSelect.selectedOptions && timezoneSelect.selectedOptions.length
        ? timezoneSelect.selectedOptions[0].textContent
        : selectedTz;
    if (!isValidTimeZoneId(selectedTz)) {
        alert("Please choose a valid timezone.");
        return;
    }

    const startText = document.getElementById("ojtConfirmStartDate");
    const requiredText = document.getElementById("ojtConfirmRequiredHours");
    const semesterEndText = document.getElementById("ojtConfirmSemesterEndDate");
    const timezoneText = document.getElementById("ojtConfirmTimeZone");
    if (startText) startText.innerText = input.value;
    if (requiredText) requiredText.innerText = `${requiredHours}h`;
    if (semesterEndText) semesterEndText.innerText = semesterEndDate;
    if (timezoneText) timezoneText.innerText = selectedTzLabel || "";

    const modal = document.getElementById("ojtConfirmModal");
    if (modal) modal.style.display = "flex";
}

async function wipeAllDtrDataForTimelineChange(): Promise<void> {
    const existingRecords = Store.getRecords() || [];
    if (existingRecords.length > 0) {
        const archiveFn = typeof (window as any).archiveRecordsSnapshot === "function" ? (window as any).archiveRecordsSnapshot : null;
        if (typeof archiveFn === "function") {
            try {
                await archiveFn(existingRecords, "timeline_wipe");
            } catch (e) {
                console.warn("Archiving records on timeline wipe failed:", e);
            }
        }
    }

    const allImageIds = (Store.getRecords() || []).flatMap((r) => r.imageIds || []);
    Store.clear();

    if (typeof clearRecordsFromStore === "function") {
        try { await clearRecordsFromStore(); } catch (_) {}
    }

    localStorage.removeItem("dtr");

    if (allImageIds.length && typeof deleteImagesFromStore === "function") {
        try { await deleteImagesFromStore(allImageIds); } catch (_) {}
    }

    if (typeof clearDTRForm === "function") clearDTRForm();
    if (typeof showSummary === "function") showSummary({});
    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
}

async function confirmSaveOjtTimelineSettings(): Promise<void> {
    const input = document.getElementById("ojtStartDate") as HTMLInputElement | null;
    const requiredInput = document.getElementById("ojtRequiredHours") as HTMLInputElement | null;
    const semesterEndInput = document.getElementById("semesterEndDate") as HTMLInputElement | null;
    const timezoneSelect = document.getElementById("ojtTimeZone") as HTMLSelectElement | null;
    if (!input || !input.value || !requiredInput || !semesterEndInput || !timezoneSelect) return;

    const previousStartDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const persistedStartDate = typeof getOjtSettings === "function"
        ? toGmt8DateKey((getOjtSettings() || {}).ojtStartDate)
        : null;
    const originalStartDate = persistedStartDate || previousStartDate;
    const nextStartDate = input.value;
    const startDateChanged = !!persistedStartDate && persistedStartDate !== nextStartDate;

    if (startDateChanged) {
        const proceedWithChange = confirm(
            `You are changing the OJT starting date from ${originalStartDate} to ${nextStartDate}. Week mapping, graphs, and forecasts will be updated. Continue?`
        );
        if (!proceedWithChange) return;
    }

    let shouldWipeData = false;
    if (startDateChanged && originalStartDate && nextStartDate > originalStartDate) {
        shouldWipeData = confirm(
            `The new starting date (${nextStartDate}) is ahead of your original date (${originalStartDate}). All saved DTR data will be wiped. Continue?`
        );
        if (!shouldWipeData) return;
    }

    if (!applyOjtStartDate(nextStartDate)) {
        alert("Unable to save starting date. Please use YYYY-MM-DD format.");
        return;
    }

    const requiredHours = parseFloat(requiredInput.value);
    if (!applyRequiredOjtHours(requiredHours)) {
        alert("Unable to save Required OJT Hours.");
        return;
    }

    if (!semesterEndInput.value || semesterEndInput.value < nextStartDate) {
        alert("Semester End Date cannot be earlier than Starting Date.");
        return;
    }

    if (!applySemesterEndDate(semesterEndInput.value)) {
        alert("Unable to save Semester End Date.");
        return;
    }

    if (!applyTimeZone(timezoneSelect.value)) {
        alert("Unable to save timezone.");
        return;
    }

    if (shouldWipeData) {
        await wipeAllDtrDataForTimelineChange();
    }

    if (typeof hydrateOjtSettingsFromStorage === "function") {
        hydrateOjtSettingsFromStorage();
    }
    if (typeof applyDtrDateIntegrityGuardToInputs === "function") {
        applyDtrDateIntegrityGuardToInputs();
    }

    document.dispatchEvent(new CustomEvent("dtr:timelineChanged", {
        detail: {
            startDate: nextStartDate,
            semesterEndDate: semesterEndInput.value,
            requiredHours,
            timeZone: timezoneSelect.value,
            wipedData: shouldWipeData
        }
    }));

    closeOjtConfirmModal();
    updateReflectionWeekOptions();
    if (typeof updateExportWeekOptions === "function") updateExportWeekOptions();
    loadReflectionViewer();
    renderDailyGraph();
    renderWeeklyGraph();

    const dateInput = document.getElementById("date") as HTMLInputElement | null;
    const activeDate = dateInput && dateInput.value ? dateInput.value : (Store.getRecords().length ? Store.getRecords()[Store.getRecords().length - 1].date : null);
    if (activeDate) updateWeeklyCounter(activeDate);

    if (shouldWipeData) {
        alert(`Timeline saved: ${nextStartDate} | Required: ${requiredHours}h | End: ${semesterEndInput.value} | TZ: ${timezoneSelect.value}\n\nAll DTR records were wiped because the new start date is ahead of the original date.`);
    } else {
        alert(`Timeline saved: ${nextStartDate} | Required: ${requiredHours}h | End: ${semesterEndInput.value} | TZ: ${timezoneSelect.value}`);
    }
}

// --- CARD MANAGEMENT & UI CUSTOMIZATION ---

function toggleCard(btn: HTMLElement): void {
    const card = btn.closest(".card") as HTMLElement | null;
    if (!card) return;
    card.classList.toggle("collapsed");
    const icon = btn.querySelector(".material-symbols-outlined");
    if (icon) {
        icon.textContent = card.classList.contains("collapsed") ? "expand_more" : "expand_less";
    }
    // Persist state
    if (card.id) {
        const collapsedStates = JSON.parse(localStorage.getItem("dtr-card-states") || "{}");
        collapsedStates[card.id] = card.classList.contains("collapsed");
        localStorage.setItem("dtr-card-states", JSON.stringify(collapsedStates));
    }
}

function updateCardRadius(val: string | number): void {
    const parsed = parseInt(String(val), 10);
    const safeVal = Number.isFinite(parsed) ? Math.max(0, Math.min(50, parsed)) : 6;
    document.documentElement.style.setProperty("--card-radius", `${safeVal}px`);
    const valDisplay = document.getElementById("cardRadiusValue");
    if (valDisplay) valDisplay.textContent = `${safeVal}px`;
    localStorage.setItem("dtr-card-radius", String(safeVal));
}

function toggleGlassMode(enabled: boolean): void {
    const cards = document.querySelectorAll(".card");
    cards.forEach(c => {
        if (enabled) c.classList.add("glass-effect");
        else c.classList.remove("glass-effect");
    });
    localStorage.setItem("dtr-glass-mode", String(enabled));
}

function initUICustomization(): void {
    // Restore card order first
    restoreCardOrder();

    // Restore card states
    const collapsedStates = JSON.parse(localStorage.getItem("dtr-card-states") || "{}");
    Object.keys(collapsedStates).forEach(id => {
        if (collapsedStates[id]) {
            const card = document.getElementById(id);
            if (card) {
                card.classList.add("collapsed");
                const btn = card.querySelector(".card-control-btn span");
                if (btn) btn.textContent = "expand_more";
            }
        }
    });

    // Restore radius
    const savedRadius = localStorage.getItem("dtr-card-radius") || "6";
    updateCardRadius(savedRadius);
    const radiusInput = document.getElementById("cardRadiusRange") as HTMLInputElement | null;
    if (radiusInput) radiusInput.value = savedRadius;

    // Restore glass mode
    const glassMode = localStorage.getItem("dtr-glass-mode") === "true";
    toggleGlassMode(glassMode);
    const glassToggle = document.getElementById("glassModeToggle") as HTMLInputElement | null;
    if (glassToggle) glassToggle.checked = glassMode;

    // Restore card dragging preference
    const draggingEnabled = localStorage.getItem("dtr-card-draggable") === "true";
    toggleCardDragging(draggingEnabled);

    // Restore hardware telemetry visibility & consent
    const hwTelemetry = localStorage.getItem("dtr-hw-telemetry") !== "false";
    toggleHardwareTelemetry(hwTelemetry);

    const hwConsent = localStorage.getItem("dtr-hw-telemetry-consent") !== "deny";
    const consentToggle = document.getElementById("hardwareTelemetryConsentToggle") as HTMLInputElement | null;
    if (consentToggle) consentToggle.checked = hwConsent;
}

// --- CARD DRAG AND DROP REORDERING ---
const DRAGGABLE_CARDS_SELECTOR = ".container > .card:not(.static-card), .container > #summary, .telemetry-stats-grid > .card:not(.static-card)";
let dragSrcEl: HTMLElement | null = null;

function handleCardControlPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("input, select, textarea, button, a, label, .pace-slider-wrap, .chart-controls, .card-controls")) {
        const card = target.closest(".card[draggable='true']") as HTMLElement | null;
        if (card) {
            card.setAttribute("draggable", "false");
            const restore = () => {
                card.setAttribute("draggable", "true");
                window.removeEventListener("pointerup", restore, true);
                window.removeEventListener("pointercancel", restore, true);
            };
            window.addEventListener("pointerup", restore, true);
            window.addEventListener("pointercancel", restore, true);
        }
    }
}

function handleDragStart(this: HTMLElement, e: DragEvent): void {
    const target = e.target as HTMLElement;
    if (target && target.closest('input, select, textarea, button, a, option, label, .pace-slider-wrap, .chart-controls, .card-controls')) {
        e.preventDefault();
        return;
    }
    
    dragSrcEl = this;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.id || '');
    }
    this.classList.add('dragging');
}

function handleDragOver(this: HTMLElement, e: DragEvent): boolean {
    if (e.preventDefault) {
        e.preventDefault();
    }
    if (dragSrcEl && dragSrcEl.parentNode === this.parentNode && dragSrcEl !== this) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        
        const parent = this.parentNode as HTMLElement;
        const children = Array.from(parent.children);
        const srcIndex = children.indexOf(dragSrcEl);
        const targetIndex = children.indexOf(this);
        
        if (srcIndex < targetIndex) {
            parent.insertBefore(dragSrcEl, this.nextSibling);
        } else {
            parent.insertBefore(dragSrcEl, this);
        }
    } else {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    }
    return false;
}

function handleDragEnter(this: HTMLElement): void {
    if (dragSrcEl && dragSrcEl.parentNode === this.parentNode && dragSrcEl !== this) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(this: HTMLElement): void {
    this.classList.remove('drag-over');
}

function handleDrop(this: HTMLElement, e: DragEvent): boolean {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (dragSrcEl) {
        this.classList.remove('drag-over');
        saveCardOrder();
    }
    return false;
}

function handleDragEnd(this: HTMLElement): void {
    this.classList.remove('dragging');
    const draggableCards = document.querySelectorAll(DRAGGABLE_CARDS_SELECTOR);
    draggableCards.forEach(card => {
        card.classList.remove('drag-over');
    });
}

function saveCardOrder(): void {
    const savedOrder: Record<string, string[]> = JSON.parse(localStorage.getItem("dtr-card-order") || "{}");
    const parents = new Set<HTMLElement>();
    const draggableCards = document.querySelectorAll(DRAGGABLE_CARDS_SELECTOR);
    draggableCards.forEach(card => {
        if (card.parentNode) {
            parents.add(card.parentNode as HTMLElement);
        }
    });
    
    parents.forEach(parent => {
        let parentKey = parent.id;
        if (!parentKey && parent.classList.contains("container")) {
            parentKey = "container";
        } else if (!parentKey) {
            parentKey = Array.from(parent.classList).join(".");
        }
        
        const cards = Array.from(parent.children).filter(child => (child.classList.contains("card") && !child.classList.contains("static-card")) || child.id === "summary") as HTMLElement[];
        savedOrder[parentKey] = cards.map(c => c.id).filter(id => id);
    });
    localStorage.setItem("dtr-card-order", JSON.stringify(savedOrder));
}

function restoreCardOrder(): void {
    const savedOrder: Record<string, string[]> = JSON.parse(localStorage.getItem("dtr-card-order") || "{}");
    const parents = new Set<HTMLElement>();
    const draggableCards = document.querySelectorAll(DRAGGABLE_CARDS_SELECTOR);
    draggableCards.forEach(card => {
        if (card.parentNode) {
            parents.add(card.parentNode as HTMLElement);
        }
    });
    
    parents.forEach(parent => {
        let parentKey = parent.id;
        if (!parentKey && parent.classList.contains("container")) {
            parentKey = "container";
        } else if (!parentKey) {
            parentKey = Array.from(parent.classList).join(".");
        }
        
        const order = savedOrder[parentKey];
        if (order && Array.isArray(order)) {
            const children = Array.from(parent.children) as HTMLElement[];
            order.forEach(id => {
                const child = children.find(c => c.id === id);
                if (child) {
                    parent.appendChild(child);
                }
            });
            children.forEach(child => {
                if (child.parentNode === parent) {
                    parent.appendChild(child);
                }
            });
        }
    });
}

function toggleCardDragging(enabled: boolean): void {
    localStorage.setItem("dtr-card-draggable", String(enabled));
    
    const container = document.querySelector(".container");
    if (!container) return;
    
    const draggableCards = document.querySelectorAll(DRAGGABLE_CARDS_SELECTOR) as NodeListOf<HTMLElement>;
    
    if (enabled) {
        document.addEventListener("pointerdown", handleCardControlPointerDown as EventListener, true);
        container.classList.add("card-dragging-enabled");
        draggableCards.forEach(card => {
            card.setAttribute("draggable", "true");
            card.addEventListener("dragstart", handleDragStart as unknown as EventListener);
            card.addEventListener("dragover", handleDragOver as unknown as EventListener);
            card.addEventListener("dragenter", handleDragEnter as unknown as EventListener);
            card.addEventListener("dragleave", handleDragLeave as unknown as EventListener);
            card.addEventListener("drop", handleDrop as unknown as EventListener);
            card.addEventListener("dragend", handleDragEnd as unknown as EventListener);
        });
    } else {
        document.removeEventListener("pointerdown", handleCardControlPointerDown as EventListener, true);
        container.classList.remove("card-dragging-enabled");
        draggableCards.forEach(card => {
            card.removeAttribute("draggable");
            card.removeEventListener("dragstart", handleDragStart as unknown as EventListener);
            card.removeEventListener("dragover", handleDragOver as unknown as EventListener);
            card.removeEventListener("dragenter", handleDragEnter as unknown as EventListener);
            card.removeEventListener("dragleave", handleDragLeave as unknown as EventListener);
            card.removeEventListener("drop", handleDrop as unknown as EventListener);
            card.removeEventListener("dragend", handleDragEnd as unknown as EventListener);
        });
    }
    
    const toggle = document.getElementById("cardDraggableToggle") as HTMLInputElement | null;
    if (toggle) toggle.checked = enabled;
}

function openSettingsModal(): void {
    const modal = document.getElementById("settingsModal");
    if (modal) {
        modal.style.display = "flex";
        const localTheme = localStorage.getItem("user-theme") || "f1";
        const themeSelect = document.getElementById("themeSelect") as HTMLSelectElement | null;
        if (themeSelect) themeSelect.value = localTheme;
        if (typeof syncF1LightToggleLabel === "function") {
            syncF1LightToggleLabel();
        }
    }
}

function closeSettingsModal(): void {
    const modal = document.getElementById("settingsModal");
    if (modal) modal.style.display = "none";
}

function toggleHardwareTelemetry(enabled: boolean): void {
    localStorage.setItem("dtr-hw-telemetry", String(enabled));
    const card = document.getElementById("hardwareTelemetryCard");
    if (card) {
        card.style.display = enabled ? "block" : "none";
    }
    const toggle = document.getElementById("hardwareTelemetryToggle") as HTMLInputElement | null;
    if (toggle) toggle.checked = enabled;
}

function toggleHardwareConsent(allowed: boolean): void {
    localStorage.setItem("dtr-hw-telemetry-consent", allowed ? "allow" : "deny");
    const consentToggle = document.getElementById("hardwareTelemetryConsentToggle") as HTMLInputElement | null;
    if (consentToggle) consentToggle.checked = allowed;
    if (typeof window !== "undefined" && (window as any).HardwareMonitor) {
        (window as any).HardwareMonitor.setConsent(allowed);
    }
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        initUICustomization();
    });
}

export {
    changeSortMode,
    getReflectionSelectedWeek,
    updateReflectionWeekOptions,
    getReflectionSelectedMonth,
    updateReflectionMonthOptions,
    changeReflectionViewMode,
    closeOjtConfirmModal,
    applyDtrDateIntegrityGuardToInputs,
    populateOjtTimeZoneOptions,
    saveOjtStartDateFromUI,
    wipeAllDtrDataForTimelineChange,
    confirmSaveOjtTimelineSettings,
    toggleCard,
    updateCardRadius,
    toggleGlassMode,
    initUICustomization,
    toggleCardDragging,
    saveCardOrder,
    restoreCardOrder,
    openSettingsModal,
    closeSettingsModal,
    toggleHardwareTelemetry,
    toggleHardwareConsent
};

if (typeof window !== "undefined") {
    (window as any).updateReflectionWeekOptions = updateReflectionWeekOptions;
    (window as any).updateReflectionMonthOptions = updateReflectionMonthOptions;
    (window as any).toggleCard = toggleCard;
    (window as any).toggleHardwareConsent = toggleHardwareConsent;
}

