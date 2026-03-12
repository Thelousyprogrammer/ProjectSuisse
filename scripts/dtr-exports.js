/**
 * DTR EXPORTS MODULE
 * Handles PDF generation, preview modal, and export-related UI logic
 */

// ─── Preview Modal State ───────────────────────────────────────────────────
let _pendingPdfDoc = null;
let _pendingPdfFileName = null;

// ─── Export Week Selector Helpers ─────────────────────────────────────────

function updateExportWeekOptions() {
    const select = document.getElementById("exportWeekSelect");
    if (!select) return;

    const currentValue = select.value;
    const allWeeksLabel = "All Weeks";
    select.innerHTML = `<option value="all">${allWeeksLabel}</option>`;
    const weeks = [...new Set(dailyRecords.map(r => getWeekNumber(new Date(r.date))))].sort((a, b) => b - a);

    weeks.forEach(w => {
        const range = getWeekDateRange(w);
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = `Week ${w}`;
        opt.title = `${range.start} – ${range.end}`;
        select.appendChild(opt);
    });

    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }
    updateExportWeekRangeLabel();
}

function updateExportWeekRangeLabel() {
    const select = document.getElementById("exportWeekSelect");
    const label = document.getElementById("exportWeekRangeLabel");
    if (!select || !label) return;
    const val = select.value;
    if (val === "all") { label.textContent = ""; return; }
    const range = getWeekDateRange(parseInt(val, 10));
    const short = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    label.textContent = `${short(range.startDate)} – ${short(range.endDate)}`;
}

// ─── Weekly Data Aggregator ────────────────────────────────────────────────

function getWeeklyDTR(filterWeek = "all") {
    const weeks = {};
    dailyRecords.forEach(r => {
        const week = getWeekNumber(new Date(r.date));
        if (filterWeek !== "all" && week != filterWeek) return;

        if (!weeks[week]) {
            weeks[week] = {
                week, totalHours: 0, personalHours: 0, sleepHours: 0, recoveryHours: 0,
                accomplishments: [], tools: new Set()
            };
        }
        weeks[week].totalHours     += r.hours;
        weeks[week].personalHours  += parseFloat(r.personalHours) || 0;
        weeks[week].sleepHours     += parseFloat(r.sleepHours)    || 0;
        weeks[week].recoveryHours  += parseFloat(r.recoveryHours) || 0;
        if (Array.isArray(r.accomplishments)) {
            r.accomplishments.forEach(a => weeks[week].accomplishments.push({ date: r.date, text: a }));
        }
        if (Array.isArray(r.tools)) {
            r.tools.forEach(t => weeks[week].tools.add(t));
        }
    });
    return Object.values(weeks).map(w => ({ ...w, tools: [...w.tools] }));
}

// ─── PDF Preview Modal ─────────────────────────────────────────────────────

function showPdfPreview(doc, fileName, title) {
    _pendingPdfDoc = doc;
    _pendingPdfFileName = fileName;

    const blobUrl = doc.output('bloburl');
    const frame   = document.getElementById('pdfPreviewFrame');
    const modal   = document.getElementById('pdfPreviewModal');
    const titleEl = document.getElementById('pdfPreviewTitle');

    if (titleEl) titleEl.textContent = title;
    if (frame)   frame.src           = blobUrl;
    if (modal)   modal.style.display = 'flex';
}

function closePdfPreview() {
    const modal = document.getElementById('pdfPreviewModal');
    const frame = document.getElementById('pdfPreviewFrame');
    if (frame) frame.src           = '';
    if (modal) modal.style.display = 'none';
    _pendingPdfDoc      = null;
    _pendingPdfFileName = null;
}

function triggerPdfDownload() {
    if (_pendingPdfDoc && _pendingPdfFileName) {
        _pendingPdfDoc.save(_pendingPdfFileName);
        closePdfPreview();
    }
}

// ─── Export All (Daily DTR) ────────────────────────────────────────────────

