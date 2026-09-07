/**
 * DTR CENTRAL MAIN ENTRY POINT
 * Strict ES Module architecture - Centralized event delegation and module wiring
 */

import { Store } from '../scripts/store';
import { SecurityMonitor } from '../scripts/utils/security-monitor';
import { DTRI18N } from '../scripts/dtr-i18n';
import { ThemeSync } from '../scripts/theme-sync';
import { PageLoader } from '../scripts/components/page-loader';
import '../scripts/diagnostic';
import {
    hydrateOjtSettingsFromStorage,
    getCurrentRequiredOjtHours,
    getCurrentSemesterEndDate,
    setTheme,
    syncF1LightToggleLabel,
    toggleF1LightMode,
    currentReflectionViewMode
} from '../scripts/core/dtr-engine';
import {
    loadDTRRecords,
    submitDTR,
    deleteLastRecord,
    clearAllRecords,
    hardClearAllData,
    openClearAllDataModal,
    closeClearAllDataModal,
    selectClearDataOption,
    executeClearAllData,
    updateClearAllDataModalUI
} from '../scripts/dtr-storage';
import {
    updateExportWeekOptions,
    updateExportWeekRangeLabel,
    exportPDF,
    exportWeeklyPDF,
    exportDOCX,
    exportWeeklyDOCX,
    exportRecordsJSON,
    exportRecordsTOML,
    handleJsonImportFile,
    handleTomlImportFile
} from '../scripts/dtr-exports';
import {
    showSummary,
    updateWeeklyCounter,
    loadReflectionViewer,
    closeEditModal,
    saveEditModal,
    clearDTRForm,
    openEditModal
} from '../scripts/ui/dtr-view';
import {
    renderDailyGraph,
    renderWeeklyGraph
} from '../scripts/dtr-graphs';
import {
    renderCalendarExportPreview,
    exportCalendarImage
} from '../scripts/dtr-calendar-export';
import {
    closePdfPreview,
    triggerPdfDownload,
    closeJsonExportPreview,
    confirmJsonExportDownload,
    closeJsonImportPreviewModal,
    confirmJsonImportToForm,
    bulkImportAllRecords
} from '../scripts/dtr-exports';
import {
    updateReflectionWeekOptions,
    updateReflectionMonthOptions,
    changeReflectionViewMode,
    changeSortMode,
    populateOjtTimeZoneOptions,
    applyDtrDateIntegrityGuardToInputs,
    saveOjtStartDateFromUI,
    confirmSaveOjtTimelineSettings,
    closeOjtConfirmModal,
    openSettingsModal,
    closeSettingsModal,
    toggleCard,
    updateCardRadius,
    toggleGlassMode,
    toggleCardDragging,
    toggleHardwareTelemetry,
    toggleHardwareConsent,
    initUICustomization
} from '../scripts/dtr-ui-aux.js';


import {
    updateStorageVisualizer,
    transferRecordsToIndexedDB,
    transferRecordsToLocalStorage,
    clearDuplicateIndexedDbRecords,
    optimizeStorage,
    restoreOptimizedImages,
    toggleStorageBatchMode
} from '../scripts/dtr-storage-aux.js';

import {
    openArchiveViewerModal,
    closeArchiveViewerModal,
    onArchiveSnapshotChanged,
    switchArchiveViewMode,
    handleRestoreSelectedSnapshot,
    handleDeleteSelectedSnapshot,
    handleManualArchiveLiveRecords,
    handleExportSelectedSnapshot,
    ArchiveViewMode
} from '../scripts/ui/archive-viewer.js';
import { hardwareMonitorInstance } from '../scripts/components/hardware-monitor';

