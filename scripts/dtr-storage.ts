/**
 * DTR STORAGE MODULE
 * Handles all CRUD operations and data validation
 */

import { SecurityMonitor } from './utils/security-monitor';
import { Store } from './store';
import { toGmt8DateKey, parseDateKeyGmt8 } from './utils/date-utils';
import { saveRecordsToStore, getRecordsFromStore, clearRecordsFromStore, deleteImagesFromStore, saveImageToStore, archiveRecordsSnapshot } from './dtr-image-store';

declare class DailyRecord {
    date: string;
    hours: number;
    reflection: string;
    accomplishments: string[];
    tools: string[];
    images: string[];
    l2Data: any;
    imageIds: string[];
    constructor(date: string, hours: number, reflection: string, accomplishments: string[], tools: string[], images: string[], l2Data: any, imageIds?: string[]);
}

function isQuotaError(e: any): boolean {
    return e && (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        (e.code === 22) ||
        /quota/i.test(e.message || "")
    );
}

function safeSetDTR(data: any[]): boolean {
    try {
        localStorage.setItem("dtr", JSON.stringify(data));
        return true;
    } catch (e: any) {
        if (isQuotaError(e)) {
            alert("Storage full! Try:\n- Run \"Optimize Storage\" to compress images\n- Remove images from older records\n- Export & clear some data");
        } else {
            alert("Failed to save: " + (e.message || e));
        }
        return false;
    }
}

async function deleteLastRecord(): Promise<void> {
    const StoreAny = (window as any).Store || Store;
    if (!StoreAny.getRecords().length) {
        alert("No records to delete.");
        return;
    }
    if (!confirm("Delete the most recent DTR entry?")) return;

    const last = StoreAny.getRecords()[StoreAny.getRecords().length - 1];
    if (last) {
        const archiveFn = typeof archiveRecordsSnapshot === "function" ? archiveRecordsSnapshot : (window as any).archiveRecordsSnapshot;
        if (typeof archiveFn === "function") {
            archiveFn([last], "delete_last_entry").catch(() => {});
        }
    }

    const idsToDelete = (last.imageIds || []).length ? last.imageIds : [];
    StoreAny.popRecord();
    if (!await persistDTR(StoreAny.getRecords())) return;
    if (idsToDelete.length && typeof (window as any).deleteImagesFromStore === "function") {
        (window as any).deleteImagesFromStore(idsToDelete).catch(() => {});
    }

    notifyDTRDataChanged();
    alert("Last DTR entry deleted.");
}

async function clearAllRecords(): Promise<void> {
    const StoreAny = (window as any).Store || Store;
    if (!confirm("This will delete ALL DTR records. Continue?")) return;

    const existingRecords = StoreAny.getRecords() || [];
    if (existingRecords.length > 0) {
        const archiveFn = typeof archiveRecordsSnapshot === "function" ? archiveRecordsSnapshot : (window as any).archiveRecordsSnapshot;
        if (typeof archiveFn === "function") {
            try {
                await archiveFn(existingRecords, "clear_all_records");
            } catch (e) {
                console.warn("Archiving records before clearing failed:", e);
            }
        }
    }

    const allImageIds = (StoreAny.getRecords() || []).flatMap((r: any) => r.imageIds || []);
    StoreAny.clear();
    if (typeof (window as any).clearRecordsFromStore === "function") {
        try { await (window as any).clearRecordsFromStore(); } catch (_) {}
    }
    localStorage.removeItem("dtr");
    if (allImageIds.length && typeof (window as any).deleteImagesFromStore === "function") {
        (window as any).deleteImagesFromStore(allImageIds).catch(() => {});
    }

    notifyDTRDataChanged();
    alert("All DTR records cleared and archived to IndexedDB.");
}

let _selectedClearDataOption: "keep-archives" | "delete-altogether" = "keep-archives";

function selectClearDataOption(option: "keep-archives" | "delete-altogether"): void {
    _selectedClearDataOption = option;
    updateClearAllDataModalUI();
}

