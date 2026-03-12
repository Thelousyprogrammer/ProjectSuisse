/**
 * DTR STORAGE MODULE
 * Handles all CRUD operations and data validation
 */

function isQuotaError(e) {
    return e && (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        (e.code === 22) ||
        /quota/i.test(e.message || "")
    );
}

function safeSetDTR(data) {
    try {
        localStorage.setItem("dtr", JSON.stringify(data));
        return true;
    } catch (e) {
        if (isQuotaError(e)) {
            alert("Storage full! Try:\n- Run \"Optimize Storage\" to compress images\n- Remove images from older records\n- Export & clear some data");
        } else {
            alert("Failed to save: " + (e.message || e));
        }
        return false;
    }
}

async function deleteLastRecord() {
    if (!dailyRecords.length) return alert("No records to delete.");
    if (!confirm("Delete the most recent DTR entry?")) return;

    const last = dailyRecords[dailyRecords.length - 1];
    const idsToDelete = (last.imageIds || []).length ? last.imageIds : [];
    dailyRecords.pop();
    if (!await persistDTR(dailyRecords)) return;
    if (idsToDelete.length && typeof deleteImagesFromStore === "function") {
        deleteImagesFromStore(idsToDelete).catch(() => {});
    }

    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
    loadReflectionViewer();
    if (dailyRecords.length) {
        showSummary(dailyRecords[dailyRecords.length - 1]);
        updateWeeklyCounter(dailyRecords[dailyRecords.length - 1].date);
    }
    renderDailyGraph();
    renderWeeklyGraph();
    alert("Last DTR entry deleted.");
}

async function clearAllRecords() {
    if (!confirm("This will delete ALL DTR records. Continue?")) return;

    const allImageIds = (dailyRecords || []).flatMap((r) => r.imageIds || []);
    dailyRecords = [];
    if (typeof clearRecordsFromStore === "function") {
        try { await clearRecordsFromStore(); } catch (_) {}
    }
    localStorage.removeItem("dtr");
    if (allImageIds.length && typeof deleteImagesFromStore === "function") {
        deleteImagesFromStore(allImageIds).catch(() => {});
    }

    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
    loadReflectionViewer();
    showSummary({});
    updateWeeklyCounter();
    renderDailyGraph();
    renderWeeklyGraph();
    alert("All DTR records cleared.");
}

function checkDataHealth(record) {
    const warnings = [];
    if (record.sleepHours === 0) warnings.push("Sleep Duration is 0");
    if (record.recoveryHours === 0) warnings.push("Recovery Time is 0");
    if (!record.identityScore) warnings.push("Identity Alignment not set");
    
    if (warnings.length > 0) {
        return confirm("Warning: The following metrics are missing:\n- {list}\n\nSave anyway?", {
            list: warnings.join("\n- ")
        });
    }
    return true;
}

async function persistDTR(data) {
    let primaryOk = true;
    if (typeof saveRecordsToStore === "function") {
        try {
            await saveRecordsToStore(data);
        } catch (e) {
            primaryOk = false;
            console.error("Primary record store write failed. Falling back to localStorage.", e);
        }
    }

    try {
        localStorage.setItem("dtr", JSON.stringify(data));
        return true;
    } catch (e) {
        if (primaryOk) {
            console.warn("Secondary localStorage backup write failed while primary IndexedDB save succeeded.", e);
            return true;
        }
        if (isQuotaError(e)) {
            alert("Storage full and primary storage is unavailable. Please free space and try again.");
        } else {
            alert("Failed to save records: " + (e.message || e));
        }
        return false;
    }
}