function exportPDF() {
    if (!dailyRecords.length) return alert("No records to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(200, 20, 0);
    doc.text("Daily DTR Report", 105, y, { align: "center" });
    y += 6;

    // Sub-label
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated: ${new Date().toLocaleDateString()}  •  Total Records: ${dailyRecords.length}`, 105, y, { align: "center" });
    y += 6;

    // Rule
    doc.setDrawColor(200, 20, 0);
    doc.setLineWidth(0.5);
    doc.line(10, y, 200, y);
    y += 8;

    dailyRecords.forEach(r => {
        // Date / Hours header (Dark Red)
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(180, 15, 0);
        doc.text(`${r.date}`, 10, y);

        // Hours value (Navy Blue)
        doc.setTextColor(30, 50, 140);
        doc.text(`${r.hours}h  (Δ ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)})`, 60, y);
        y += 6;

        // Reflection label + text (Dark Gray / Near Black)
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text("Reflection:", 10, y); y += 5;
        doc.setFont(undefined, 'normal');
        doc.setTextColor(25, 25, 25);
        const lines = doc.splitTextToSize(r.reflection || "—", 178);
        lines.forEach(line => { doc.text(line, 12, y); y += 5; });

        // Accomplishments (Dark Gray label, Near Black bullets)
        if (Array.isArray(r.accomplishments) && r.accomplishments.length) {
            doc.setFont(undefined, 'bold');
            doc.setTextColor(60, 60, 60);
            doc.text("Accomplishments:", 10, y); y += 5;
            doc.setFont(undefined, 'normal');
            doc.setTextColor(25, 25, 25);
            r.accomplishments.forEach(a => { doc.text("• " + a, 14, y); y += 5; });
        }

        // Tools (Teal italic)
        if (Array.isArray(r.tools) && r.tools.length) {
            doc.setFontSize(8);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(30, 110, 110);
            doc.text("Tools: " + r.tools.join(", "), 10, y); y += 5;
            doc.setFont(undefined, 'normal');
        }

        // L2 Telemetry (Slate gray)
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(90, 100, 115);
        const tel = `L2 — Personal: ${r.personalHours}h  |  Sleep: ${r.sleepHours}h  |  Recovery: ${r.recoveryHours}h  |  Identity: ${r.identityScore || "—"}`;
        doc.text(tel, 10, y); y += 8;

        // Thin row separator
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(10, y, 200, y);
        y += 5;

        if (y > 260) { doc.addPage(); y = 15; }
    });

    showPdfPreview(doc, getTodayFileName("Daily_DTR_Report", "pdf"), "Daily DTR Report – All Records");
}

// ─── Export Weekly ─────────────────────────────────────────────────────────

function exportWeeklyPDF() {
    if (!dailyRecords.length) return alert("No records to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    const filterWeek = document.getElementById("exportWeekSelect").value;
    const weekLabel  = filterWeek === "all" ? "All Weeks" : `Week ${filterWeek}`;

    // ── Report Title (Red)
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(200, 20, 0);
    doc.text("Weekly DTR Report", 105, y, { align: "center" });
    y += 6;

    // ── Sub-label (Mid Gray)
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Filter: ${weekLabel}  •  Generated: ${new Date().toLocaleDateString()}`, 105, y, { align: "center" });
    y += 8;

    // ── Header rule (Red)
    doc.setDrawColor(200, 20, 0);
    doc.setLineWidth(0.5);
    doc.line(10, y, 200, y);
    y += 8;

    const weeks = getWeeklyDTR(filterWeek);
    weeks.forEach((w, idx) => {

        // ── Week Header (Dark Red)
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(180, 15, 0);
        doc.text(`Week ${w.week} Summary`, 10, y);
        y += 7;

        // ── Total Hours label + value (Navy Blue)
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 50, 140);
        doc.text("Total OJT Hours:", 10, y);
        doc.setFont(undefined, 'bold');
        doc.text(`${w.totalHours.toFixed(1)} hrs`, 46, y);
        y += 7;

        // ── L2 Telemetry row (Muted Slate)
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(90, 100, 115);
        const l2 = `Personal: ${w.personalHours.toFixed(1)}h  |  Sleep: ${w.sleepHours.toFixed(1)}h  |  Recovery: ${w.recoveryHours.toFixed(1)}h`;
        doc.text(l2, 10, y);
        y += 6;

        // ── Tools (Dark Teal, Italic)
        if (w.tools.length) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(30, 110, 110);
            const toolLines = doc.splitTextToSize(`Tools Used: ${w.tools.join(", ")}`, 185);
            toolLines.forEach(line => { doc.text(line, 10, y); y += 5; });
            doc.setFont(undefined, 'normal');
            y += 1;
        }

        // ── Accomplishments (Dark Gray label, Near-Black bullets with muted date)
        if (w.accomplishments.length) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(60, 60, 60);
            doc.text("Accomplishments:", 10, y);
            y += 5;

            w.accomplishments.forEach(a => {
                // Date stamp (Light Gray)
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(`[${a.date}]`, 14, y);

                // Accomplishment text (Near Black)
                doc.setFontSize(9);
                doc.setTextColor(25, 25, 25);
                const textLines = doc.splitTextToSize(a.text, 158);
                textLines.forEach((line, li) => {
                    doc.text((li === 0 ? "• " : "  ") + line, li === 0 ? 34 : 36, y);
                    y += 5;
                });

                if (y > 260) { doc.addPage(); y = 15; }
            });
        }

        // ── Week separator (Light Gray rule between weeks)
        y += 4;
        if (idx < weeks.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(10, y, 200, y);
            y += 8;
        }

        if (y > 260) { doc.addPage(); y = 15; }
    });

    showPdfPreview(doc, getTodayFileName("WeeklyReport", "pdf"), `Weekly DTR Report – ${weekLabel}`);
}

