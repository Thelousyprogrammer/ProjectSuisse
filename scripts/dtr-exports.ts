/**
 * DTR EXPORTS MODULE
 * Handles PDF generation, preview modal, and export-related UI logic
 */

import { Store } from './store';
import { DTRI18N } from './dtr-i18n';
import { getWeekNumber, getWeekDateRange, getCurrentOjtStartDate, getCurrentRequiredOjtHours, getCurrentSemesterEndDate, getCurrentTimeZone, getTodayFileName, getDayNumberInOjtWeek } from './core/dtr-engine';
import { toGmt8DateKey } from './utils/date-utils';
import { parse as parseTOML, stringify as stringifyTOMLStandard } from 'smol-toml';
import { bulkMergeRecords as storageBulkMergeRecords } from './dtr-storage';

// ─── Preview Modal State ───────────────────────────────────────────────────
let _pendingPdfDoc: any = null;
let _pendingPdfFileName: string | null = null;
let _pendingJsonExportBlob: Blob | null = null;
let _pendingJsonExportFileName: string = "";
let _pendingJsonExportExtension: string = "json";
let _exportsImportedImageIds: string[] = [];

// ─── Export Week Selector Helpers ─────────────────────────────────────────

function updateExportWeekOptions(): void {
    const select = document.getElementById("exportWeekSelect") as HTMLSelectElement;
    if (!select) return;

    const currentValue = select.value;
    const allWeeksLabel = DTRI18N ? DTRI18N.t("all_weeks") : "All Weeks";
    select.innerHTML = `<option value="all">${allWeeksLabel}</option>`;
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    const weeks = [...new Set(records.map((r: any) => getWeekNumber(new Date(r.date))))].sort((a: any, b: any) => b - a);

    weeks.forEach(w => {
        const range = getWeekDateRange(w as number);
        const opt = document.createElement("option");
        opt.value = String(w);
        opt.textContent = DTRI18N ? DTRI18N.t("week_label", { week: String(w) }) : `Week ${w}`;
        opt.title = `${range.start} – ${range.end}`;
        select.appendChild(opt);
    });

    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }
    updateExportWeekRangeLabel();
}

function updateExportWeekRangeLabel(): void {
    const select = document.getElementById("exportWeekSelect") as HTMLSelectElement;
    const label = document.getElementById("exportWeekRangeLabel");
    if (!select || !label) return;
    const val = select.value;
    if (val === "all") { label.textContent = ""; return; }
    const range = getWeekDateRange(parseInt(val, 10));
    const short = (d: Date | null | undefined) => d instanceof Date ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "";
    label.textContent = range.startDate && range.endDate ? `${short(range.startDate)} – ${short(range.endDate)}` : "";
}

// ─── Weekly Data Aggregator ────────────────────────────────────────────────

function getWeeklyDTR(filterWeek = "all"): any[] {
    const weeks: Record<number, any> = {};
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    records.forEach((r: any) => {
        const week = getWeekNumber(new Date(r.date));
        if (filterWeek !== "all" && String(week) !== filterWeek) return;

        if (!weeks[week]) {
            weeks[week] = {
                week, totalHours: 0, personalHours: 0, sleepHours: 0, recoveryHours: 0,
                accomplishments: [], tools: new Set<string>()
            };
        }
        weeks[week].totalHours     += parseFloat(r.hours) || 0;
        weeks[week].personalHours  += parseFloat(r.personalHours) || 0;
        weeks[week].sleepHours     += parseFloat(r.sleepHours)    || 0;
        weeks[week].recoveryHours  += parseFloat(r.recoveryHours) || 0;
        if (Array.isArray(r.accomplishments)) {
            r.accomplishments.forEach((a: string) => weeks[week].accomplishments.push({ date: r.date, text: a }));
        }
        if (Array.isArray(r.tools)) {
            r.tools.forEach((t: string) => weeks[week].tools.add(t));
        }
    });
    return Object.values(weeks).map((w: any) => ({ ...w, tools: [...w.tools] }));
}

function getPDFLabel(t: any, key: string, defaultText: string, params: any = {}): string {
    let value = t(key, params) || defaultText;
    if (typeof value === 'string' && params && Object.keys(params).length) {
        Object.keys(params).forEach(param => {
            value = value.replace(new RegExp(`\\{${param}\\}`, 'g'), String(params[param]));
        });
    }
    return value;
}

// ─── PDF Preview Modal ─────────────────────────────────────────────────────

function showPdfPreview(doc: any, fileName: string, title: string): void {
    _pendingPdfDoc = doc;
    _pendingPdfFileName = fileName;

    const blobUrl = doc.output('bloburl');
    const frame   = document.getElementById('pdfPreviewFrame') as HTMLIFrameElement;
    const modal   = document.getElementById('pdfPreviewModal');
    const titleEl = document.getElementById('pdfPreviewTitle');

    if (titleEl) titleEl.textContent = title;
    if (frame)   frame.src           = blobUrl;
    if (modal)   modal.style.display = 'flex';
}

function closePdfPreview(): void {
    const modal = document.getElementById('pdfPreviewModal');
    const frame = document.getElementById('pdfPreviewFrame') as HTMLIFrameElement;
    if (frame) frame.src           = '';
    if (modal) modal.style.display = 'none';
    _pendingPdfDoc      = null;
    _pendingPdfFileName = null;
}

function triggerPdfDownload(): void {
    if (_pendingPdfDoc && _pendingPdfFileName) {
        _pendingPdfDoc.save(_pendingPdfFileName);
        closePdfPreview();
    }
}

// ─── Export All (Daily DTR) ────────────────────────────────────────────────

