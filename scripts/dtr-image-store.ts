/**
 * DTR IMAGE STORE (IndexedDB)
 * Stores image data in IndexedDB to avoid localStorage quota limits.
 * Records hold imageIds; this module stores/retrieves by id.
 */

const DTR_IMAGE_DB_NAME = "DTRImageStore";
const DTR_IMAGE_STORE_NAME = "images";
const DTR_IMAGE_ORIGINAL_STORE_NAME = "images_original";
const DTR_RECORDS_STORE_NAME = "records";
const DTR_ARCHIVED_RECORDS_STORE_NAME = "archived_records";
const DTR_RECORDS_KEY = "primary";
const DB_VERSION = 4;
const MAX_RETRIES = 3;

let _db: IDBDatabase | null = null;
let _openPromise: Promise<IDBDatabase> | null = null;

function withRetry<T>(operation: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const execute = () => {
            attempts++;
            operation()
                .then(resolve)
                .catch(err => {
                    if (attempts >= maxRetries) {
                        reject(err);
                    } else {
                        console.warn(`Transaction failed. Retrying (${attempts}/${maxRetries})...`, err);
                        setTimeout(execute, 100 * Math.pow(2, attempts));
                    }
                });
        };
        execute();
    });
}

function buildStoreError(stage: string, err: any): Error {
    if (!err) return new Error(`${stage} failed with unknown error`);
    const name = err.name ? String(err.name) : "Error";
    const message = err.message ? String(err.message) : String(err);
    return new Error(`${stage} failed (${name}): ${message}`);
}

function openImageDB(): Promise<IDBDatabase> {
    if (_db) return Promise.resolve(_db);
    if (_openPromise) return _openPromise;
    if (typeof indexedDB === "undefined") {
        return Promise.reject(new Error("IndexedDB is not supported"));
    }

    _openPromise = new Promise<IDBDatabase>((resolve, reject) => {
        let isSettled = false;
        const timeoutId = setTimeout(() => {
            if (!isSettled) {
                isSettled = true;
                reject(new Error("openImageDB timed out"));
            }
        }, 3500);

        try {
            const req = indexedDB.open(DTR_IMAGE_DB_NAME, DB_VERSION);
            req.onerror = () => {
                if (isSettled) return;
                isSettled = true;
                clearTimeout(timeoutId);
                reject(buildStoreError("openImageDB", req.error));
            };
            req.onblocked = () => {
                if (isSettled) return;
                isSettled = true;
                clearTimeout(timeoutId);
                reject(new Error("openImageDB failed: database open is blocked by another tab/session"));
            };
            req.onsuccess = () => {
                if (isSettled) return;
                isSettled = true;
                clearTimeout(timeoutId);
                _db = req.result;
                _db.onversionchange = () => {
                    if (_db) _db.close();
                    _db = null;
                };
                resolve(_db);
            };
            req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(DTR_IMAGE_STORE_NAME)) {
                    db.createObjectStore(DTR_IMAGE_STORE_NAME, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(DTR_IMAGE_ORIGINAL_STORE_NAME)) {
                    db.createObjectStore(DTR_IMAGE_ORIGINAL_STORE_NAME, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(DTR_RECORDS_STORE_NAME)) {
                    db.createObjectStore(DTR_RECORDS_STORE_NAME, { keyPath: "id" });
                }
                if (!db.objectStoreNames.contains(DTR_ARCHIVED_RECORDS_STORE_NAME)) {
                    db.createObjectStore(DTR_ARCHIVED_RECORDS_STORE_NAME, { keyPath: "id" });
                }
            };
        } catch (e: any) {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(timeoutId);
            reject(e);
        }
    }).finally(() => {
        _openPromise = null;
    });

    return _openPromise;
}

function generateImageId(): string {
    return "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!(blob instanceof Blob)) {
            reject(new Error("blobToDataUrl: input is not a Blob"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(buildStoreError("blobToDataUrl", reader.error));
        reader.readAsDataURL(blob);
    });
}

interface ImagePayload {
    id: string;
    blob?: Blob;
    mimeType?: string;
    sizeBytes?: number;
    dataUrl?: string;
    optimizedAt?: number;
    isCompressed?: boolean;
    backupAt?: number;
}

/**
 * Save image payload to IndexedDB. Accepts File/Blob (preferred) or legacy data URL.
 * Returns the image id to store in the record.
 */