// Action Whitelist Dispatch Map
const ACTION_DISPATCH: Record<string, (el: HTMLElement, ev: Event) => void> = {
    'submit-dtr': () => submitDTR(),
    'delete-last-record': () => deleteLastRecord(),
    'clear-all-records': () => clearAllRecords(),
    'clear-dtr-form': () => clearDTRForm(),
    'hard-clear-all-data': () => openClearAllDataModal(),
    'close-clear-all-data-modal': () => closeClearAllDataModal(),
    'select-clear-data-option': (el) => {
        const opt = el.getAttribute('data-option') as 'keep-archives' | 'delete-altogether' | null;
        if (opt) selectClearDataOption(opt);
    },
    'execute-clear-all-data': () => executeClearAllData(),
    'trigger-json-import': () => (document.getElementById('jsonImportInput') as HTMLElement | null)?.click(),
    'trigger-toml-import': () => (document.getElementById('tomlImportInput') as HTMLElement | null)?.click(),
    'export-pdf': () => exportPDF(),
    'export-weekly-pdf': () => exportWeeklyPDF(),
    'export-docx': () => exportDOCX(),
    'export-weekly-docx': () => exportWeeklyDOCX(),
    'export-json': () => exportRecordsJSON(),
    'export-toml': () => exportRecordsTOML(),
    'toggle-f1-light': () => toggleF1LightMode(),
    'open-faq': () => { window.location.href = 'faq.html'; },
    'open-settings': () => openSettingsModal(),
    'close-settings': () => closeSettingsModal(),
    'close-edit-modal': () => closeEditModal(),
    'save-edit-modal': () => saveEditModal(),
    'transfer-to-idb': (el) => transferRecordsToIndexedDB(el),
    'transfer-to-local': (el) => transferRecordsToLocalStorage(el),
    'clear-idb-dupes': (el) => clearDuplicateIndexedDbRecords(el),
    'optimize-storage': (el) => optimizeStorage(el),
    'restore-optimized': (el) => restoreOptimizedImages(el),
    'save-timeline': () => saveOjtStartDateFromUI(),
    'confirm-save-timeline': () => confirmSaveOjtTimelineSettings(),
    'close-confirm-modal': () => closeOjtConfirmModal(),
    'toggle-storage-batch': () => toggleStorageBatchMode(),
    'toggle-card': (el) => toggleCard(el),
    'refresh-calendar-preview': () => renderCalendarExportPreview(),
    'export-calendar-image': () => exportCalendarImage(),
    'close-json-import-modal': () => closeJsonImportPreviewModal(),
    'bulk-import-all': () => bulkImportAllRecords(),
    'confirm-json-import': () => confirmJsonImportToForm(),
    'close-pdf-preview': () => closePdfPreview(),
    'download-pdf': () => triggerPdfDownload(),
    'close-json-export-preview': () => closeJsonExportPreview(),
    'confirm-json-export-download': () => confirmJsonExportDownload(),
    'edit-record': (el) => openEditModal(el),
    'open-archive-viewer': () => openArchiveViewerModal(),
    'close-archive-viewer': () => closeArchiveViewerModal(),
    'switch-archive-tab': (el) => {
        const mode = el.getAttribute('data-archive-view') as ArchiveViewMode;
        if (mode) switchArchiveViewMode(mode);
    },
    'restore-archive-snapshot': () => handleRestoreSelectedSnapshot(),
    'delete-archive-snapshot': () => handleDeleteSelectedSnapshot(),
    'manual-archive-live': () => handleManualArchiveLiveRecords(),
    'export-archive-snapshot': () => handleExportSelectedSnapshot('json'),
    'toggle-hw-consent': () => {
        const allowed = hardwareMonitorInstance.isAllowed();
        toggleHardwareConsent(!allowed);
    },
    'allow-hw-telemetry': () => toggleHardwareConsent(true),
    'deny-hw-telemetry': () => toggleHardwareConsent(false)
};