function openClearAllDataModal(): void {
    const modal = document.getElementById("clearAllDataModal");
    if (!modal) {
        hardClearAllData();
        return;
    }
    _selectedClearDataOption = "keep-archives";
    updateClearAllDataModalUI();
    modal.style.display = "flex";
}

function closeClearAllDataModal(): void {
    const modal = document.getElementById("clearAllDataModal");
    if (modal) modal.style.display = "none";
}

function updateClearAllDataModalUI(): void {
    const modal = document.getElementById("clearAllDataModal");
    if (!modal) return;
    const isKeepArchives = _selectedClearDataOption === "keep-archives";

    const keepCard = modal.querySelector('.clear-data-option-card[data-option="keep-archives"]') as HTMLElement | null;
    const deleteCard = modal.querySelector('.clear-data-option-card[data-option="delete-altogether"]') as HTMLElement | null;
    const confirmBtn = document.getElementById("confirmClearAllDataBtn") as HTMLButtonElement | null;
    const t = (window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function" ? (window as any).DTRI18N.t : null;

    if (keepCard) {
        keepCard.classList.toggle("active", isKeepArchives);
        keepCard.setAttribute("aria-pressed", String(isKeepArchives));
    }
    if (deleteCard) {
        deleteCard.classList.toggle("active", !isKeepArchives);
        deleteCard.setAttribute("aria-pressed", String(!isKeepArchives));
    }

    if (confirmBtn) {
        if (isKeepArchives) {
            confirmBtn.className = "storage-action-btn storage-action-btn--accent";
            confirmBtn.style.padding = "7px 18px";
            confirmBtn.style.fontWeight = "bold";
            confirmBtn.style.borderRadius = "6px";
            confirmBtn.style.cursor = "pointer";
            confirmBtn.style.background = "var(--accent)";
            confirmBtn.style.color = "#ffffff";
            confirmBtn.setAttribute("data-i18n", "clear_data_keep_archives_btn");
            confirmBtn.textContent = t ? t("clear_data_keep_archives_btn") : "Clear & Keep Archives";
        } else {
            confirmBtn.className = "btn-destructive";
            confirmBtn.style.padding = "7px 18px";
            confirmBtn.style.fontWeight = "bold";
            confirmBtn.style.borderRadius = "6px";
            confirmBtn.style.cursor = "pointer";
            confirmBtn.style.background = "#e10600";
            confirmBtn.style.color = "#ffffff";
            confirmBtn.setAttribute("data-i18n", "clear_data_delete_all_btn");
            confirmBtn.textContent = t ? t("clear_data_delete_all_btn") : "Completely Delete Everything";
        }
    }
}

async function executeClearAllData(): Promise<void> {
    const mode = _selectedClearDataOption;

    if (mode === "keep-archives") {
        const StoreAny = (window as any).Store || Store;
        const existingRecords = StoreAny.getRecords() || [];
        if (existingRecords.length > 0) {
            const archiveFn = typeof archiveRecordsSnapshot === "function" ? archiveRecordsSnapshot : (window as any).archiveRecordsSnapshot;
            if (typeof archiveFn === "function") {
                try {
                    await archiveFn(existingRecords, "clear_all_data");
                } catch (e) {
                    console.warn("Archiving records on clear_all_data failed:", e);
                }
            }
        }

        StoreAny.clear();
        if (typeof clearRecordsFromStore === "function") {
            try { await clearRecordsFromStore(); } catch (_) {}
        } else if (typeof (window as any).clearRecordsFromStore === "function") {
            try { await (window as any).clearRecordsFromStore(); } catch (_) {}
        }

        localStorage.removeItem("dtr");
        localStorage.removeItem("dtr-form-data");

        if (typeof (window as any).clearDTRForm === "function") (window as any).clearDTRForm();
        notifyDTRDataChanged();
        if (typeof (window as any).reloadArchiveSnapshots === "function") {
            try { await (window as any).reloadArchiveSnapshots(); } catch (_) {}
        }

        closeClearAllDataModal();
        const successMsg = (window as any).DTRI18N ? (window as any).DTRI18N.t("cleared_data_keep_archives_success") : "Active records cleared. Your intact data has been preserved in the archives.";
        alert(successMsg);
    } else {
        const confirmMsg = (window as any).DTRI18N ? (window as any).DTRI18N.t("confirm_clear_all_data") : "This will delete ALL DTR records, images, settings, and themes. This action is irreversible. Continue?";
        if (!confirm(confirmMsg)) return;

        localStorage.clear();

        const dbName = "DTRImageStore";
        const deleteRequest = indexedDB.deleteDatabase(dbName);

        deleteRequest.onsuccess = () => {
            const successMsg = (window as any).DTRI18N ? (window as any).DTRI18N.t("cleared_all_data_success") : "All data has been wiped. The page will now reload.";
            alert(successMsg);
            window.location.href = "index.html"; 
        };

        deleteRequest.onerror = () => {
            console.error("Error deleting IndexedDB:", deleteRequest.error);
            alert("Failed to delete image database fully. Please clear site data manually in browser settings.");
            window.location.href = "index.html";
        };

        deleteRequest.onblocked = () => {
            alert("Database deletion blocked. Please close other open DTR tabs and try again.");
        };
    }
}

async function hardClearAllData(): Promise<void> {
    const modal = document.getElementById("clearAllDataModal");
    if (modal) {
        openClearAllDataModal();
        return;
    }

    const confirmMsg = (window as any).DTRI18N ? (window as any).DTRI18N.t("confirm_clear_all_data") : "This will delete ALL DTR records, images, settings, and themes. This action is irreversible. Continue?";
    if (!confirm(confirmMsg)) return;

    localStorage.clear();

    const dbName = "DTRImageStore";
    const deleteRequest = indexedDB.deleteDatabase(dbName);

    deleteRequest.onsuccess = () => {
        const successMsg = (window as any).DTRI18N ? (window as any).DTRI18N.t("cleared_all_data_success") : "All data has been wiped. The page will now reload.";
        alert(successMsg);
        window.location.href = "index.html"; 
    };

    deleteRequest.onerror = () => {
        console.error("Error deleting IndexedDB:", deleteRequest.error);
        alert("Failed to delete image database fully. Please clear site data manually in browser settings.");
        window.location.href = "index.html";
    };

    deleteRequest.onblocked = () => {
        alert("Database deletion blocked. Please close other open DTR tabs and try again.");
    };
}

function checkDataHealth(record: any): boolean {
    const warnings: string[] = [];
    if (record.sleepHours === 0) warnings.push("Sleep Duration is 0");
    if (record.recoveryHours === 0) warnings.push("Recovery Time is 0");
    if (!record.identityScore) warnings.push("Identity Alignment not set");
    
    if (warnings.length > 0) {
        return confirm(`Warning: The following metrics are missing:\n- ${warnings.join("\n- ")}\n\nSave anyway?`);
    }
    return true;
}

async function persistDTR(data: any[]): Promise<boolean> {
    const saveFn = typeof saveRecordsToStore === "function" 
        ? saveRecordsToStore 
        : (window as any).saveRecordsToStore;

    if (typeof saveFn === "function") {
        try {
            await saveFn(data);
            return true;
        } catch (e: any) {
            console.error("Primary record store write failed.", e);
            alert("Failed to save records: " + (e.message || e));
            return false;
        }
    }
    alert("IndexedDB is required but saveRecordsToStore is missing.");
    return false;
}

async function loadDTRRecords(): Promise<any[]> {
    let records: any[] = [];
    const getFn = typeof getRecordsFromStore === "function" 
        ? getRecordsFromStore 
        : (window as any).getRecordsFromStore;

    if (typeof getFn === "function") {
        try {
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
            const stored = await Promise.race([getFn(), timeoutPromise]);
            if (Array.isArray(stored)) records = stored;
        } catch (e: any) {
            console.error("Primary record store read failed.", e);
        }
    }

    // One-time silent migration from localStorage to prevent 5MB quota bloat
    try {
        const fallbackRaw = localStorage.getItem("dtr");
        if (fallbackRaw) {
            const fallback = JSON.parse(fallbackRaw);
            if (Array.isArray(fallback) && fallback.length > 0) {
                if (records.length === 0) {
                    records = fallback;
                    const saveFn = typeof saveRecordsToStore === "function" 
                        ? saveRecordsToStore 
                        : (window as any).saveRecordsToStore;
                    if (typeof saveFn === "function") {
                        await saveFn(fallback);
                    }
                }
            }
            // Clear localStorage forever since IndexedDB is now the master source
            localStorage.removeItem("dtr");
        }
    } catch (_) {}

    if (Array.isArray(records)) {
        // Optimization: Strip legacy Base64 images from the in-memory Store
        // to prevent JS Heap bloat. They will be fetched from IndexedDB on-demand.
        records.forEach(r => {
            if (r.imageIds && r.imageIds.length > 0) {
                r.images = []; // Free up the memory
            }
        });
    }

    return Array.isArray(records) ? records : [];
}

// --- GLOBALS ---
let _storageImportedImageIds: string[] = []; // Temporary store for images from JSON import

function getErrorSummary(err: any): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const name = err.name ? String(err.name) : "Error";
    const message = err.message ? String(err.message) : String(err);
    return `${name}: ${message}`;
}