function saveImageToStore(imageInput: Blob | string): Promise<string> {
    const id = generateImageId();
    let payload: ImagePayload | null = null;

    if (imageInput instanceof Blob) {
        payload = {
            id,
            blob: imageInput,
            mimeType: imageInput.type || "image/*",
            sizeBytes: imageInput.size || 0
        };
    } else if (typeof imageInput === "string" && imageInput.startsWith("data:image/")) {
        payload = {
            id,
            dataUrl: imageInput,
            sizeBytes: imageInput.length
        };
    } else {
        return Promise.reject(new Error("Invalid image payload"));
    }

    return withRetry(() => openImageDB().then((db) => {
        return new Promise<string>((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            tx.onabort = () => reject(buildStoreError("saveImageToStore transaction abort", tx.error));
            tx.onerror = () => reject(buildStoreError("saveImageToStore transaction", tx.error));
            const req = store.put(payload);
            req.onsuccess = () => resolve(id);
            req.onerror = () => reject(buildStoreError("saveImageToStore request", req.error));
        });
    }));
}

function getImageEntryFromStore(id: string): Promise<ImagePayload | null> {
    if (!id) return Promise.resolve(null);
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(buildStoreError("getImageEntryFromStore request", req.error));
        });
    });
}

function putImageEntryToStore(entry: ImagePayload): Promise<boolean> {
    if (!entry || !entry.id) return Promise.reject(new Error("putImageEntryToStore requires entry with id"));
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.put(entry);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("putImageEntryToStore request", req.error));
        });
    });
}

function backupOriginalImageIfMissing(id: string, entry: ImagePayload): Promise<boolean> {
    if (!id || !entry) return Promise.resolve(false);
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_ORIGINAL_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_ORIGINAL_STORE_NAME);
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                if (getReq.result) {
                    resolve(false);
                    return;
                }
                const putReq = store.put({ ...entry, id, backupAt: Date.now() });
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(buildStoreError("backupOriginalImageIfMissing put", putReq.error));
            };
            getReq.onerror = () => reject(buildStoreError("backupOriginalImageIfMissing get", getReq.error));
        });
    });
}

function restoreOriginalImageForId(id: string): Promise<boolean> {
    if (!id) return Promise.resolve(false);
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([DTR_IMAGE_ORIGINAL_STORE_NAME, DTR_IMAGE_STORE_NAME], "readwrite");
            const originalStore = tx.objectStore(DTR_IMAGE_ORIGINAL_STORE_NAME);
            const imageStore = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const getReq = originalStore.get(id);
            getReq.onsuccess = () => {
                const original = getReq.result as ImagePayload;
                if (!original) {
                    resolve(false);
                    return;
                }
                const { backupAt, ...restoredEntry } = original;
                const putReq = imageStore.put(restoredEntry);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(buildStoreError("restoreOriginalImageForId put", putReq.error));
            };
            getReq.onerror = () => reject(buildStoreError("restoreOriginalImageForId get", getReq.error));
        });
    });
}

/**
 * Get a displayable data URL by id. Returns null if not found.
 */
function getImageFromStore(id: string): Promise<string | null> {
    if (!id) return Promise.resolve(null);
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.get(id);
            req.onsuccess = async () => {
                const row = req.result as ImagePayload;
                if (!row) {
                    resolve(null);
                    return;
                }
                if (row.dataUrl && typeof row.dataUrl === "string") {
                    resolve(row.dataUrl);
                    return;
                }
                if (row.blob instanceof Blob) {
                    try {
                        const dataUrl = await blobToDataUrl(row.blob);
                        resolve(dataUrl || null);
                    } catch (_) {
                        resolve(null);
                    }
                    return;
                }
                resolve(null);
            };
            req.onerror = () => reject(buildStoreError("getImageFromStore request", req.error));
        });
    });
}

/**
 * Delete one image by id.
 */
function deleteImageFromStore(id: string): Promise<void> {
    if (!id) return Promise.resolve();
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(buildStoreError("deleteImageFromStore request", req.error));
        });
    });
}

/**
 * Delete multiple images by id.
 */
function deleteImagesFromStore(ids: string[]): Promise<void> {
    if (!ids || !ids.length) return Promise.resolve();
    return withRetry(() => openImageDB().then((db) => {
        const tx = db.transaction([DTR_IMAGE_STORE_NAME, DTR_IMAGE_ORIGINAL_STORE_NAME], "readwrite");
        const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
        const backupStore = tx.objectStore(DTR_IMAGE_ORIGINAL_STORE_NAME);
        ids.forEach((id) => {
            store.delete(id);
            backupStore.delete(id);
        });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(buildStoreError("deleteImagesFromStore transaction", tx.error));
        });
    }));
}