function handleGlobalClick(ev: MouseEvent): void {
    const target = (ev.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (!action || !ACTION_DISPATCH[action]) return;

    ev.preventDefault();
    try {
        ACTION_DISPATCH[action](target, ev);
    } catch (err) {
        SecurityMonitor.reportIncident({ type: 'EVENT_HANDLER_ERROR', action, error: err });
    }
}

function handleGlobalChange(ev: Event): void {
    const target = ev.target as HTMLElement;
    if (!target) return;

    if (target.id === 'jsonImportInput') {
        handleJsonImportFile(ev);
    } else if (target.id === 'tomlImportInput') {
        handleTomlImportFile(ev);
    } else if (target.id === 'reflectionViewMode') {
        changeReflectionViewMode((target as HTMLSelectElement).value);
    } else if (target.id === 'reflectionWeekSelect' || target.id === 'reflectionMonthSelect') {
        loadReflectionViewer();
    } else if (target.id === 'reflectionSortMode' || target.id === 'sortSelect') {
        changeSortMode((target as HTMLSelectElement).value);
    } else if (target.id === 'themeSelect') {
        setTheme((target as HTMLSelectElement).value);
    } else if (target.id === 'glassModeToggle') {
        toggleGlassMode((target as HTMLInputElement).checked);
    } else if (target.id === 'cardDraggableToggle') {
        toggleCardDragging((target as HTMLInputElement).checked);
    } else if (target.id === 'cardRadiusRange') {
        updateCardRadius((target as HTMLInputElement).value);
    } else if (target.id === 'hardwareTelemetryToggle') {
        toggleHardwareTelemetry((target as HTMLInputElement).checked);
    } else if (target.id === 'hardwareTelemetryConsentToggle') {
        toggleHardwareConsent((target as HTMLInputElement).checked);
    } else if (target.id === 'storageBatchMode') {
        toggleStorageBatchMode();
    } else if (target.id === 'archiveSnapshotSelect') {
        onArchiveSnapshotChanged((target as HTMLSelectElement).value);
    }
}

async function initApplication(): Promise<void> {
    if (typeof window !== 'undefined') {
        Object.assign(window as any, {
            loadReflectionViewer,
            showSummary,
            updateWeeklyCounter,
            clearDTRForm,
            openEditModal,
            closeEditModal,
            saveEditModal,
            renderDailyGraph,
            renderWeeklyGraph,
            updateExportWeekOptions,
            updateExportWeekRangeLabel,
            updateReflectionWeekOptions,
            updateReflectionMonthOptions,
            updateStorageVisualizer,
            bulkImportAllRecords,
            confirmJsonImportToForm,
            handleJsonImportFile,
            handleTomlImportFile
        });
    }

    SecurityMonitor.verifyDataIntegrity();

    // 1. Initial i18n Bootstrap
    try {
        await DTRI18N.bootstrap();
    } catch (e) {
        console.warn('i18n bootstrap notice:', e);
    }

    // 2. Settings & Store Hydration
    const savedOjt = hydrateOjtSettingsFromStorage();
    const records = await loadDTRRecords();
    Store.setRecords(records);

    // 3. Theme & UI Customization Init
    const localTheme = ThemeSync.getLocalTheme();
    setTheme(localTheme, { broadcast: false });
    syncF1LightToggleLabel();
    initUICustomization();
    hardwareMonitorInstance.init();

    // 4. Form inputs setup
    const startInput = document.getElementById("ojtStartDate") as HTMLInputElement;
    if (startInput && savedOjt?.startDateKey) {
        startInput.value = savedOjt.startDateKey;
    }
    const requiredHoursInput = document.getElementById("ojtRequiredHours") as HTMLInputElement;
    if (requiredHoursInput) {
        requiredHoursInput.value = String(savedOjt?.requiredHours || getCurrentRequiredOjtHours());
    }
    const semesterEndInput = document.getElementById("semesterEndDate") as HTMLInputElement;
    if (semesterEndInput) {
        semesterEndInput.value = savedOjt?.semesterEndDateKey || getCurrentSemesterEndDate() || "";
    }

    populateOjtTimeZoneOptions(savedOjt?.timeZone || null);
    applyDtrDateIntegrityGuardToInputs();

    const reflectionViewSelect = document.getElementById("reflectionViewMode") as HTMLSelectElement;
    if (reflectionViewSelect) {
        const savedViewMode = (typeof localStorage !== "undefined" && localStorage.getItem("dtr-reflection-view-mode") as any) || currentReflectionViewMode || "week";
        reflectionViewSelect.value = savedViewMode;
        changeReflectionViewMode(savedViewMode);
    }

    // 5. Initial Render
    loadReflectionViewer();
    renderDailyGraph();
    renderWeeklyGraph();

    const allRecords = Store.getRecords();
    if (allRecords.length) {
        showSummary(allRecords[allRecords.length - 1]);
        updateWeeklyCounter(allRecords[allRecords.length - 1].date);
    } else {
        showSummary({});
        updateWeeklyCounter(null);
    }

    updateExportWeekOptions();
    updateReflectionWeekOptions();
    updateExportWeekRangeLabel();
    updateStorageVisualizer();

    // 6. Global Event Delegation Attachment
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('change', handleGlobalChange);
    document.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            const target = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
            if (target && target.getAttribute('role') === 'button') {
                ev.preventDefault();
                target.click();
            }
        }
    });
    document.addEventListener('input', (ev: Event) => {
        const target = ev.target as HTMLElement;
        if (target && target.id === 'cardRadiusRange') {
            updateCardRadius((target as HTMLInputElement).value);
        }
    });

    // Image Preview setup
    const imagesInput = document.getElementById("images") as HTMLInputElement;
    if (imagesInput) {
        imagesInput.addEventListener("change", function () {
            const preview = document.getElementById("imagePreview");
            if (!preview) return;
            preview.innerHTML = "";
            const files = Array.from(this.files || []);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = document.createElement("img");
                    img.src = String(e.target?.result || "");
                    img.style.width = "80px";
                    img.style.height = "80px";
                    img.style.objectFit = "cover";
                    img.style.borderRadius = "5px";
                    preview.appendChild(img);
                };
                reader.readAsDataURL(file);
            });
        });
    }

    // Real-time graph sync on input
    const syncGraphsRealTime = (dateId: string, hoursId: string) => {
        const dateEl = document.getElementById(dateId) as HTMLInputElement;
        const hoursEl = document.getElementById(hoursId) as HTMLInputElement;
        if (!dateEl || !hoursEl) return;
        const dateVal = dateEl.value;
        const hoursVal = parseFloat(hoursEl.value);
        if (!dateVal || isNaN(hoursVal)) {
            renderDailyGraph();
            renderWeeklyGraph();
            return;
        }
        const tempRecord = {
            date: dateVal,
            hours: hoursVal,
            reflection: '',
            accomplishments: [],
            tools: [],
            images: [],
            imageIds: [],
            personalHours: 0,
            sleepHours: 0,
            recoveryHours: 0,
            commuteTotal: 0,
            commuteProductive: 0,
            identityScore: null
        };
        const mergedRecords = Store.getRecords().filter(r => r.date !== dateVal);
        mergedRecords.push(tempRecord);
        mergedRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        renderDailyGraph(mergedRecords);
        renderWeeklyGraph(mergedRecords);
    };

    ['date', 'hours'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => syncGraphsRealTime('date', 'hours'));
    });
    ['editDate', 'editHours'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => syncGraphsRealTime('editDate', 'editHours'));
    });

    // 7. Dismiss page loader overlay
    PageLoader.hide();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApplication());
} else {
    initApplication();
}