function exportDOCX() {
    if (!dailyRecords.length) return alert("No records to export.");
    if (!window.docx || !window.saveAs) {
        alert("DOCX export dependencies are not loaded.");
        return;
    }

    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        AlignmentType
    } = window.docx;

    const startDateKey = (typeof getCurrentOjtStartDate === "function")
        ? getCurrentOjtStartDate()
        : toGmt8DateKey(OJT_START);
    const requiredHours = (typeof getCurrentRequiredOjtHours === "function")
        ? getCurrentRequiredOjtHours()
        : MASTER_TARGET_HOURS;
    const semesterEndKey = (typeof getCurrentSemesterEndDate === "function")
        ? getCurrentSemesterEndDate()
        : "";
    const timeZoneId = (typeof getCurrentTimeZone === "function")
        ? getCurrentTimeZone()
        : DEFAULT_TIMEZONE;
    const totalHours = dailyRecords.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);

    const children = [
        new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun("Daily DTR Report")]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun(`Generated: ${new Date().toLocaleDateString()}  |  Start: ${startDateKey}  |  End: ${semesterEndKey}  |  TZ: ${timeZoneId}  |  Required: ${requiredHours}h  |  Entries: ${dailyRecords.length}  |  Hours: ${totalHours.toFixed(1)}`)
            ]
        }),
        new Paragraph({ text: "" })
    ];

    dailyRecords.forEach((r) => {
        const weekNum = getWeekNumber(r.date);
        const identityLabel = getIdentityAlignmentLabel(r.identityScore || 0);
        const toolsText = Array.isArray(r.tools) && r.tools.length ? r.tools.join(", ") : "N/A";
        const accomplishments = Array.isArray(r.accomplishments) ? r.accomplishments.filter(Boolean) : [];

        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun(`${r.date} (Week ${weekNum})`)]
            }),
            new Paragraph({
                children: [
                    new TextRun(`Hours: ${r.hours}h  |  Delta: ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}h`)
                ]
            }),
            new Paragraph({ children: [new TextRun(`Reflection: ${r.reflection || "-"}`)] }),
            new Paragraph({ children: [new TextRun(`Tools: ${toolsText}`)] }),
            new Paragraph({
                children: [
                    new TextRun(`L2: Personal ${parseFloat(r.personalHours) || 0}h | Sleep ${parseFloat(r.sleepHours) || 0}h | Recovery ${parseFloat(r.recoveryHours) || 0}h | Identity ${identityLabel}`)
                ]
            })
        );

        if (accomplishments.length) {
            children.push(new Paragraph({ children: [new TextRun("Accomplishments:")] }));
            accomplishments.forEach((a) => {
                children.push(new Paragraph({ text: a, bullet: { level: 0 } }));
            });
        }

        children.push(new Paragraph({ text: "" }));
    });

    const doc = new Document({
        sections: [{ properties: {}, children }]
    });

    Packer.toBlob(doc)
        .then((blob) => {
            saveAs(blob, getTodayFileName("Daily_DTR_Report", "docx"));
        })
        .catch((err) => {
            console.error("DOCX export failed:", err);
            alert("DOCX export failed. Check console for details.");
        });
}