/**
 * Get total bytes used by the images store.
 */
function getImageStoreUsageBytes(): Promise<number> {
    return openImageDB().then((db) => {
        return new Promise<number>((resolve) => {
            try {
                if (!db.objectStoreNames.contains(DTR_IMAGE_STORE_NAME)) {
                    resolve(0);
                    return;
                }
                const tx = db.transaction(DTR_IMAGE_STORE_NAME, "readonly");
                const store = tx.objectStore(DTR_IMAGE_STORE_NAME);
                let totalBytes = 0;

                tx.onerror = () => resolve(totalBytes);
                tx.onabort = () => resolve(totalBytes);
                
                const req = store.openCursor();
                req.onsuccess = (e) => {
                    try {
                        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                        if (cursor) {
                            const item = cursor.value as ImagePayload;
                            if (item) {
                                if (item.blob instanceof Blob) {
                                    totalBytes += (item.blob.size || 0);
                                } else if (typeof item.dataUrl === "string") {
                                    // Mobile IDB strings count as 2 bytes per character under iOS quota enforcement
                                    totalBytes += (item.dataUrl.length * 2);
                                } else if (typeof item.sizeBytes === "number") {
                                    totalBytes += item.sizeBytes;
                                }
                            }
                            cursor.continue();
                        } else {
                            resolve(totalBytes);
                        }
                    } catch (_) {
                        resolve(totalBytes);
                    }
                };
                req.onerror = () => resolve(totalBytes);
            } catch (_) {
                resolve(0);
            }
        });
    }).catch(() => 0);
}

/**
 * Get storage estimate for origin (quota/usage) if available.
 */
function getImageStoreEstimate(): Promise<{ usage: number; quota: number }> {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.estimate === "function") {
        const timeoutPromise = new Promise<{ usage: number; quota: number }>((resolve) => 
            setTimeout(() => resolve({ usage: 0, quota: 0 }), 2500)
        );
        return Promise.race([
            navigator.storage.estimate().then((est) => ({
                usage: Number(est && est.usage) || 0,
                quota: Number(est && est.quota) || 0
            })),
            timeoutPromise
        ]).catch(() => ({ usage: 0, quota: 0 }));
    }
    return Promise.resolve({ usage: 0, quota: 0 });
}

function saveRecordsToStore(records: any[]): Promise<boolean> {
    const payload = Array.isArray(records) ? records : [];
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            tx.onabort = () => reject(buildStoreError("saveRecordsToStore transaction abort", tx.error));
            tx.onerror = () => reject(buildStoreError("saveRecordsToStore transaction", tx.error));

            const req = store.put({ id: DTR_RECORDS_KEY, records: payload });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("saveRecordsToStore request", req.error));
        });
    });
}

function getRecordsFromStore(): Promise<any[] | null> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            const req = store.get(DTR_RECORDS_KEY);
            req.onsuccess = () => {
                if (!req.result || !Array.isArray(req.result.records)) {
                    resolve(null);
                    return;
                }
                resolve(req.result.records);
            };
            req.onerror = () => reject(buildStoreError("getRecordsFromStore request", req.error));
        });
    });
}

function clearRecordsFromStore(): Promise<boolean> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_RECORDS_STORE_NAME);
            const req = store.delete(DTR_RECORDS_KEY);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("clearRecordsFromStore request", req.error));
        });
    });
}

export interface ArchivedSnapshot {
    id: string;
    archivedAt: string;
    reason: string;
    recordCount: number;
    records: any[];
}

function archiveRecordsSnapshot(records: any[], reason: string = "manual_archive"): Promise<string> {
    const payload = Array.isArray(records) ? JSON.parse(JSON.stringify(records)) : [];
    const id = "archive_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const snapshot: ArchivedSnapshot = {
        id,
        archivedAt: new Date().toISOString(),
        reason,
        recordCount: payload.length,
        records: payload
    };

    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_ARCHIVED_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_ARCHIVED_RECORDS_STORE_NAME);
            tx.onabort = () => reject(buildStoreError("archiveRecordsSnapshot transaction abort", tx.error));
            tx.onerror = () => reject(buildStoreError("archiveRecordsSnapshot transaction", tx.error));

            const req = store.put(snapshot);
            req.onsuccess = () => resolve(id);
            req.onerror = () => reject(buildStoreError("archiveRecordsSnapshot request", req.error));
        });
    });
}