function exportPDF(): void {
    const Store = (window as any).Store;
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!records.length) { alert("No records to export."); return; }
    const jsPDF = (window as any).jspdf.jsPDF;
    const doc = new jsPDF("p", "mm", "a4");
    let y = 15;

    const t = ((window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function") ? (window as any).DTRI18N.t : (k: string) => k;

    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(200, 20, 0);
    doc.text(getPDFLabel(t, "exports.daily_report_title", "Daily DTR Report"), 105, y, { align: "center" });
    y += 6;

    // Sub-label
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    const genText = getPDFLabel(t, "exports.generated_on", "Generated: {date}", { date: new Date().toLocaleDateString() });
    const recText = getPDFLabel(t, "exports.total_records", "Total Records: {count}", { count: records.length });
    doc.text(`${genText}  •  ${recText}`, 105, y, { align: "center" });
    y += 6;

    // Rule
    doc.setDrawColor(200, 20, 0);
    doc.setLineWidth(0.5);
    doc.line(10, y, 200, y);
    y += 8;

    records.forEach((r: any) => {
        // Date / Hours header (Dark Red)
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(180, 15, 0);
        doc.text(`${r.date}`, 10, y);

        // Hours value (Navy Blue)
        doc.setTextColor(30, 50, 140);
        const delta = parseFloat(r.delta) || 0;
        doc.text(`${r.hours}h  (Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`, 60, y);
        y += 6;

        // Reflection label + text (Dark Gray / Near Black)
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(getPDFLabel(t, "exports.summary_reflection", "Reflection:"), 10, y); y += 5;
        doc.setFont(undefined, 'normal');
        doc.setTextColor(25, 25, 25);
        const lines = doc.splitTextToSize(r.reflection || "—", 178);
        lines.forEach((line: string) => { doc.text(line, 12, y); y += 5; });

        // Accomplishments (Dark Gray label, Near Black bullets)
        if (Array.isArray(r.accomplishments) && r.accomplishments.length) {
            doc.setFont(undefined, 'bold');
            doc.setTextColor(60, 60, 60);
            doc.text(getPDFLabel(t, "exports.summary_accomplishments", "Accomplishments:"), 10, y); y += 5;
            doc.setFont(undefined, 'normal');
            doc.setTextColor(25, 25, 25);
            r.accomplishments.forEach((a: string) => { doc.text("• " + a, 14, y); y += 5; });
        }

        // Tools (Teal italic)
        if (Array.isArray(r.tools) && r.tools.length) {
            doc.setFontSize(8);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(30, 110, 110);
            doc.text((getPDFLabel(t, "exports.summary_tools_used", "Tools:") + " " ) + r.tools.join(", "), 10, y); y += 5;
            doc.setFont(undefined, 'normal');
        }

        // L2 Telemetry (Slate gray)
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(90, 100, 115);
        const tel = `${getPDFLabel(t, "exports.summary_l2_telemetry", "L2 Telemetry")} — ${getPDFLabel(t, "exports.summary_personal", "Personal:")} ${parseFloat(r.personalHours)||0}h  |  ${getPDFLabel(t, "exports.summary_sleep", "Sleep:")} ${parseFloat(r.sleepHours)||0}h  |  ${getPDFLabel(t, "exports.summary_recovery", "Recovery:")} ${parseFloat(r.recoveryHours)||0}h  |  ${getPDFLabel(t, "exports.summary_identity", "Identity:")} ${r.identityScore || "—"}`;
        doc.text(tel, 10, y); y += 8;

        // Thin row separator
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.line(10, y, 200, y);
        y += 5;

        if (y > 260) { doc.addPage(); y = 15; }
    });

    const previewAllRecords = getPDFLabel(t, "exports.all_records", "All Records");
    const previewDailyTitle = `${getPDFLabel(t, "exports.daily_report_title", "Daily DTR Report")} – ${previewAllRecords}`;
    showPdfPreview(doc, (window as any).getTodayFileName("Daily_DTR_Report", "pdf"), previewDailyTitle);
}

// ─── Export Weekly ─────────────────────────────────────────────────────────

function exportWeeklyPDF(): void {
    const Store = (window as any).Store;
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!records.length) { alert("No records to export."); return; }
    const jsPDF = (window as any).jspdf.jsPDF;
    const doc = new jsPDF("p", "mm", "a4");
    const t = ((window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function") ? (window as any).DTRI18N.t : (k: string) => k;

    const filterWeek = (document.getElementById("exportWeekSelect") as HTMLSelectElement).value;
    const allWeeksLabel = getPDFLabel(t, "ui.all_weeks", "All Weeks");
    const weekLabelText = getPDFLabel(t, "ui.week_label", "Week {week}", { week: filterWeek });
    const weekLabel  = filterWeek === "all" ? allWeeksLabel : weekLabelText;

    let y = 20;
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(200, 20, 0);
    doc.text(getPDFLabel(t, "exports.weekly_report_title", "Weekly DTR Report"), 105, y, { align: "center" });
    y += 6;

    // ── Sub-label (Mid Gray)
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120, 120, 120);
    const filterTxt = getPDFLabel(t, "exports.filter_label", "Filter: {filter}", { filter: weekLabel });
    const genTxt = getPDFLabel(t, "exports.generated_on", "Generated: {date}", { date: new Date().toLocaleDateString() });
    doc.text(`${filterTxt}  •  ${genTxt}`, 105, y, { align: "center" });
    y += 8;

    // ── Header rule (Red)
    doc.setDrawColor(200, 20, 0);
    doc.setLineWidth(0.5);
    doc.line(10, y, 200, y);
    y += 8;

    const weeks = getWeeklyDTR(filterWeek);
    weeks.forEach((w: any, idx: number) => {

        // ── Week Header (Dark Red)
        doc.setFontSize(13);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(180, 15, 0);
        doc.text(getPDFLabel(t, "exports.week_summary_title", "Week {week} Summary", { week: String(w.week) }), 10, y);
        y += 7;

        // ── Total Hours label + value (Navy Blue)
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(30, 50, 140);
        doc.text(getPDFLabel(t, "exports.summary_ojt_hours", "Total OJT Hours:"), 10, y);
        doc.setFont(undefined, 'bold');
        doc.text(`${w.totalHours.toFixed(1)} hrs`, 52, y);
        y += 7;

        const l2Label = getPDFLabel(t, "exports.summary_l2_telemetry", "L2 Telemetry");
        const pers = getPDFLabel(t, "exports.summary_personal", "Personal:");
        const sleep = getPDFLabel(t, "exports.summary_sleep", "Sleep:");
        const recov = getPDFLabel(t, "exports.summary_recovery", "Recovery:");
        const l2 = `${l2Label} — ${pers} ${w.personalHours.toFixed(1)}h  |  ${sleep} ${w.sleepHours.toFixed(1)}h  |  ${recov} ${w.recoveryHours.toFixed(1)}h`;
        doc.text(l2, 10, y);
        y += 6;

        // ── Tools (Dark Teal, Italic)
        if (w.tools.length) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(30, 110, 110);
            const toolLines = doc.splitTextToSize(`${getPDFLabel(t, "exports.summary_tools_used", "Tools Used:")} ${w.tools.join(", ")}`, 185);
            toolLines.forEach((line: string) => { doc.text(line, 10, y); y += 5; });
            doc.setFont(undefined, 'normal');
            y += 1;
        }

        // ── Accomplishments (Dark Gray label, Near-Black bullets with muted date)
        if (w.accomplishments.length) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(60, 60, 60);
            doc.text(getPDFLabel(t, "exports.summary_accomplishments", "Accomplishments:"), 10, y);
            y += 5;

            w.accomplishments.forEach((a: any) => {
                // Date stamp (Light Gray)
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text(`[${a.date}]`, 14, y);

                // Accomplishment text (Near Black)
                doc.setFontSize(9);
                doc.setTextColor(25, 25, 25);
                const textLines = doc.splitTextToSize(a.text, 158);
                textLines.forEach((line: string, li: number) => {
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

    const previewWeeklyTitle = `${getPDFLabel(t, "exports.weekly_report_title", "Weekly DTR Report")} – ${weekLabel}`;
    showPdfPreview(doc, (window as any).getTodayFileName("WeeklyReport", "pdf"), previewWeeklyTitle);
}

function exportDOCX(): void {
    const Store = (window as any).Store;
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!records.length) { alert("No records to export."); return; }
    if (!(window as any).docx || !(window as any).saveAs) {
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
    } = (window as any).docx;

    const startDateKey = (typeof (window as any).getCurrentOjtStartDate === "function")
        ? (window as any).getCurrentOjtStartDate()
        : (window as any).toGmt8DateKey((window as any).OJT_START);
    const semesterEndKey = (typeof (window as any).getCurrentSemesterEndDate === "function")
        ? (window as any).getCurrentSemesterEndDate()
        : "";
    const timeZoneId = (typeof (window as any).getCurrentTimeZone === "function")
        ? (window as any).getCurrentTimeZone()
        : (window as any).DEFAULT_TIMEZONE;
    const totalHours = records.reduce((sum: number, r: any) => sum + (parseFloat(r.hours) || 0), 0);

    const t = ((window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function") ? (window as any).DTRI18N.t : (k: string) => k;
    const generatedOnText = getPDFLabel(t, "exports.generated_on", "Generated: {date}", { date: new Date().toLocaleDateString() });
    const totalRecordsText = getPDFLabel(t, "exports.total_records", "Total Records: {count}", { count: records.length });
    const startLabel = getPDFLabel(t, "exports.start_label", "Start");
    const endLabel = getPDFLabel(t, "exports.end_label", "End");
    const timezoneLabel = getPDFLabel(t, "exports.timezone_label", "TZ");
    const totalHoursLabel = getPDFLabel(t, "exports.total_hours_label", "Hours");
    const notAvailableLabel = getPDFLabel(t, "exports.not_available", "N/A");
    const deltaLabel = getPDFLabel(t, "exports.delta_label", "Delta");

    const children: any[] = [
        new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun(getPDFLabel(t, "exports.daily_report_title", "Daily DTR Report"))]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun(`${generatedOnText}  |  ${startLabel}: ${startDateKey}  |  ${endLabel}: ${semesterEndKey}  |  ${timezoneLabel}: ${timeZoneId}  |  ${totalRecordsText}  |  ${totalHoursLabel}: ${totalHours.toFixed(1)}`)
            ]
        }),
        new Paragraph({ text: "" })
    ];

    records.forEach((r: any) => {
        const weekNum = (window as any).getWeekNumber(r.date);
        const identityLabel = (window as any).getIdentityAlignmentLabel ? (window as any).getIdentityAlignmentLabel(r.identityScore || 0) : String(r.identityScore || 0);
        const toolsText = Array.isArray(r.tools) && r.tools.length ? r.tools.join(", ") : notAvailableLabel;
        const accomplishments = Array.isArray(r.accomplishments) ? r.accomplishments.filter(Boolean) : [];

        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun(`${r.date} (${getPDFLabel(t, "ui.week_label", "Week {week}", { week: String(weekNum) })})`)]
            }),
            new Paragraph({
                children: [
                    new TextRun(`${t("telemetry_dashboard.summary_hours_worked") || "Hours"}: ${r.hours}h  |  ${deltaLabel}: ${parseFloat(r.delta) >= 0 ? "+" : ""}${(parseFloat(r.delta)||0).toFixed(2)}h`)
                ]
            }),
            new Paragraph({ children: [new TextRun(`${getPDFLabel(t, "exports.summary_reflection", "Reflection")}: ${r.reflection || "-"}`)] }),
            new Paragraph({ children: [new TextRun(`${getPDFLabel(t, "exports.summary_tools_used", "Tools")}: ${toolsText}`)] }),
            new Paragraph({
                children: [
                    new TextRun(`${getPDFLabel(t, "exports.summary_l2_telemetry", "L2 Telemetry")}: ${getPDFLabel(t, "exports.summary_personal", "Personal")} ${parseFloat(r.personalHours) || 0}h | ${getPDFLabel(t, "exports.summary_sleep", "Sleep")} ${parseFloat(r.sleepHours) || 0}h | ${getPDFLabel(t, "exports.summary_recovery", "Recovery")} ${parseFloat(r.recoveryHours) || 0}h | ${getPDFLabel(t, "exports.summary_identity", "Identity")} ${identityLabel}`)
                ]
            })
        );

        if (accomplishments.length) {
            children.push(new Paragraph({ children: [new TextRun(getPDFLabel(t, "exports.summary_accomplishments", "Accomplishments:"))] }));
            accomplishments.forEach((a: string) => {
                children.push(new Paragraph({ text: a, bullet: { level: 0 } }));
            });
        }

        children.push(new Paragraph({ text: "" }));
    });

    const doc = new Document({
        sections: [{ properties: {}, children }]
    });

    Packer.toBlob(doc)
        .then((blob: Blob) => {
            (window as any).saveAs(blob, (window as any).getTodayFileName("Daily_DTR_Report", "docx"));
        })
        .catch((err: any) => {
            console.error("DOCX export failed:", err);
            alert("DOCX export failed. Check console for details.");
        });
}