function exportWeeklyDOCX() {
    if (!dailyRecords.length) return alert("No records to export.");
    if (!window.docx || !window.saveAs) {
        alert("DOCX export dependencies are not loaded.");
        return;
    }

    const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        AlignmentType
    } = window.docx;

    const weekSelect = document.getElementById("exportWeekSelect");
    const filterWeek = weekSelect ? weekSelect.value : "all";
    const weekLabel = filterWeek === "all" ? "All Weeks" : `Week ${filterWeek}`;
    const weeks = getWeeklyDTR(filterWeek);
    if (!weeks.length) {
        alert("No weekly records found for the selected filter.");
        return;
    }

    const children = [
        new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun("Weekly DTR Report")]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun(`Filter: ${weekLabel}  |  Generated: ${new Date().toLocaleDateString()}`)]
        }),
        new Paragraph({ text: "" })
    ];

    weeks.forEach((w) => {
        const weekRange = getWeekDateRange(w.week);
        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun(`Week ${w.week} Summary`)]
            }),
            new Paragraph({
                children: [new TextRun(`${weekRange.start} - ${weekRange.end}`)]
            }),
            new Paragraph({
                children: [new TextRun(`Total OJT Hours: ${w.totalHours.toFixed(1)}h`)]
            }),
            new Paragraph({
                children: [new TextRun(`L2: Personal ${w.personalHours.toFixed(1)}h | Sleep ${w.sleepHours.toFixed(1)}h | Recovery ${w.recoveryHours.toFixed(1)}h`)]
            })
        );

        if (w.tools.length) {
            children.push(
                new Paragraph({
                    children: [new TextRun(`Tools Used: ${w.tools.join(", ")}`)]
                })
            );
        }

        if (w.accomplishments.length) {
            children.push(new Paragraph({ children: [new TextRun("Accomplishments:")] }));
            w.accomplishments.forEach((a) => {
                const text = `[${a.date}] ${a.text || ""}`.trim();
                children.push(new Paragraph({ text, bullet: { level: 0 } }));
            });
        }

        children.push(new Paragraph({ text: "" }));
    });

    const doc = new Document({
        sections: [{ properties: {}, children }]
    });

    const safeWeek = filterWeek === "all" ? "All_Weeks" : `Week_${filterWeek}`;
    Packer.toBlob(doc)
        .then((blob) => {
            saveAs(blob, getTodayFileName(`Weekly_DTR_Report_${safeWeek}`, "docx"));
        })
        .catch((err) => {
            console.error("Weekly DOCX export failed:", err);
            alert("Weekly DOCX export failed. Check console for details.");
        });
}

let _pendingImportedRecord = null;
let _pendingImportedAllRecords = [];
let _pendingImportMeta = "";
let _pendingJsonExportBlob = null;
let _pendingJsonExportFileName = "";

function getRecordTimelineData(dateLike) {
    const weekNumber = getWeekNumber(dateLike);
    const dayNumber = getDayNumberInOjtWeek(dateLike);
    return {
        weekNumber,
        dayNumber,
        label: `Week: ${weekNumber} | Day: ${dayNumber}`
    };
}