function getArchivedSnapshots(): Promise<ArchivedSnapshot[]> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_ARCHIVED_RECORDS_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_ARCHIVED_RECORDS_STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
                const list: ArchivedSnapshot[] = Array.isArray(req.result) ? req.result : [];
                list.sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""));
                resolve(list);
            };
            req.onerror = () => reject(buildStoreError("getArchivedSnapshots request", req.error));
        });
    });
}

function deleteArchivedSnapshot(id: string): Promise<boolean> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_ARCHIVED_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_ARCHIVED_RECORDS_STORE_NAME);
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("deleteArchivedSnapshot request", req.error));
        });
    });
}

function restoreArchivedSnapshot(id: string): Promise<any[] | null> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_ARCHIVED_RECORDS_STORE_NAME, "readonly");
            const store = tx.objectStore(DTR_ARCHIVED_RECORDS_STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => {
                if (!req.result || !Array.isArray(req.result.records)) {
                    resolve(null);
                    return;
                }
                resolve(req.result.records);
            };
            req.onerror = () => reject(buildStoreError("restoreArchivedSnapshot request", req.error));
        });
    });
}

function clearAllArchivedSnapshots(): Promise<boolean> {
    return openImageDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DTR_ARCHIVED_RECORDS_STORE_NAME, "readwrite");
            const store = tx.objectStore(DTR_ARCHIVED_RECORDS_STORE_NAME);
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(buildStoreError("clearAllArchivedSnapshots request", req.error));
        });
    });
}

/**
 * Returns image data URLs for a record. Supports legacy .images (base64) and new .imageIds (IndexedDB).
 */
function getRecordImageUrls(record: any): Promise<string[]> {
    if (!record) return Promise.resolve([]);
    if (record.imageIds && record.imageIds.length) {
        return Promise.all(record.imageIds.map((id: string) => getImageFromStore(id))).then((urls) =>
            urls.filter((u): u is string => u != null)
        );
    }
    if (record.images && record.images.length) {
        return Promise.resolve(record.images.filter((s: any) => s && typeof s === "string"));
    }
    return Promise.resolve([]);
}

if (typeof window !== "undefined") {
    (window as any).saveImageToStore = saveImageToStore;
    (window as any).getImageFromStore = getImageFromStore;
    (window as any).getImageEntryFromStore = getImageEntryFromStore;
    (window as any).putImageEntryToStore = putImageEntryToStore;
    (window as any).deleteImageFromStore = deleteImageFromStore;
    (window as any).deleteImagesFromStore = deleteImagesFromStore;
    (window as any).getRecordImageUrls = getRecordImageUrls;
    (window as any).saveRecordsToStore = saveRecordsToStore;
    (window as any).getRecordsFromStore = getRecordsFromStore;
    (window as any).clearRecordsFromStore = clearRecordsFromStore;
    (window as any).getImageStoreUsageBytes = getImageStoreUsageBytes;
    (window as any).getImageStoreEstimate = getImageStoreEstimate;
    (window as any).backupOriginalImageIfMissing = backupOriginalImageIfMissing;
    (window as any).restoreOriginalImageForId = restoreOriginalImageForId;
    (window as any).archiveRecordsSnapshot = archiveRecordsSnapshot;
    (window as any).getArchivedSnapshots = getArchivedSnapshots;
    (window as any).deleteArchivedSnapshot = deleteArchivedSnapshot;
    (window as any).restoreArchivedSnapshot = restoreArchivedSnapshot;
    (window as any).clearAllArchivedSnapshots = clearAllArchivedSnapshots;
}

export {
    buildStoreError,
    openImageDB,
    generateImageId,
    blobToDataUrl,
    saveImageToStore,
    getImageEntryFromStore,
    putImageEntryToStore,
    backupOriginalImageIfMissing,
    restoreOriginalImageForId,
    getImageFromStore,
    deleteImageFromStore,
    deleteImagesFromStore,
    getImageStoreUsageBytes,
    getImageStoreEstimate,
    saveRecordsToStore,
    getRecordsFromStore,
    clearRecordsFromStore,
    getRecordImageUrls,
    archiveRecordsSnapshot,
    getArchivedSnapshots,
    deleteArchivedSnapshot,
    restoreArchivedSnapshot,
    clearAllArchivedSnapshots
};