async function loadDTRRecords() {
    if (typeof getRecordsFromStore === "function") {
        try {
            const stored = await getRecordsFromStore();
            if (Array.isArray(stored)) return stored;
        } catch (e) {
            console.error("Primary record store read failed. Falling back to localStorage.", e);
        }
    }

    let fallback = [];
    try {
        fallback = JSON.parse(localStorage.getItem("dtr") || "[]");
    } catch (_) {
        fallback = [];
    }
    if (Array.isArray(fallback) && fallback.length && typeof saveRecordsToStore === "function") {
        try {
            await saveRecordsToStore(fallback);
        } catch (_) {}
    }
    return Array.isArray(fallback) ? fallback : [];
}

// --- GLOBALS ---
let _importedImageIds = []; // Temporary store for images from JSON import

function getErrorSummary(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const name = err.name ? String(err.name) : "Error";
    const message = err.message ? String(err.message) : String(err);
    return `${name}: ${message}`;
}

function submitDTR() {
    const date = document.getElementById("date").value;
    const hours = parseFloat(document.getElementById("hours").value);
    const reflection = document.getElementById("reflection").value;

    if (!date || isNaN(hours)) {
        alert("Please enter a valid date and number of hours.");
        return;
    }
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert("DTR Date cannot be earlier than OJT Starting Date ({startDate}).", startDate);
        return;
    }

    const accomplishments = document.getElementById("accomplishments").value
        .split("\n")
        .filter(a => a.trim() !== "");

    const tools = document.getElementById("tools").value
        .split(",")
        .map(t => t.trim())
        .filter(t => t !== "");

    const files = Array.from(document.getElementById("images").files);

    // Convert l2Data values to proper types immediately
    const l2Data = {
        personalHours: parseFloat(document.getElementById("personalHours").value) || 0,
        sleepHours: parseFloat(document.getElementById("sleepHours").value) || 0,
        recoveryHours: parseFloat(document.getElementById("recoveryHours").value) || 0,
        commuteTotal: parseFloat(document.getElementById("commuteTotal").value) || 0,
        commuteProductive: parseFloat(document.getElementById("commuteProductive").value) || 0,
        identityScore: parseInt(document.getElementById("identityScore").value) || null
    };

    const recordCheck = new DailyRecord(date, hours, reflection, [], [], [], l2Data);
    if (!checkDataHealth(recordCheck)) return;

    if (files.length > 0 || _importedImageIds.length > 0) {
        Promise.allSettled(files.map((file) => saveImageToStore(file)))
            .then((results) => {
                const uploadedIds = results
                    .filter((r) => r.status === "fulfilled")
                    .map((r) => r.value);
                
                const finalImageIds = [...new Set([...uploadedIds, ..._importedImageIds])];

                const rejected = results
                    .map((r, index) => ({ r, index }))
                    .filter((x) => x.r.status === "rejected")
                    .map((x) => ({
                        index: x.index,
                        fileName: files[x.index] ? files[x.index].name : "(unknown)",
                        reason: getErrorSummary(x.r.reason)
                    }));

                if (rejected.length) {
                    console.warn("Some uploaded images failed to store in IndexedDB.", rejected);
                    alert("Some images failed to store ({count}). Saving only successfully uploaded images.", { count: rejected.length });
                }
                saveRecord(date, hours, reflection, accomplishments, tools, finalImageIds, l2Data);
                _importedImageIds = []; // Clear after use
            })
            .catch((err) => {
                console.error("IndexedDB image save error:", err);
                const finalIds = _importedImageIds.length > 0 ? _importedImageIds : [];
                if (confirm("Failed to save new images to IndexedDB. Save DTR with imported/existing images only?")) {
                    saveRecord(date, hours, reflection, accomplishments, tools, finalIds, l2Data);
                    _importedImageIds = [];
                } else {
                    alert("Submission cancelled.");
                }
            });
    } else {
        saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
    }
}

/**
 * Compress image to max dimension and JPEG quality.
 * Always returns a BASE64 data URL.
 */