async function normalizeRecordForJson(record, includeImages = false) {
    const safe = record || {};
    const dateKey = toGmt8DateKey(safe.date) || "";
    const timeline = getRecordTimelineData(dateKey);
    
    let embeddedImages = [];
    if (includeImages && typeof getRecordImageUrls === "function") {
        try {
            embeddedImages = await getRecordImageUrls(safe);
        } catch (e) {
            console.warn("Failed to fetch images for export on date:", dateKey, e);
        }
    }

    return {
        date: dateKey,
        weekNumber: timeline.weekNumber,
        dayNumber: timeline.dayNumber,
        timelineLabel: timeline.label,
        hours: parseFloat(safe.hours) || 0,
        reflection: typeof safe.reflection === "string" ? safe.reflection : "",
        accomplishments: Array.isArray(safe.accomplishments)
            ? safe.accomplishments.map((a) => String(a || "").trim()).filter(Boolean)
            : [],
        tools: Array.isArray(safe.tools)
            ? safe.tools.map((t) => String(t || "").trim()).filter(Boolean)
            : [],
        personalHours: parseFloat(safe.personalHours) || 0,
        sleepHours: parseFloat(safe.sleepHours) || 0,
        recoveryHours: parseFloat(safe.recoveryHours) || 0,
        commuteTotal: parseFloat(safe.commuteTotal) || 0,
        commuteProductive: parseFloat(safe.commuteProductive) || 0,
        identityScore: parseInt(safe.identityScore, 10) || 0,
        embeddedImages: embeddedImages // Add this field
    };
}

async function exportRecordsJSON() {
    if (!Array.isArray(dailyRecords) || !dailyRecords.length) {
        alert("No records to export.");
        return;
    }

    const includeImages = confirm("Include images in JSON export?\n(Note: This will significantly increase file size)");

    const records = await Promise.all(dailyRecords.map(r => normalizeRecordForJson(r, includeImages)));

    const payload = {
        type: "custom-dtr-records-export",
        schemaVersion: 1, // Updated version
        exportedAt: new Date().toISOString(),
        settings: {
            ojtStartDate: getCurrentOjtStartDate(),
            requiredOjtHours: getCurrentRequiredOjtHours(),
            semesterEndDate: getCurrentSemesterEndDate(),
            timeZone: getCurrentTimeZone()
        },
        recordCount: dailyRecords.length,
        records: records
    };

    const jsonText = JSON.stringify(payload, null, 2);
    const fileName = getTodayFileName("DTR_Record_Name", "json");
    const previewEl = document.getElementById("jsonExportPreviewText");
    const modal = document.getElementById("jsonExportPreviewModal");
    if (!previewEl || !modal) {
        triggerJsonExportDownload(new Blob([jsonText], { type: "application/json;charset=utf-8" }), fileName);
        return;
    }

    _pendingJsonExportBlob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    _pendingJsonExportFileName = fileName;
    
    // For large JSONs with images, we might want to truncate the preview
    if (jsonText.length > 50000) {
        previewEl.textContent = jsonText.substring(0, 50000) + "\n\n... (preview truncated for performance) ...";
    } else {
        previewEl.textContent = jsonText;
    }
    
    const fileNameInput = document.getElementById("jsonExportFileNameInput");
    if (fileNameInput) fileNameInput.value = fileName;
    modal.style.display = "flex";
}

function triggerJsonExportDownload(blob, fileName) {
    if (!blob || !fileName) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function closeJsonExportPreview() {
    const modal = document.getElementById("jsonExportPreviewModal");
    const previewEl = document.getElementById("jsonExportPreviewText");
    const fileNameInput = document.getElementById("jsonExportFileNameInput");
    if (modal) modal.style.display = "none";
    if (previewEl) previewEl.textContent = "";
    if (fileNameInput) fileNameInput.value = "";
    _pendingJsonExportBlob = null;
    _pendingJsonExportFileName = "";
}

function sanitizeJsonFileName(rawName, fallbackName) {
    let name = String(rawName || "").trim();
    if (!name) name = fallbackName || "DTR_Record_Name";
    name = name.replace(/[\\/:*?"<>|]/g, "_");
    if (!name.toLowerCase().endsWith(".json")) name += ".json";
    return name;
}

function confirmJsonExportDownload() {
    if (!_pendingJsonExportBlob || !_pendingJsonExportFileName) {
        closeJsonExportPreview();
        return;
    }
    const fileNameInput = document.getElementById("jsonExportFileNameInput");
    const chosenName = sanitizeJsonFileName(
        fileNameInput ? fileNameInput.value : "",
        _pendingJsonExportFileName
    );
    triggerJsonExportDownload(_pendingJsonExportBlob, chosenName);
    closeJsonExportPreview();
}

function extractJsonImportRecords(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.records)) return parsed.records;
        if (parsed.record && typeof parsed.record === "object") return [parsed.record];
        if (typeof parsed.date !== "undefined" && typeof parsed.hours !== "undefined") return [parsed];
    }
    return [];
}