function submitDTR(): void {
    const dateInput = document.getElementById("date") as HTMLInputElement;
    const hoursInput = document.getElementById("hours") as HTMLInputElement;
    const reflectionInput = document.getElementById("reflection") as HTMLInputElement;

    const date = dateInput ? dateInput.value : "";
    const hours = hoursInput ? parseFloat(hoursInput.value) : NaN;
    const reflection = reflectionInput ? reflectionInput.value : "";

    if (!date || isNaN(hours)) {
        alert("Please enter a valid date and number of hours.");
        return;
    }

    if (typeof SecurityMonitor !== "undefined") {
        if (!SecurityMonitor.scanInput(reflection, "dtr_reflection")) {
            alert("Security Alert: Invalid characters or script tags detected in reflection.");
            return;
        }
    }
    const startDate = typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : null;
    const dateKey = (window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const accompInput = document.getElementById("accomplishments") as HTMLTextAreaElement;
    const accomplishments = accompInput ? accompInput.value.split("\n").filter(a => a.trim() !== "") : [];

    const toolsInput = document.getElementById("tools") as HTMLInputElement;
    const tools = toolsInput ? toolsInput.value.split(",").map(t => t.trim()).filter(t => t !== "") : [];

    if (typeof SecurityMonitor !== "undefined") {
        for (const a of accomplishments) {
            if (!SecurityMonitor.scanInput(a, "dtr_accomplishments")) {
                alert("Security Alert: Invalid characters or script tags detected in accomplishments.");
                return;
            }
        }
        for (const t of tools) {
            if (!SecurityMonitor.scanInput(t, "dtr_tools")) {
                alert("Security Alert: Invalid characters or script tags detected in tools.");
                return;
            }
        }
    }

    const imagesInput = document.getElementById("images") as HTMLInputElement;
    const files = imagesInput && imagesInput.files ? Array.from(imagesInput.files) : [];

    const getVal = (id: string) => {
        const el = document.getElementById(id) as HTMLInputElement;
        return el ? parseFloat(el.value) : 0;
    };
    const getIntVal = (id: string) => {
        const el = document.getElementById(id) as HTMLInputElement;
        return el ? parseInt(el.value) : null;
    };

    // Convert l2Data values to proper types immediately
    const l2Data = {
        personalHours: getVal("personalHours") || 0,
        sleepHours: getVal("sleepHours") || 0,
        recoveryHours: getVal("recoveryHours") || 0,
        commuteTotal: getVal("commuteTotal") || 0,
        commuteProductive: getVal("commuteProductive") || 0,
        identityScore: getIntVal("identityScore") || null
    };

    const recordCheck = new DailyRecord(date, hours, reflection, [], [], [], l2Data);
    if (!checkDataHealth(recordCheck)) return;

    if (files.length > 0 || _storageImportedImageIds.length > 0) {
        const saveFn = typeof saveImageToStore === "function" ? saveImageToStore : (window as any).saveImageToStore;
        Promise.allSettled(files.map((file) => saveFn(file)))
            .then((results) => {
                const uploadedIds = results
                    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
                    .map((r) => r.value);
                
                const finalImageIds = [...new Set([...uploadedIds, ..._storageImportedImageIds])];

                const rejected = results
                    .map((r, index) => ({ r, index }))
                    .filter((x) => x.r.status === "rejected")
                    .map((x) => ({
                        index: x.index,
                        fileName: files[x.index] ? files[x.index].name : "(unknown)",
                        reason: getErrorSummary((x.r as PromiseRejectedResult).reason)
                    }));

                if (rejected.length) {
                    console.warn("Some uploaded images failed to store in IndexedDB.", rejected);
                    alert(`Some images failed to store (${rejected.length}). Saving only successfully uploaded images.`);
                }
                saveRecord(date, hours, reflection, accomplishments, tools, finalImageIds, l2Data);
                _storageImportedImageIds = []; // Clear after use
            })
            .catch((err) => {
                console.error("IndexedDB image save error:", err);
                const finalIds = _storageImportedImageIds.length > 0 ? _storageImportedImageIds : [];
                if (confirm("Failed to save new images to IndexedDB. Save DTR with imported/existing images only?")) {
                    saveRecord(date, hours, reflection, accomplishments, tools, finalIds, l2Data);
                    _storageImportedImageIds = [];
                } else {
                    alert("Submission cancelled.");
                }
            });
    } else {
        saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
    }
}

const compressWorker = new Worker(new URL('../src/workers/image-compressor.ts', import.meta.url), { type: 'module' });
let compressMessageId = 0;
const compressResolvers = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

compressWorker.onmessage = (e: MessageEvent) => {
    const { id, success, buffer, type, error } = e.data;
    const resolver = compressResolvers.get(id);
    if (resolver) {
        if (success) {
            const blob = new Blob([buffer], { type });
            const reader = new FileReader(); // main thread
            reader.onload = () => resolver.resolve(reader.result);
            reader.onerror = () => resolver.reject(new Error("Worker FileReader failed"));
            reader.readAsDataURL(blob);
        } else {
            resolver.reject(new Error(error));
        }
        compressResolvers.delete(id);
    }
};

/**
 * Offloaded background Web Worker image compression
 * Always returns a BASE64 data URL.
 */
function compressImage(input: Blob | string, quality: number = 0.6, maxWidth: number = 1280): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            if (!input) return reject(new Error("No image input provided"));
            
            let blob: Blob;
            if (input instanceof Blob) {
                blob = input;
            } else if (typeof input === "string") {
                if (!input.startsWith("data:image/")) {
                    return reject(new Error("Unsupported or insecure image input URI"));
                }
                const response = await fetch(input);
                blob = await response.blob();
            } else {
                return reject(new Error("Unsupported image input"));
            }
            
            const buffer = await blob.arrayBuffer();
            const id = ++compressMessageId;
            compressResolvers.set(id, { resolve, reject });
            
            compressWorker.postMessage(
                { id, buffer, type: blob.type, quality, maxWidth },
                [buffer]
            );
        } catch (e) {
            reject(e);
        }
    });
}