function compressImage(input, quality = 0.6, maxWidth = 1280) {
    return new Promise((resolve, reject) => {
        if (!input) {
            reject(new Error("No image input provided"));
            return;
        }

        const img = new Image();

        // Required for blob/object URLs
        img.crossOrigin = "anonymous";

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                let { width, height } = img;
                const inputType = input && input.type ? input.type : typeof input;

                // Resize if too large
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                if (!width || !height) {
                    reject(new Error(`Invalid image dimensions (${width}x${height}) for input type ${inputType}`));
                    return;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas 2D context unavailable"));
                    return;
                }

                // Fill white background (for PNG transparency)
                ctx.fillStyle = "#FFF";
                ctx.fillRect(0, 0, width, height);

                // Safe drawImage
                try {
                    ctx.drawImage(img, 0, 0, width, height);
                } catch (e) {
                    console.warn("drawImage failed - returning original image", e);

                    if (typeof input === "string" && input.startsWith("data:image/")) {
                        resolve(input); // fallback to original base64
                        return;
                    }

                    reject(new Error("drawImage failed"));
                    return;
                }

                const compressed = canvas.toDataURL("image/jpeg", quality);

                // Validate output BEFORE logging
                if (!compressed || !compressed.startsWith("data:image/")) {
                    reject(new Error("Compression produced invalid data URL"));
                    return;
                }

                resolve(compressed);

            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => {
            const inputType = input && input.type ? input.type : typeof input;
            reject(new Error(`Image failed to load (input type: ${inputType})`));
        };

        // Handle input types safely
        if (input instanceof Blob) {
            const objectUrl = URL.createObjectURL(input);
            const originalOnload = img.onload;
            const originalOnerror = img.onerror;
            img.onload = () => {
                try {
                    originalOnload();
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.onerror = () => {
                try {
                    originalOnerror();
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            };
            img.src = objectUrl;
        } else if (typeof input === "string") {
            img.src = input;
        } else {
            reject(new Error("Unsupported image input"));
        }
    });
}

async function saveRecord(date, hours, reflection, accomplishments, tools, imageIds, l2Data) {
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert("DTR Date cannot be earlier than OJT Starting Date " + startDate);
        return;
    }

    const normalizedDate = dateKey || date;
    const record = new DailyRecord(normalizedDate, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []);
    const previous = [...dailyRecords];
    const duplicateIndex = dailyRecords.findIndex((r) => (toGmt8DateKey(r.date) || r.date) === normalizedDate);

    if (duplicateIndex !== -1) {
        const resolution = await resolveDateConflictModal({
            incomingDate: normalizedDate,
            existingDate: toGmt8DateKey(dailyRecords[duplicateIndex].date) || dailyRecords[duplicateIndex].date
        });
        if (!resolution) return;

        if (resolution.action === "replace") {
            dailyRecords.splice(duplicateIndex, 1);
            dailyRecords.push(record);
        } else {
            const nextIncomingDate = resolution.newDate;
            const nextExistingDate = resolution.existingDate;
            const start = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;

            if (start && ((nextIncomingDate && nextIncomingDate < start) || (nextExistingDate && nextExistingDate < start))) {
                alert("DTR Date cannot be earlier than OJT Starting Date " + start);
                return;
            }

            if (!nextIncomingDate || !nextExistingDate || nextIncomingDate === nextExistingDate) {
                alert("Incoming and existing dates must both be valid and different.");
                return;
            }

            const incomingClash = dailyRecords.findIndex((r, idx) =>
                idx !== duplicateIndex && (toGmt8DateKey(r.date) || r.date) === nextIncomingDate
            );
            const existingClash = dailyRecords.findIndex((r, idx) =>
                idx !== duplicateIndex && (toGmt8DateKey(r.date) || r.date) === nextExistingDate
            );
            if (incomingClash !== -1 || existingClash !== -1) {
                alert("One of the selected dates is already used by another record.");
                return;
            }

            dailyRecords[duplicateIndex].date = nextExistingDate;
            record.date = nextIncomingDate;
            dailyRecords.push(record);
        }
    } else {
        dailyRecords.push(record);
    }
    dailyRecords.sort((a, b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));

    if (!await persistDTR(dailyRecords)) {
        dailyRecords = previous;
        if (imageIds && imageIds.length > 0 && confirm("Save without images to free space?")) {
            deleteImagesFromStore(imageIds);
            await saveRecord(date, hours, reflection, accomplishments, tools, [], l2Data);
        }
        return;
    }

    loadReflectionViewer();
    showSummary(record);
    updateWeeklyCounter(record.date);
    renderDailyGraph();
    renderWeeklyGraph();
    updateExportWeekOptions();
    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();

    clearDTRForm();
    alert("Daily DTR saved and form cleared!");
}

async function bulkMergeRecords(importedList) {
    if (!Array.isArray(importedList) || importedList.length === 0) return;

    const previous = [...dailyRecords];
    const existingMap = {};
    dailyRecords.forEach(r => {
        const dk = toGmt8DateKey(r.date) || r.date;
        existingMap[dk] = r;
    });

    let newCount = 0;
    let updateCount = 0;
    let imageCount = 0;

    for (const raw of importedList) {
        const dk = toGmt8DateKey(raw.date) || raw.date;
        
        let finalImageIds = Array.isArray(raw.imageIds) ? [...raw.imageIds] : [];
        if (Array.isArray(raw.embeddedImages) && raw.embeddedImages.length > 0) {
            try {
                // Save embedded images to store and get new IDs
                const savedIds = await Promise.all(
                    raw.embeddedImages.map(imgData => saveImageToStore(imgData))
                );
                // Merge with existing IDs if any, ensuring uniqueness
                finalImageIds = [...new Set([...finalImageIds, ...savedIds])];
                imageCount += savedIds.length;
            } catch (e) {
                console.warn("Failed to restore some images for date:", dk, e);
            }
        }

        const record = new DailyRecord(dk, raw.hours, raw.reflection, raw.accomplishments, raw.tools, [], {
            personalHours: raw.personalHours,
            sleepHours: raw.sleepHours,
            recoveryHours: raw.recoveryHours,
            commuteTotal: raw.commuteTotal,
            commuteProductive: raw.commuteProductive,
            identityScore: raw.identityScore
        }, finalImageIds);

        if (existingMap[dk]) {
            updateCount++;
        } else {
            newCount++;
        }
        existingMap[dk] = record;
    }

    dailyRecords = Object.values(existingMap);
    dailyRecords.sort((a, b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));

    if (!await persistDTR(dailyRecords)) {
        dailyRecords = previous;
        alert("Bulk import failed due to storage limits.");
        return;
    }

    loadReflectionViewer();
    renderDailyGraph();
    renderWeeklyGraph();
    updateExportWeekOptions();
    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();

    alert(`Bulk import complete!\n- ${newCount} new records added\n- ${updateCount} existing records updated\n- ${imageCount} images restored`);
}

function resolveDateConflictModal({ incomingDate, existingDate }) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
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
                    <input id="conflictNewDate" type="date" value="${incomingDate}" style="background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px;">
                </label>
                <label style="display:flex; flex-direction:column; gap:4px;">
                    <span>Existing Record Date</span>
                    <input id="conflictExistingDate" type="date" value="${existingDate}" style="background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px;">
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

        const newInput = panel.querySelector("#conflictNewDate");
        const existingInput = panel.querySelector("#conflictExistingDate");

        panel.querySelector("#conflictCancelBtn").addEventListener("click", () => finish(null));
        panel.querySelector("#conflictReplaceBtn").addEventListener("click", () => {
            finish({
                action: "replace",
                newDate: (newInput && newInput.value) || incomingDate,
                existingDate: (existingInput && existingInput.value) || existingDate
            });
        });
        panel.querySelector("#conflictKeepBothBtn").addEventListener("click", () => {
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