function normalizeRecordForImport(record) {
    const safe = record || {};
    const dateKey = toGmt8DateKey(safe.date) || "";
    const timeline = getRecordTimelineData(dateKey);
    return {
        date: dateKey,
        weekNumber: timeline.weekNumber,
        dayNumber: timeline.dayNumber,
        timelineLabel: timeline.label,
        hours: parseFloat(safe.hours) || 0,
        reflection: typeof safe.reflection === "string" ? safe.reflection : "",
        accomplishments: Array.isArray(safe.accomplishments)
            ? safe.accomplishments.map((a) => String(a || "").trim()).filter(Boolean)
            : [],
        tools: Array.isArray(safe.tools)
            ? safe.tools.map((t) => String(t || "").trim()).filter(Boolean)
            : [],
        personalHours: parseFloat(safe.personalHours) || 0,
        sleepHours: parseFloat(safe.sleepHours) || 0,
        recoveryHours: parseFloat(safe.recoveryHours) || 0,
        commuteTotal: parseFloat(safe.commuteTotal) || 0,
        commuteProductive: parseFloat(safe.commuteProductive) || 0,
        identityScore: parseInt(safe.identityScore, 10) || 0,
        embeddedImages: Array.isArray(safe.embeddedImages) ? safe.embeddedImages : []
    };
}

function buildRecordFromImport(raw) {
    const normalized = normalizeRecordForImport(raw);
    if (!normalized.date || !Number.isFinite(normalized.hours)) return null;
    return normalized;
}

function openJsonImportPreviewModal(record, metaLabel, showBulk = false) {
    const modal = document.getElementById("jsonImportPreviewModal");
    if (!modal) return;
    const timeline = getRecordTimelineData(record.date);

    const bulkBtn = document.getElementById("confirmBulkImportBtn");
    if (bulkBtn) {
        bulkBtn.style.display = showBulk ? "inline-block" : "none";
    }

    document.getElementById("jsonPreviewDate").textContent = record.date
        ? `${record.date} (${timeline.label})`
        : "-";
    document.getElementById("jsonPreviewHours").textContent = String(record.hours ?? "-");
    document.getElementById("jsonPreviewAccomplishments").textContent = String((record.accomplishments || []).length);
    document.getElementById("jsonPreviewTools").textContent = String((record.tools || []).length);
    document.getElementById("jsonPreviewPersonal").textContent = String(record.personalHours ?? 0);
    document.getElementById("jsonPreviewSleep").textContent = String(record.sleepHours ?? 0);
    document.getElementById("jsonPreviewRecovery").textContent = String(record.recoveryHours ?? 0);
    document.getElementById("jsonPreviewIdentity").textContent = getIdentityAlignmentLabel(record.identityScore || 0);
    
    const imgCountEl = document.getElementById("jsonPreviewImagesCount");
    if (imgCountEl) {
        imgCountEl.textContent = String((record.embeddedImages || []).length);
    }

    document.getElementById("jsonPreviewReflection").textContent = record.reflection || "-";
    document.getElementById("jsonPreviewMeta").textContent = metaLabel || "";
    modal.style.display = "flex";
}

function closeJsonImportPreviewModal() {
    _pendingImportedRecord = null;
    _pendingImportedAllRecords = [];
    _pendingImportMeta = "";
    const modal = document.getElementById("jsonImportPreviewModal");
    if (modal) modal.style.display = "none";
}