async function saveRecord(date: string, hours: number, reflection: string, accomplishments: string[], tools: string[], imageIds: string[], l2Data: any): Promise<void> {
    const startDate = typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : null;
    const semesterEndDate = typeof (window as any).getCurrentSemesterEndDate === "function" ? (window as any).getCurrentSemesterEndDate() : null;
    const dateKey = (window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert("DTR Date cannot be earlier than OJT Starting Date " + startDate);
        return;
    }
    if (semesterEndDate && dateKey && dateKey > semesterEndDate) {
        alert("DTR Date cannot be later than Semester End Date " + semesterEndDate);
        return;
    }

    const StoreAny = (window as any).Store || Store;
    const normalizedDate = dateKey || date;
    const record = new DailyRecord(normalizedDate, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []);
    const previous = [...StoreAny.getRecords()];
    const duplicateIndex = StoreAny.getRecords().findIndex((r: any) => ((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(r.date) : r.date) === normalizedDate);

    if (duplicateIndex !== -1) {
        const resolution = await resolveDateConflictModal({
            incomingDate: normalizedDate,
            existingDate: (window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(StoreAny.getRecords()[duplicateIndex].date) : StoreAny.getRecords()[duplicateIndex].date
        });
        if (!resolution) return;

        if (resolution.action === "replace") {
            const oldRec = StoreAny.getRecords()[duplicateIndex];
            if (oldRec && typeof (window as any).archiveRecordsSnapshot === "function") {
                (window as any).archiveRecordsSnapshot([oldRec], "replace_duplicate").catch(() => {});
            }
            StoreAny.removeRecordAt(duplicateIndex);
            StoreAny.addRecord(record);
        } else {
            const nextIncomingDate = resolution.newDate;
            const nextExistingDate = resolution.existingDate;
            const start = typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : null;
            const end = typeof (window as any).getCurrentSemesterEndDate === "function" ? (window as any).getCurrentSemesterEndDate() : null;

            if (start && ((nextIncomingDate && nextIncomingDate < start) || (nextExistingDate && nextExistingDate < start))) {
                alert("DTR Date cannot be earlier than OJT Starting Date " + start);
                return;
            }
            if (end && ((nextIncomingDate && nextIncomingDate > end) || (nextExistingDate && nextExistingDate > end))) {
                alert("DTR Date cannot be later than Semester End Date " + end);
                return;
            }

            if (!nextIncomingDate || !nextExistingDate || nextIncomingDate === nextExistingDate) {
                alert("Incoming and existing dates must both be valid and different.");
                return;
            }

            const incomingClash = StoreAny.getRecords().findIndex((r: any, idx: number) =>
                idx !== duplicateIndex && ((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(r.date) : r.date) === nextIncomingDate
            );
            const existingClash = StoreAny.getRecords().findIndex((r: any, idx: number) =>
                idx !== duplicateIndex && ((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(r.date) : r.date) === nextExistingDate
            );
            if (incomingClash !== -1 || existingClash !== -1) {
                alert("One of the selected dates is already used by another record.");
                return;
            }

            StoreAny.getRecords()[duplicateIndex].date = nextExistingDate;
            record.date = nextIncomingDate;
            StoreAny.addRecord(record);
        }
    } else {
        StoreAny.addRecord(record);
    }
    StoreAny.getRecords().sort((a: any, b: any) => (((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(a.date) : "") || "").localeCompare(((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(b.date) : "") || ""));

    if (!await persistDTR(StoreAny.getRecords())) {
        StoreAny.setRecords(previous);
        if (imageIds && imageIds.length > 0 && confirm("Save without images to free space?")) {
            if (typeof (window as any).deleteImagesFromStore === "function") {
                (window as any).deleteImagesFromStore(imageIds);
            }
            await saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
        }
        return;
    }

    notifyDTRDataChanged(record.date);
    if (typeof (window as any).clearDTRForm === "function") (window as any).clearDTRForm();
    alert("Daily DTR saved and form cleared!");
}

async function bulkMergeRecords(importedList: any[]): Promise<void> {
    if (!Array.isArray(importedList) || importedList.length === 0) return;

    const StoreAny = (window as any).Store || Store;
    const previous = [...StoreAny.getRecords()];
    const existingMap: { [key: string]: any } = Object.create(null);
    StoreAny.getRecords().forEach((r: any) => {
        const dk = (window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(r.date) : r.date;
        existingMap[dk] = r;
    });

    const startDate = typeof (window as any).getCurrentOjtStartDate === "function" ? (window as any).getCurrentOjtStartDate() : null;
    const semesterEndDate = typeof (window as any).getCurrentSemesterEndDate === "function" ? (window as any).getCurrentSemesterEndDate() : null;

    let newCount = 0;
    let updateCount = 0;
    let imageCount = 0;

    for (const raw of importedList) {
        const dk = (window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(raw.date) : raw.date;
        
        if ((startDate && dk < startDate) || (semesterEndDate && dk > semesterEndDate)) {
            console.warn(`Skipping record for date ${dk} outside configured OJT timeline bounds [${startDate} .. ${semesterEndDate}]`);
            continue;
        }

        let finalImageIds = Array.isArray(raw.imageIds) ? [...raw.imageIds] : [];
        if (Array.isArray(raw.embeddedImages) && raw.embeddedImages.length > 0) {
            try {
                const saveFn = typeof saveImageToStore === "function" ? saveImageToStore : (window as any).saveImageToStore;
                const savedIds = await Promise.all(
                    raw.embeddedImages.map((imgData: any) => saveFn(imgData))
                );
                finalImageIds = [...new Set([...finalImageIds, ...savedIds])];
                imageCount += savedIds.length;
            } catch (e) {
                console.warn("Failed to restore some images for date:", dk, e);
            }
        }

        const record = {
            date: dk,
            hours: raw.hours,
            reflection: raw.reflection || "",
            accomplishments: raw.accomplishments || [],
            tools: raw.tools || [],
            images: [],
            personalHours: raw.personalHours || 0,
            sleepHours: raw.sleepHours || 0,
            recoveryHours: raw.recoveryHours || 0,
            commuteTotal: raw.commuteTotal || 0,
            commuteProductive: raw.commuteProductive || 0,
            identityScore: raw.identityScore || 0,
            imageIds: finalImageIds
        };

        if (existingMap[dk]) {
            updateCount++;
            if (typeof (window as any).archiveRecordsSnapshot === "function") {
                (window as any).archiveRecordsSnapshot([existingMap[dk]], "merge_override").catch(() => {});
            }
            const oldIds = existingMap[dk].imageIds || [];
            const idsToDelete = oldIds.filter((id: string) => !finalImageIds.includes(id));
            if (idsToDelete.length > 0 && typeof (window as any).deleteImagesFromStore === "function") {
                (window as any).deleteImagesFromStore(idsToDelete).catch(() => {});
            }
        } else {
            newCount++;
        }
        existingMap[dk] = record;
    }

    StoreAny.setRecords(Object.values(existingMap));
    StoreAny.getRecords().sort((a: any, b: any) => (((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(a.date) : "") || "").localeCompare(((window as any).toGmt8DateKey ? (window as any).toGmt8DateKey(b.date) : "") || ""));

    if (!await persistDTR(StoreAny.getRecords())) {
        StoreAny.setRecords(previous);
        alert("Bulk import failed due to storage limits.");
        return;
    }

    notifyDTRDataChanged();

    alert(`Bulk import complete!\n- ${newCount} new records added\n- ${updateCount} existing records updated\n- ${imageCount} images restored`);
}

function resolveDateConflictModal({ incomingDate, existingDate }: { incomingDate: string, existingDate: string }): Promise<any> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: any) => {
            if (settled) return;
            settled = true;
            modal.remove();
            resolve(value);
        };

        const modal = document.createElement("div");
        modal.style.cssText = [
            "position:fixed",
            "inset:0",
            "background:rgba(0,0,0,0.7)",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "z-index:10000",
            "padding:16px"
        ].join(";");

        const panel = document.createElement("div");
        panel.style.cssText = [
            "width:min(540px,100%)",
            "background:var(--panel)",
            "border:1px solid var(--border)",
            "border-radius:10px",
            "padding:16px",
            "box-shadow:0 10px 30px rgba(0,0,0,0.45)",
            "color:var(--text)"
        ].join(";");

        const conflictTitle = "Date Conflict Detected";
        panel.innerHTML = `
            <h3 style="margin:0 0 10px 0; color:var(--accent);">${conflictTitle}</h3>
            <p style="margin:0 0 12px 0;">A record already exists for this date. Choose how to proceed.</p>
            <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:12px;">
                <label style="display:flex; flex-direction:column; gap:4px;">
                    <span>New Entry Date</span>
                    <input id="conflictNewDate" type="date" style="background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px;">
                </label>
                <label style="display:flex; flex-direction:column; gap:4px;">
                    <span>Existing Record Date</span>
                    <input id="conflictExistingDate" type="date" style="background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px;">
                </label>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                <button id="conflictCancelBtn" type="button" style="background:transparent; color:var(--text); border:1px solid var(--border);">Cancel</button>
                <button id="conflictReplaceBtn" type="button" style="background:var(--accent); color:#fff;">Replace Existing</button>
                <button id="conflictKeepBothBtn" type="button" style="background:var(--color-good); color:#fff;">Keep Both (Apply Dates)</button>
            </div>
        `;
        modal.appendChild(panel);
        document.body.appendChild(modal);

        const newInput = panel.querySelector("#conflictNewDate") as HTMLInputElement;
        const existingInput = panel.querySelector("#conflictExistingDate") as HTMLInputElement;
        if (newInput) newInput.value = incomingDate;
        if (existingInput) existingInput.value = existingDate;

        const cancelBtn = panel.querySelector("#conflictCancelBtn");
        if (cancelBtn) cancelBtn.addEventListener("click", () => finish(null));
        
        const replaceBtn = panel.querySelector("#conflictReplaceBtn");
        if (replaceBtn) replaceBtn.addEventListener("click", () => {
            finish({
                action: "replace",
                newDate: (newInput && newInput.value) || incomingDate,
                existingDate: (existingInput && existingInput.value) || existingDate
            });
        });
        
        const keepBothBtn = panel.querySelector("#conflictKeepBothBtn");
        if (keepBothBtn) keepBothBtn.addEventListener("click", () => {
            finish({
                action: "keep-both",
                newDate: (newInput && newInput.value) || incomingDate,
                existingDate: (existingInput && existingInput.value) || existingDate
            });
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) finish(null);
        });
    });
}

function notifyDTRDataChanged(targetDate?: string): void {
    const StoreAny = (window as any).Store || Store;
    const records = StoreAny.getRecords() || [];

    if (typeof (window as any).updateReflectionWeekOptions === "function") {
        (window as any).updateReflectionWeekOptions();
    }
    if (typeof (window as any).updateReflectionMonthOptions === "function") {
        (window as any).updateReflectionMonthOptions();
    }
    if (typeof (window as any).updateExportWeekOptions === "function") {
        (window as any).updateExportWeekOptions();
    }
    if (typeof (window as any).loadReflectionViewer === "function") {
        (window as any).loadReflectionViewer();
    }
    if (typeof (window as any).renderDailyGraph === "function") {
        (window as any).renderDailyGraph();
    }
    if (typeof (window as any).renderWeeklyGraph === "function") {
        (window as any).renderWeeklyGraph();
    }
    if (records.length > 0) {
        const latest = records[records.length - 1];
        const dateToUse = targetDate || latest.date;
        if (typeof (window as any).showSummary === "function") {
            (window as any).showSummary(latest);
        }
        if (typeof (window as any).updateWeeklyCounter === "function") {
            (window as any).updateWeeklyCounter(dateToUse);
        }
    } else {
        if (typeof (window as any).showSummary === "function") {
            (window as any).showSummary({});
        }
        if (typeof (window as any).updateWeeklyCounter === "function") {
            (window as any).updateWeeklyCounter(null);
        }
    }

    if (typeof (window as any).updateStorageVisualizer === "function") {
        (window as any).updateStorageVisualizer();
    }
}

if (typeof window !== "undefined") {
    (window as any).openClearAllDataModal = openClearAllDataModal;
    (window as any).closeClearAllDataModal = closeClearAllDataModal;
    (window as any).selectClearDataOption = selectClearDataOption;
    (window as any).updateClearAllDataModalUI = updateClearAllDataModalUI;
    (window as any).executeClearAllData = executeClearAllData;
    (window as any).hardClearAllData = hardClearAllData;
    (window as any).bulkMergeRecords = bulkMergeRecords;
    (window as any).notifyDTRDataChanged = notifyDTRDataChanged;
}

export {
    isQuotaError,
    safeSetDTR,
    deleteLastRecord,
    clearAllRecords,
    hardClearAllData,
    openClearAllDataModal,
    closeClearAllDataModal,
    selectClearDataOption,
    updateClearAllDataModalUI,
    executeClearAllData,
    checkDataHealth,
    persistDTR,
    loadDTRRecords,
    getErrorSummary,
    submitDTR,
    compressImage,
    saveRecord,
    bulkMergeRecords,
    resolveDateConflictModal,
    notifyDTRDataChanged
};