function exportWeeklyDOCX(): void {
    const Store = (window as any).Store;
    const records = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!records.length) { alert("No records to export."); return; }
    if (!(window as any).docx || !(window as any).saveAs) {
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
    } = (window as any).docx;

    const weekSelect = document.getElementById("exportWeekSelect") as HTMLSelectElement;
    const filterWeek = weekSelect ? weekSelect.value : "all";
    const allWeeksLabel = (window as any).DTRI18N ? (window as any).DTRI18N.t("all_weeks") : "All Weeks";
    const weekLabelText = (window as any).DTRI18N ? (window as any).DTRI18N.t("week_label", { week: filterWeek }) : `Week ${filterWeek}`;
    const weekLabel = filterWeek === "all" ? allWeeksLabel : weekLabelText;
    const weeks = getWeeklyDTR(filterWeek);
    if (!weeks.length) {
        alert("No weekly records found for the selected filter.");
        return;
    }

    const t = ((window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function") ? (window as any).DTRI18N.t : (k: string) => k;
    const filterTxt = getPDFLabel(t, "exports.filter_label", "Filter: {filter}", { filter: weekLabel });
    const genTxt = getPDFLabel(t, "exports.generated_on", "Generated: {date}", { date: new Date().toLocaleDateString() });

    const children: any[] = [
        new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [new TextRun(getPDFLabel(t, "exports.weekly_report_title", "Weekly DTR Report"))]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun(`${filterTxt}  |  ${genTxt}`)]
        }),
        new Paragraph({ text: "" })
    ];

    weeks.forEach((w: any) => {
        const weekRange = (window as any).getWeekDateRange(w.week);
        const l2Label = getPDFLabel(t, "exports.summary_l2_telemetry", "L2 Telemetry");
        const pers = getPDFLabel(t, "exports.summary_personal", "Personal:");
        const sleep = getPDFLabel(t, "exports.summary_sleep", "Sleep:");
        const recov = getPDFLabel(t, "exports.summary_recovery", "Recovery:");

        children.push(
            new Paragraph({
                heading: HeadingLevel.HEADING_2,
                children: [new TextRun(getPDFLabel(t, "exports.week_summary_title", "Week {week} Summary", { week: String(w.week) }))]
            }),
            new Paragraph({
                children: [new TextRun(`${weekRange.start} - ${weekRange.end}`)]
            }),
            new Paragraph({
                children: [new TextRun(`${getPDFLabel(t, "exports.summary_ojt_hours", "Total OJT Hours:")} ${parseFloat(w.totalHours).toFixed(1)}h`)]
            }),
            new Paragraph({
                children: [new TextRun(`${l2Label}: ${pers} ${parseFloat(w.personalHours).toFixed(1)}h | ${sleep} ${parseFloat(w.sleepHours).toFixed(1)}h | ${recov} ${parseFloat(w.recoveryHours).toFixed(1)}h`)]
            })
        );

        if (w.tools.length) {
            children.push(
                new Paragraph({
                    children: [new TextRun(`${getPDFLabel(t, "exports.summary_tools_used", "Tools Used:")} ${w.tools.join(", ")}`)]
                })
            );
        }

        if (w.accomplishments.length) {
            children.push(new Paragraph({ children: [new TextRun(getPDFLabel(t, "exports.summary_accomplishments", "Accomplishments:"))] }));
            w.accomplishments.forEach((a: any) => {
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
        .then((blob: Blob) => {
            (window as any).saveAs(blob, (window as any).getTodayFileName(`Weekly_DTR_Report_${safeWeek}`, "docx"));
        })
        .catch((err: any) => {
            console.error("Weekly DOCX export failed:", err);
            alert("Weekly DOCX export failed. Check console for details.");
        });
}

let _pendingImportedRecord: any = null;
let _pendingImportedAllRecords: any[] = [];
let _pendingImportMeta: string = "";

function getRecordTimelineData(dateLike: any): { weekNumber: number, dayNumber: number, label: string } {
    const weekNumber = getWeekNumber(dateLike);
    const dayNumber = getDayNumberInOjtWeek ? getDayNumberInOjtWeek(dateLike) : 1;
    return {
        weekNumber,
        dayNumber,
        label: `Week: ${weekNumber} | Day: ${dayNumber}`
    };
}

async function normalizeRecordForJson(record: any, includeImages = false): Promise<any> {
    const safe = record || {};
    const dateKey = toGmt8DateKey(safe.date) || safe.date || "";
    const timeline = getRecordTimelineData(dateKey);
    
    let embeddedImages: string[] = [];
    if (includeImages && typeof (window as any).getRecordImageUrls === "function") {
        try {
            embeddedImages = await (window as any).getRecordImageUrls(safe);
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
            ? safe.accomplishments.map((a: string) => String(a || "").trim()).filter(Boolean)
            : [],
        tools: Array.isArray(safe.tools)
            ? safe.tools.map((t: string) => String(t || "").trim()).filter(Boolean)
            : [],
        personalHours: parseFloat(safe.personalHours) || 0,
        sleepHours: parseFloat(safe.sleepHours) || 0,
        recoveryHours: parseFloat(safe.recoveryHours) || 0,
        commuteTotal: parseFloat(safe.commuteTotal) || 0,
        commuteProductive: parseFloat(safe.commuteProductive) || 0,
        identityScore: parseInt(safe.identityScore, 10) || 0,
        embeddedImages: embeddedImages
    };
}

async function exportRecordsJSON(): Promise<void> {
    const Store = (window as any).Store;
    const storeRecords = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!Array.isArray(storeRecords) || !storeRecords.length) {
        alert("No records to export.");
        return;
    }

    const includeImages = confirm("Include images in JSON export?\n(Note: This will significantly increase file size)");

    const records = await Promise.all(storeRecords.map((r: any) => normalizeRecordForJson(r, includeImages)));

    const payload = {
        type: "custom-dtr-records-export",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: {
            ojtStartDate: (window as any).getCurrentOjtStartDate ? (window as any).getCurrentOjtStartDate() : "",
            requiredOjtHours: (window as any).getCurrentRequiredOjtHours ? (window as any).getCurrentRequiredOjtHours() : 0,
            semesterEndDate: (window as any).getCurrentSemesterEndDate ? (window as any).getCurrentSemesterEndDate() : "",
            timeZone: (window as any).getCurrentTimeZone ? (window as any).getCurrentTimeZone() : ""
        },
        recordCount: storeRecords.length,
        records: records
    };

    const jsonText = JSON.stringify(payload, null, 2);
    const fileName = (window as any).getTodayFileName ? (window as any).getTodayFileName("DTR_Records", "json") : "DTR_Records.json";
    const previewEl = document.getElementById("jsonExportPreviewText");
    const modal = document.getElementById("jsonExportPreviewModal");
    const titleEl = modal ? modal.querySelector("h3") : null;
    const downloadBtn = document.getElementById("confirmJsonExportDownloadBtn");

    if (!previewEl || !modal) {
        triggerJsonExportDownload(new Blob([jsonText], { type: "application/json;charset=utf-8" }), fileName);
        return;
    }

    _pendingJsonExportBlob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    _pendingJsonExportFileName = fileName;
    _pendingJsonExportExtension = "json";
    
    if (titleEl) titleEl.textContent = (window as any).DTRI18N ? (window as any).DTRI18N.t("json_export_preview") : "JSON Export Preview";
    if (downloadBtn) downloadBtn.textContent = (window as any).DTRI18N ? (window as any).DTRI18N.t("download_json") : "Download JSON";

    if (jsonText.length > 50000) {
        previewEl.textContent = jsonText.substring(0, 50000) + "\n\n... (preview truncated) ...";
    } else {
        previewEl.textContent = jsonText;
    }
    
    const fileNameInput = document.getElementById("jsonExportFileNameInput") as HTMLInputElement;
    if (fileNameInput) fileNameInput.value = fileName;
    modal.style.display = "flex";
}

// ─── TOML Export/Import Logic ──────────────────────────────────────────────

function stringifyTOML(obj: any): string {
    let toml = "";
    
    if (obj.type) {
        toml += "[metadata]\n";
        toml += `type = ${JSON.stringify(obj.type)}\n`;
        toml += `schemaVersion = ${obj.schemaVersion}\n`;
        toml += `exportedAt = ${JSON.stringify(obj.exportedAt)}\n\n`;
    }

    if (obj.settings) {
        toml += "[settings]\n";
        Object.entries(obj.settings).forEach(([k, v]) => {
            if (typeof v === "string") toml += `${k} = ${JSON.stringify(v)}\n`;
            else toml += `${k} = ${v}\n`;
        });
        toml += "\n";
    }

    if (Array.isArray(obj.records)) {
        obj.records.forEach((r: any) => {
            toml += "[[records]]\n";
            Object.entries(r).forEach(([k, v]) => {
                if (k === "embeddedImages") {
                    if (Array.isArray(v) && v.length > 0) {
                        toml += "embeddedImages = [\n";
                        v.forEach(img => {
                            toml += `  ${JSON.stringify(img)},\n`;
                        });
                        toml += "]\n";
                    } else {
                        toml += "embeddedImages = []\n";
                    }
                } else if (Array.isArray(v)) {
                    toml += `${k} = [${v.map(item => JSON.stringify(item)).join(", ")}]\n`;
                } else if (typeof v === "string") {
                    if (v.includes("\n") || v.includes("\r")) {
                        toml += `${k} = """\n${v.replace(/"""/g, '\\"\\"\\"')}\n"""\n`;
                    } else {
                        toml += `${k} = ${JSON.stringify(v)}\n`;
                    }
                } else {
                    toml += `${k} = ${v}\n`;
                }
            });
            toml += "\n";
        });
    }
    
    return toml;
}

function findUnescapedClosingQuote(str: string): number {
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            return i;
        }
    }
    return -1;
}

/**
 * Pre-processes TOML text to repair non-standard multiline basic strings
 * (e.g. `reflection = "line 1 \n line 2"`) into valid TOML multiline strings (`"""\n...\n"""`).
 */
function sanitizeTOMLMultilineStrings(text: string): string {
    const lines = text.split(/\r?\n/);
    const output: string[] = [];
    let inMultilineString = false;
    let multilineBuffer: string[] = [];
    let multilinePrefix = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (inMultilineString) {
            const closeIndex = findUnescapedClosingQuote(line);
            if (closeIndex !== -1) {
                const contentSoFar = line.slice(0, closeIndex);
                const restOfLine = line.slice(closeIndex + 1);
                multilineBuffer.push(contentSoFar);
                inMultilineString = false;

                const fullStr = multilineBuffer.join("\n");
                output.push(`${multilinePrefix}"""\n${fullStr.replace(/"""/g, '\\"\\"\\"')}\n"""${restOfLine}`);
                multilineBuffer = [];
                multilinePrefix = "";
            } else {
                multilineBuffer.push(line);
            }
            continue;
        }

        // If line starts a basic string (e.g. `key = "something`) but doesn't use triple quotes `"""`
        const match = line.match(/^(\s*[\w.-]+\s*=\s*)"(.*)$/);
        if (match && !line.includes('"""')) {
            const prefix = match[1];
            const rest = match[2];
            const closeIndex = findUnescapedClosingQuote(rest);
            if (closeIndex === -1) {
                // Not closed on this line!
                inMultilineString = true;
                multilinePrefix = prefix;
                multilineBuffer = [rest];
                continue;
            }
        }

        output.push(line);
    }

    if (inMultilineString) {
        const fullStr = multilineBuffer.join("\n");
        output.push(`${multilinePrefix}"""\n${fullStr.replace(/"""/g, '\\"\\"\\"')}\n"""`);
    }

    return output.join("\n");
}

function parseTOMLGeneric(text: string): any {
    const preparedText = sanitizeTOMLMultilineStrings(text);
    try {
        return parseTOML(preparedText);
    } catch (primaryErr) {
        console.warn("smol-toml parser encountered an issue, trying line parser fallback:", primaryErr);
        const result: any = { records: [] };
        let currentTable: any = null;
        let currentKey: string | null = null;
        let inArray = false;
        let arrayContent: string[] = [];

        let inMultilineVal = false;
        let multilineValAcc: string[] = [];
        let multilineEndToken = '"';

        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let line = rawLine.trim();

            if (inMultilineVal && currentKey && currentTable) {
                if (multilineEndToken === '"""') {
                    if (rawLine.includes('"""')) {
                        const idx = rawLine.indexOf('"""');
                        multilineValAcc.push(rawLine.slice(0, idx));
                        currentTable[currentKey] = multilineValAcc.join("\n");
                        inMultilineVal = false;
                        multilineValAcc = [];
                        currentKey = null;
                    } else {
                        multilineValAcc.push(rawLine);
                    }
                } else {
                    const closeIdx = findUnescapedClosingQuote(rawLine);
                    if (closeIdx !== -1) {
                        multilineValAcc.push(rawLine.slice(0, closeIdx));
                        currentTable[currentKey] = multilineValAcc.join("\n").replace(/\\"/g, '"');
                        inMultilineVal = false;
                        multilineValAcc = [];
                        currentKey = null;
                    } else {
                        multilineValAcc.push(rawLine);
                    }
                }
                continue;
            }

            if (!line || line.startsWith('#')) continue;

            if (line === "[[records]]") {
                const newRecord = {};
                result.records.push(newRecord);
                currentTable = newRecord;
                continue;
            }

            const tableMatch = line.match(/^\[(.+)\]$/);
            if (tableMatch) {
                const tableName = tableMatch[1];
                result[tableName] = result[tableName] || {};
                currentTable = result[tableName];
                continue;
            }

            if (!currentTable) {
                result.metadata = result.metadata || {};
                currentTable = result.metadata;
            }

            const kvMatch = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
            if (kvMatch) {
                const key = kvMatch[1].trim();
                let val = kvMatch[2].trim();

                if (val === "[") {
                    inArray = true;
                    currentKey = key;
                    arrayContent = [];
                    continue;
                }

                if (val.startsWith("[") && val.endsWith("]")) {
                    const inner = val.slice(1, -1).trim();
                    if (!inner) {
                        currentTable[key] = [];
                    } else {
                        currentTable[key] = inner.split(",").map((s: string) => s.trim().replace(/^["']|["']$/g, ""));
                    }
                    continue;
                }

                if (val.startsWith('"""')) {
                    const afterTriple = val.slice(3);
                    if (afterTriple.includes('"""')) {
                        currentTable[key] = afterTriple.slice(0, afterTriple.indexOf('"""'));
                    } else {
                        inMultilineVal = true;
                        multilineEndToken = '"""';
                        multilineValAcc = [afterTriple];
                        currentKey = key;
                    }
                    continue;
                }

                if (val.startsWith('"') || val.startsWith("'")) {
                    const quoteChar = val[0];
                    if (val.length > 1 && val.endsWith(quoteChar) && !val.endsWith('\\' + quoteChar)) {
                        currentTable[key] = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
                    } else {
                        inMultilineVal = true;
                        multilineEndToken = quoteChar;
                        multilineValAcc = [val.slice(1)];
                        currentKey = key;
                    }
                } else {
                    currentTable[key] = isNaN(val as any) ? val : parseFloat(val);
                }
            } else if (inArray && currentKey && currentTable) {
                if (line === "]") {
                    currentTable[currentKey] = arrayContent;
                    inArray = false;
                } else {
                    arrayContent.push(line.replace(/,$/, "").trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"'));
                }
            }
        }
        return result;
    }
}

async function exportRecordsTOML(): Promise<void> {
    const Store = (window as any).Store;
    const storeRecords = Store && Store.getRecords() ? Store.getRecords() : [];
    if (!Array.isArray(storeRecords) || !storeRecords.length) {
        alert("No records to export.");
        return;
    }

    const includeImages = confirm("Include images in TOML export?\n(Note: This will significantly increase file size)");

    const records = await Promise.all(storeRecords.map((r: any) => normalizeRecordForJson(r, includeImages)));

    const payload = {
        type: "custom-dtr-records-export",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: {
            ojtStartDate: (window as any).getCurrentOjtStartDate ? (window as any).getCurrentOjtStartDate() : "",
            requiredOjtHours: (window as any).getCurrentRequiredOjtHours ? (window as any).getCurrentRequiredOjtHours() : 0,
            semesterEndDate: (window as any).getCurrentSemesterEndDate ? (window as any).getCurrentSemesterEndDate() : "",
            timeZone: (window as any).getCurrentTimeZone ? (window as any).getCurrentTimeZone() : ""
        },
        records: records
    };

    const tomlText = stringifyTOML(payload);
    const fileName = (window as any).getTodayFileName ? (window as any).getTodayFileName("DTR_Records", "toml") : "DTR_Records.toml";
    
    const previewEl = document.getElementById("jsonExportPreviewText");
    const modal = document.getElementById("jsonExportPreviewModal");
    const titleEl = modal ? modal.querySelector("h3") : null;
    const downloadBtn = document.getElementById("confirmJsonExportDownloadBtn");

    if (!previewEl || !modal) {
        triggerJsonExportDownload(new Blob([tomlText], { type: "text/plain;charset=utf-8" }), fileName);
        return;
    }

    _pendingJsonExportBlob = new Blob([tomlText], { type: "text/plain;charset=utf-8" });
    _pendingJsonExportFileName = fileName;
    _pendingJsonExportExtension = "toml";
    
    if (titleEl) titleEl.textContent = (window as any).DTRI18N ? (window as any).DTRI18N.t("toml_export_preview") : "TOML Export Preview";
    if (downloadBtn) downloadBtn.textContent = (window as any).DTRI18N ? (window as any).DTRI18N.t("download_toml") : "Download TOML";

    if (tomlText.length > 50000) {
        previewEl.textContent = tomlText.substring(0, 50000) + "\n\n... (preview truncated) ...";
    } else {
        previewEl.textContent = tomlText;
    }
    
    const fileNameInput = document.getElementById("jsonExportFileNameInput") as HTMLInputElement;
    if (fileNameInput) fileNameInput.value = fileName;
    modal.style.display = "flex";
}

async function handleTomlImportFile(event: Event): Promise<void> {
    const input = (event && event.target ? event.target : document.getElementById("tomlImportInput")) as HTMLInputElement;
    const file = input && input.files && input.files.length ? input.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result as string;
            const parsed = parseTOMLGeneric(text);
            const rawRecords = extractJsonImportRecords(parsed);
            
            if (!rawRecords.length) {
                alert("No valid records found in TOML file.");
                return;
            }

            const records = rawRecords.map(buildRecordFromImport).filter(Boolean);
            if (!records.length) {
                alert("Could not normalize any records from TOML.");
                return;
            }

            records.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
            const selected = records[records.length - 1];
            _pendingImportedAllRecords = records;
            _pendingImportedRecord = selected;
            const meta = records.length > 1
                ? `TOML Import: ${file.name} (${records.length} records). Previewing latest date (${selected.date}).`
                : `TOML Import: ${file.name}`;
            openJsonImportPreviewModal(selected, meta, true);
        } catch (err: any) {
            console.error("TOML Import Error:", err);
            alert(`Failed to parse TOML file: ${err && err.message ? err.message : err}`);
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

function triggerJsonExportDownload(blob: Blob, fileName: string): void {
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

function closeJsonExportPreview(): void {
    const modal = document.getElementById("jsonExportPreviewModal");
    const previewEl = document.getElementById("jsonExportPreviewText");
    const fileNameInput = document.getElementById("jsonExportFileNameInput") as HTMLInputElement;
    if (modal) modal.style.display = "none";
    if (previewEl) previewEl.textContent = "";
    if (fileNameInput) fileNameInput.value = "";
    _pendingJsonExportBlob = null;
    _pendingJsonExportFileName = "";
}

function sanitizeJsonFileName(rawName: string, fallbackName: string, ext = "json"): string {
    let name = String(rawName || "").trim();
    if (!name) name = fallbackName || `DTR_Record_Name.${ext}`;
    name = name.replace(/[\\/:*?"<>|]/g, "_");
    
    const targetExt = `.${ext.toLowerCase()}`;
    if (!name.toLowerCase().endsWith(targetExt)) {
        name = name.replace(/\.(json|toml)$/i, "");
        name += targetExt;
    }
    return name;
}

function confirmJsonExportDownload(): void {
    if (!_pendingJsonExportBlob || !_pendingJsonExportFileName) {
        closeJsonExportPreview();
        return;
    }
    const fileNameInput = document.getElementById("jsonExportFileNameInput") as HTMLInputElement;
    const chosenName = sanitizeJsonFileName(
        fileNameInput ? fileNameInput.value : "",
        _pendingJsonExportFileName,
        _pendingJsonExportExtension || "json"
    );
    triggerJsonExportDownload(_pendingJsonExportBlob, chosenName);
    closeJsonExportPreview();
}

function extractJsonImportRecords(parsed: any): any[] {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.records)) return parsed.records;
        if (parsed.record && typeof parsed.record === "object") return [parsed.record];
        if (typeof parsed.date !== "undefined" && typeof parsed.hours !== "undefined") return [parsed];
    }
    return [];
}

function normalizeRecordForImport(record: any): any {
    const safe = record || {};
    const dateKey = toGmt8DateKey(safe.date) || safe.date || "";
    const timeline = getRecordTimelineData(dateKey);
    return {
        date: dateKey,
        weekNumber: timeline.weekNumber,
        dayNumber: timeline.dayNumber,
        timelineLabel: timeline.label,
        hours: parseFloat(safe.hours) || 0,
        reflection: typeof safe.reflection === "string" ? safe.reflection : "",
        accomplishments: Array.isArray(safe.accomplishments)
            ? safe.accomplishments.map((a: string) => String(a || "").trim()).filter(Boolean)
            : [],
        tools: Array.isArray(safe.tools)
            ? safe.tools.map((t: string) => String(t || "").trim()).filter(Boolean)
            : [],
        personalHours: parseFloat(safe.personalHours) || 0,
        sleepHours: parseFloat(safe.sleepHours) || 0,
        recoveryHours: parseFloat(safe.recoveryHours) || 0,
        commuteTotal: parseFloat(safe.commuteTotal) || 0,
        commuteProductive: parseFloat(safe.commuteProductive) || 0,
        identityScore: parseInt(safe.identityScore, 10) || 0,
        embeddedImages: Array.isArray(safe.embeddedImages) ? [...new Set(safe.embeddedImages)].slice(0, 1) : []
    };
}

function buildRecordFromImport(raw: any): any | null {
    const normalized = normalizeRecordForImport(raw);
    if (!normalized.date || !Number.isFinite(normalized.hours)) return null;
    return normalized;
}

function openJsonImportPreviewModal(record: any, metaLabel: string, showBulk = false): void {
    const modal = document.getElementById("jsonImportPreviewModal");
    if (!modal) return;
    const timeline = getRecordTimelineData(record.date);

    const bulkBtn = document.getElementById("confirmBulkImportBtn");
    if (bulkBtn) {
        bulkBtn.style.display = showBulk ? "inline-block" : "none";
        const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
        if (_pendingImportedAllRecords && _pendingImportedAllRecords.length === 1) {
            bulkBtn.textContent = t ? t("import_record_json") : "Import Record to Data";
        } else {
            const count = _pendingImportedAllRecords ? _pendingImportedAllRecords.length : 0;
            bulkBtn.textContent = t ? t("bulk_import_all_records") : `Bulk Import All (${count})`;
        }
    }

    const dateEl = document.getElementById("jsonPreviewDate");
    if (dateEl) dateEl.textContent = record.date ? `${record.date} (${timeline.label})` : "-";
    
    const hoursEl = document.getElementById("jsonPreviewHours");
    if (hoursEl) hoursEl.textContent = String(record.hours ?? "-");
    
    const accomplishmentsEl = document.getElementById("jsonPreviewAccomplishments");
    if (accomplishmentsEl) accomplishmentsEl.textContent = String((record.accomplishments || []).length);
    
    const toolsEl = document.getElementById("jsonPreviewTools");
    if (toolsEl) toolsEl.textContent = String((record.tools || []).length);
    
    const personalEl = document.getElementById("jsonPreviewPersonal");
    if (personalEl) personalEl.textContent = String(record.personalHours ?? 0);
    
    const sleepEl = document.getElementById("jsonPreviewSleep");
    if (sleepEl) sleepEl.textContent = String(record.sleepHours ?? 0);
    
    const recoveryEl = document.getElementById("jsonPreviewRecovery");
    if (recoveryEl) recoveryEl.textContent = String(record.recoveryHours ?? 0);
    
    const identityEl = document.getElementById("jsonPreviewIdentity");
    if (identityEl) identityEl.textContent = (window as any).getIdentityAlignmentLabel ? (window as any).getIdentityAlignmentLabel(record.identityScore || 0) : String(record.identityScore || 0);
    
    const imgCountEl = document.getElementById("jsonPreviewImagesCount");
    if (imgCountEl) {
        imgCountEl.textContent = String((record.embeddedImages || []).length);
    }

    const reflectionEl = document.getElementById("jsonPreviewReflection");
    if (reflectionEl) reflectionEl.textContent = record.reflection || "-";
    
    const metaEl = document.getElementById("jsonPreviewMeta");
    if (metaEl) metaEl.textContent = metaLabel || "";
    
    modal.style.display = "flex";
}

function closeJsonImportPreviewModal(): void {
    _pendingImportedRecord = null;
    _pendingImportedAllRecords = [];
    _pendingImportMeta = "";
    const modal = document.getElementById("jsonImportPreviewModal");
    if (modal) modal.style.display = "none";
}

async function applyImportedRecordToForm(record: any): Promise<void> {
    const elDate = document.getElementById("date") as HTMLInputElement;
    if (elDate) elDate.value = record.date || "";
    
    const elHours = document.getElementById("hours") as HTMLInputElement;
    if (elHours) elHours.value = record.hours ?? "";
    
    const elReflection = document.getElementById("reflection") as HTMLInputElement;
    if (elReflection) elReflection.value = record.reflection || "";
    
    const elAccomplishments = document.getElementById("accomplishments") as HTMLTextAreaElement;
    if (elAccomplishments) elAccomplishments.value = (record.accomplishments || []).join("\n");
    
    const elTools = document.getElementById("tools") as HTMLInputElement;
    if (elTools) elTools.value = (record.tools || []).join(", ");
    
    const elPersonalHours = document.getElementById("personalHours") as HTMLInputElement;
    if (elPersonalHours) elPersonalHours.value = record.personalHours || "";
    
    const elSleepHours = document.getElementById("sleepHours") as HTMLInputElement;
    if (elSleepHours) elSleepHours.value = record.sleepHours || "";
    
    const elRecoveryHours = document.getElementById("recoveryHours") as HTMLInputElement;
    if (elRecoveryHours) elRecoveryHours.value = record.recoveryHours || "";
    
    const elCommuteTotal = document.getElementById("commuteTotal") as HTMLInputElement;
    if (elCommuteTotal) elCommuteTotal.value = record.commuteTotal || "";
    
    const elCommuteProductive = document.getElementById("commuteProductive") as HTMLInputElement;
    if (elCommuteProductive) elCommuteProductive.value = record.commuteProductive || "";
    
    const elIdentityScore = document.getElementById("identityScore") as HTMLInputElement;
    if (elIdentityScore) elIdentityScore.value = String(record.identityScore || 0);

    const imgInput = document.getElementById("images") as HTMLInputElement;
    if (imgInput) imgInput.value = "";
    
    _exportsImportedImageIds = [];
    const preview = document.getElementById("imagePreview");
    if (preview) preview.innerHTML = "";

    if (Array.isArray(record.embeddedImages) && record.embeddedImages.length > 0) {
        try {
            if (typeof (window as any).saveImageToStore === "function") {
                _exportsImportedImageIds = await Promise.all(
                    record.embeddedImages.map((img: string) => (window as any).saveImageToStore(img))
                );
                
                if (preview) {
                    const label = document.createElement("p");
                    label.style.cssText = "width:100%; font-size:10px; margin-bottom:5px; opacity:0.8;";
                    label.textContent = `Imported Images (${_exportsImportedImageIds.length}):`;
                    preview.appendChild(label);

                    _exportsImportedImageIds.forEach(id => {
                        if (typeof (window as any).getImageFromStore === "function") {
                            (window as any).getImageFromStore(id).then((url: string) => {
                                const img = document.createElement("img");
                                img.src = url;
                                img.style.cssText = "width:60px; height:60px; object-fit:cover; border-radius:6px; border:2px solid var(--accent);";
                                preview.appendChild(img);
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.error("Failed to restore images for form preview:", e);
        }
    }

    if (typeof (window as any).updateWeeklyCounter === "function") {
        (window as any).updateWeeklyCounter(record.date);
    }
}

async function confirmJsonImportToForm(): Promise<void> {
    if (!_pendingImportedRecord) {
        closeJsonImportPreviewModal();
        return;
    }
    await applyImportedRecordToForm(_pendingImportedRecord);
    closeJsonImportPreviewModal();
    const formCard = document.getElementById("formCard") || document.getElementById("dtrForm");
    if (formCard) {
        if (formCard.classList.contains("collapsed")) {
            formCard.classList.remove("collapsed");
        }
        formCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    alert("Imported record (including images) loaded into Session Input. Click Save Day to persist it.");
}

async function bulkImportAllRecords(): Promise<void> {
    if (!_pendingImportedAllRecords || !_pendingImportedAllRecords.length) {
        closeJsonImportPreviewModal();
        return;
    }

    const count = _pendingImportedAllRecords.length;
    const confirmPrompt = count === 1
        ? "Are you sure you want to merge this record into your data? Existing records for the same date will be handled."
        : `Are you sure you want to merge ${count} records into your current data? Existing records for the same dates will be handled.`;

    if (!confirm(confirmPrompt)) {
        return;
    }

    const mergeFn = typeof storageBulkMergeRecords === "function" 
        ? storageBulkMergeRecords 
        : (window as any).bulkMergeRecords;

    if (typeof mergeFn === "function") {
        await mergeFn(_pendingImportedAllRecords);
        if (typeof (window as any).notifyDTRDataChanged === "function") {
            (window as any).notifyDTRDataChanged();
        }
    } else {
        alert("Bulk merge function not found in storage module.");
    }
    
    closeJsonImportPreviewModal();
}

import { z } from 'zod';
import { SecurityMonitor } from './utils/security-monitor';

const ExportPayloadSchema = z.object({
    dtrEngineConfig: z.any().optional(),
    records: z.array(z.any()),
    images: z.array(z.any()).optional()
}).passthrough();

function handleJsonImportFile(event: Event): void {
    const input = (event && event.target ? event.target : document.getElementById("jsonImportInput")) as HTMLInputElement;
    const file = input && input.files && input.files.length ? input.files[0] : null;
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
        alert("File size exceeds 50MB limit.");
        input.value = "";
        return;
    }

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
            openJsonImportPreviewModal(selected, _pendingImportMeta, true);
        } catch (err: any) {
            console.error("JSON import parse error:", err);
            alert(`Failed to parse JSON file: ${err && err.message ? err.message : err}`);
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

export {
    updateExportWeekOptions,
    updateExportWeekRangeLabel,
    getWeeklyDTR,
    showPdfPreview,
    closePdfPreview,
    triggerPdfDownload,
    exportPDF,
    exportWeeklyPDF,
    exportDOCX,
    exportWeeklyDOCX,
    getRecordTimelineData,
    normalizeRecordForJson,
    exportRecordsJSON,
    triggerJsonExportDownload,
    closeJsonExportPreview,
    sanitizeJsonFileName,
    confirmJsonExportDownload,
    extractJsonImportRecords,
    normalizeRecordForImport,
    buildRecordFromImport,
    openJsonImportPreviewModal,
    closeJsonImportPreviewModal,
    applyImportedRecordToForm,
    confirmJsonImportToForm,
    bulkImportAllRecords,
    handleJsonImportFile,
    exportRecordsTOML,
    handleTomlImportFile
};

if (typeof window !== "undefined") {
    (window as any).updateExportWeekOptions = updateExportWeekOptions;
    (window as any).updateExportWeekRangeLabel = updateExportWeekRangeLabel;
    (window as any).bulkImportAllRecords = bulkImportAllRecords;
    (window as any).confirmJsonImportToForm = confirmJsonImportToForm;
    (window as any).handleJsonImportFile = handleJsonImportFile;
    (window as any).handleTomlImportFile = handleTomlImportFile;
}