async function applyImportedRecordToForm(record) {
    document.getElementById("date").value = record.date || "";
    document.getElementById("hours").value = record.hours ?? "";
    document.getElementById("reflection").value = record.reflection || "";
    document.getElementById("accomplishments").value = (record.accomplishments || []).join("\n");
    document.getElementById("tools").value = (record.tools || []).join(", ");
    document.getElementById("personalHours").value = record.personalHours || "";
    document.getElementById("sleepHours").value = record.sleepHours || "";
    document.getElementById("recoveryHours").value = record.recoveryHours || "";
    document.getElementById("commuteTotal").value = record.commuteTotal || "";
    document.getElementById("commuteProductive").value = record.commuteProductive || "";
    document.getElementById("identityScore").value = String(record.identityScore || 0);

    const imgInput = document.getElementById("images");
    if (imgInput) imgInput.value = "";
    
    // Handle status images
    _importedImageIds = [];
    const preview = document.getElementById("imagePreview");
    if (preview) preview.innerHTML = "";

    if (Array.isArray(record.embeddedImages) && record.embeddedImages.length > 0) {
        try {
            // Save to IndexedDB immediately for preview
            _importedImageIds = await Promise.all(
                record.embeddedImages.map(img => saveImageToStore(img))
            );
            
            if (preview) {
                const label = document.createElement("p");
                label.style.cssText = "width:100%; font-size:10px; margin-bottom:5px; opacity:0.8;";
                label.textContent = `Imported Images (${_importedImageIds.length}):`;
                preview.appendChild(label);

                _importedImageIds.forEach(id => {
                    getImageFromStore(id).then(url => {
                        const img = document.createElement("img");
                        img.src = url;
                        img.style.cssText = "width:60px; height:60px; object-fit:cover; border-radius:6px; border:2px solid var(--accent);";
                        preview.appendChild(img);
                    });
                });
            }
        } catch (e) {
            console.error("Failed to restore images for form preview:", e);
        }
    }

    updateWeeklyCounter(record.date);
}

async function confirmJsonImportToForm() {
    if (!_pendingImportedRecord) {
        closeJsonImportPreviewModal();
        return;
    }
    await applyImportedRecordToForm(_pendingImportedRecord);
    closeJsonImportPreviewModal();
    alert("Imported record (including images) loaded into Session Input. Click Save Day to persist it.");
}

async function bulkImportAllRecords() {
    if (!_pendingImportedAllRecords || !_pendingImportedAllRecords.length) {
        closeJsonImportPreviewModal();
        return;
    }

    const count = _pendingImportedAllRecords.length;
    if (!confirm(`Are you sure you want to merge ${count} records into your current data? Existing records for the same dates will be handled.`)) {
        return;
    }

    if (typeof bulkMergeRecords === "function") {
        await bulkMergeRecords(_pendingImportedAllRecords);
    } else {
        alert("Bulk merge function not found in storage module.");
    }
    
    closeJsonImportPreviewModal();
}

function handleJsonImportFile(event) {
    const input = event && event.target ? event.target : document.getElementById("jsonImportInput");
    const file = input && input.files && input.files.length ? input.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result || ""));
            const rawRecords = extractJsonImportRecords(parsed);
            if (!rawRecords.length) {
                alert("No valid record found in this JSON file.");
                return;
            }

            const validRecords = rawRecords
                .map(buildRecordFromImport)
                .filter((r) => r && r.date);
            if (!validRecords.length) {
                alert("JSON parsed, but no valid record format was found.");
                return;
            }

            validRecords.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
            const selected = validRecords[validRecords.length - 1];
            _pendingImportedRecord = selected;
            _pendingImportedAllRecords = validRecords;
            _pendingImportMeta = validRecords.length > 1
                ? `Found ${validRecords.length} records in file. Previewing the latest date (${selected.date}).`
                : "Found 1 record in file.";
            openJsonImportPreviewModal(selected, _pendingImportMeta, validRecords.length > 1);
        } catch (err) {
            console.error("JSON import parse error:", err);
            alert("Failed to parse JSON file.");
        } finally {
            if (input) input.value = "";
        }
    };
    reader.onerror = () => {
        if (input) input.value = "";
        alert("Failed to read selected file.");
    };
    reader.readAsText(file);
}
