/**
 * ARCHIVE VIEWER CONTROLLER
 * Manages the DTR Archive Viewer modal with Daily, Weekly, and Monthly breakdowns.
 */

import {
    getArchivedSnapshots,
    restoreArchivedSnapshot,
    deleteArchivedSnapshot,
    archiveRecordsSnapshot,
    ArchivedSnapshot
} from '../dtr-image-store';
import { Store } from '../store';
import { persistDTR } from '../dtr-storage';
import { DTRI18N } from '../dtr-i18n';
import {
    formatGmt8DateLabel,
    toGmt8DateKey,
    getWeekNumber,
    getWeekDateRange,
    parseDateKeyGmt8
} from '../core/dtr-engine';
import { renderDailyGraph, renderWeeklyGraph } from '../dtr-graphs';
import { updateStorageVisualizer } from '../dtr-storage-aux';
import { showToast } from '../utils/toast';

export type ArchiveViewMode = 'daily' | 'weekly' | 'monthly';

let currentSnapshots: ArchivedSnapshot[] = [];
let selectedSnapshotId: string | null = null;
let currentViewMode: ArchiveViewMode = 'daily';

function tr(key: string, fallback: string, params: Record<string, string> = {}): string {
    const t = DTRI18N && typeof DTRI18N.t === "function" ? DTRI18N.t : null;
    if (!t) return fallback;
    const res = t(key, params);
    return (res && res !== key) ? res : fallback;
}

export async function openArchiveViewerModal(): Promise<void> {
    const modal = document.getElementById("archiveViewerModal");
    if (!modal) return;
    modal.style.display = "flex";

    await reloadArchiveSnapshots();
}

export function closeArchiveViewerModal(): void {
    const modal = document.getElementById("archiveViewerModal");
    if (modal) modal.style.display = "none";
}

export async function reloadArchiveSnapshots(): Promise<void> {
    try {
        currentSnapshots = await getArchivedSnapshots();
    } catch (e) {
        console.error("Failed to load archive snapshots:", e);
        currentSnapshots = [];
    }

    const select = document.getElementById("archiveSnapshotSelect") as HTMLSelectElement | null;
    if (select) {
        select.innerHTML = "";
        if (!currentSnapshots.length) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.innerText = tr("archive.no_snapshots_option", "(No archived snapshots found)");
            select.appendChild(opt);
            selectedSnapshotId = null;
        } else {
            currentSnapshots.forEach((snap, idx) => {
                const opt = document.createElement("option");
                opt.value = snap.id;
                const dateStr = snap.archivedAt ? new Date(snap.archivedAt).toLocaleString() : `Snapshot ${idx + 1}`;
                const reasonLabel = formatArchiveReason(snap.reason);
                opt.innerText = `${dateStr} [${snap.recordCount} records] - ${reasonLabel}`;
                select.appendChild(opt);
            });

            if (!selectedSnapshotId || !currentSnapshots.some(s => s.id === selectedSnapshotId)) {
                selectedSnapshotId = currentSnapshots[0].id;
            }
            select.value = selectedSnapshotId;
        }
    }

    renderCurrentArchiveSnapshot();
}

function formatArchiveReason(reason: string): string {
    switch (reason) {
        case "clear_all_records":
            return tr("archive.reason_clear_all", "Wiped via Clear All");
        case "clear_all_data":
            return tr("archive.reason_clear_all_data", "Storage Reset (Archives Kept)");
        case "timeline_wipe":
            return tr("archive.reason_timeline_wipe", "Timeline Start Date Shift");
        case "replace_duplicate":
            return tr("archive.reason_replace_duplicate", "Duplicate Overwrite");
        case "edit_overwrite":
            return tr("archive.reason_edit_overwrite", "Edit Modal Overwrite");
        case "delete_last_entry":
            return tr("archive.reason_delete_last", "Deleted Last Entry");
        case "merge_override":
            return tr("archive.reason_merge_override", "Imported Record Overwrite");
        case "manual_archive":
        default:
            return tr("archive.reason_manual", "Manual Snapshot");
    }
}

export function onArchiveSnapshotChanged(snapshotId: string): void {
    selectedSnapshotId = snapshotId;
    renderCurrentArchiveSnapshot();
}

export function switchArchiveViewMode(mode: ArchiveViewMode): void {
    currentViewMode = mode;
    const tabBtns = document.querySelectorAll(".archive-tab-btn");
    tabBtns.forEach((btn) => {
        const btnMode = btn.getAttribute("data-archive-view");
        btn.classList.toggle("active", btnMode === mode);
    });
    renderCurrentArchiveSnapshot();
}

export function renderCurrentArchiveSnapshot(): void {
    const container = document.getElementById("archiveContentContainer");
    const metaEl = document.getElementById("archiveSnapshotMeta");
    const restoreBtn = document.getElementById("archiveRestoreBtn") as HTMLButtonElement | null;
    const deleteBtn = document.getElementById("archiveDeleteBtn") as HTMLButtonElement | null;
    const exportBtn = document.getElementById("archiveExportBtn") as HTMLButtonElement | null;

    if (!container) return;

    const snapshot = currentSnapshots.find(s => s.id === selectedSnapshotId);

    if (!snapshot || !Array.isArray(snapshot.records) || snapshot.records.length === 0) {
        if (restoreBtn) restoreBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = !snapshot;
        if (exportBtn) exportBtn.disabled = true;
        if (metaEl) metaEl.innerHTML = "";

        container.innerHTML = `
            <div class="archive-empty-state" style="text-align:center; padding: 48px 16px; opacity:0.7;">
                <span class="material-symbols-outlined notranslate" translate="no" style="font-size:48px; opacity:0.5; margin-bottom:12px; display:block;">inventory_2</span>
                <p style="margin:0; font-size:14px;" data-i18n="archive.empty_state_msg">
                    ${tr("archive.empty_state_msg", "No records found in this archived snapshot.")}
                </p>
            </div>
        `;
        return;
    }

    if (restoreBtn) restoreBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
    if (exportBtn) exportBtn.disabled = false;

    if (metaEl) {
        const d = snapshot.archivedAt ? new Date(snapshot.archivedAt).toLocaleString() : "";
        metaEl.innerHTML = `
            <span style="opacity:0.85;"><strong>${tr("archive.meta_archived_at", "Archived:")}</strong> ${d}</span> &bull; 
            <span style="opacity:0.85;"><strong>${tr("archive.meta_total_records", "Records:")}</strong> ${snapshot.records.length}</span> &bull; 
            <span style="opacity:0.85;"><strong>${tr("archive.meta_reason", "Trigger:")}</strong> ${formatArchiveReason(snapshot.reason)}</span>
        `;
    }

    const records = [...snapshot.records].sort((a, b) => {
        const da = toGmt8DateKey(a.date) || a.date || "";
        const db = toGmt8DateKey(b.date) || b.date || "";
        return da.localeCompare(db);
    });

    if (currentViewMode === 'daily') {
        renderDailyArchiveView(container, records);
    } else if (currentViewMode === 'weekly') {
        renderWeeklyArchiveView(container, records);
    } else {
        renderMonthlyArchiveView(container, records);
    }
}

function renderDailyArchiveView(container: HTMLElement, records: any[]): void {
    let html = `<div class="archive-cards-list" style="display:grid; gap:12px;">`;

    records.forEach((r) => {
        const dateKey = toGmt8DateKey(r.date) || r.date;
        const parsedDate = parseDateKeyGmt8(dateKey);
        const formattedDate = parsedDate
            ? formatGmt8DateLabel(parsedDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
            : dateKey;
        const weekNum = parsedDate ? getWeekNumber(parsedDate) : "?";

        const accomplishments = Array.isArray(r.accomplishments)
            ? r.accomplishments.filter(Boolean)
            : (r.accomplishments ? String(r.accomplishments).split("\n").filter(Boolean) : []);
        const tools = Array.isArray(r.tools)
            ? r.tools.filter(Boolean)
            : (r.tools ? String(r.tools).split(",").map((s: string) => s.trim()).filter(Boolean) : []);

        html += `
            <div class="card" style="padding:14px; margin:0; border-left:3px solid var(--accent); background:rgba(255,255,255,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                    <div>
                        <strong style="font-size:14px; color:var(--text);">${formattedDate}</strong>
                        <span style="margin-left:8px; font-size:11px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.06); color:var(--accent);">Week ${weekNum}</span>
                    </div>
                    <div style="font-size:13px; font-weight:bold; color:var(--accent);">
                        ${Number(r.hours || 0).toFixed(1)}h
                    </div>
                </div>
                ${r.reflection ? `<p style="margin:0 0 8px 0; font-size:12px; font-style:italic; opacity:0.85; white-space:pre-wrap;">${escapeHtml(r.reflection)}</p>` : ''}
                ${accomplishments.length ? `
                    <div style="margin-bottom:6px;">
                        <span style="font-size:11px; opacity:0.65; text-transform:uppercase; font-weight:bold;">${tr("archive.accomplishments_label", "Accomplishments")}:</span>
                        <ul style="margin:4px 0 0 16px; padding:0; font-size:12px; opacity:0.9;">
                            ${accomplishments.map((a: string) => `<li>${escapeHtml(a)}</li>`).join("")}
                        </ul>
                    </div>
                ` : ''}
                ${tools.length ? `
                    <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center; margin-top:6px;">
                        <span style="font-size:10px; opacity:0.65; text-transform:uppercase; font-weight:bold; margin-right:4px;">${tr("archive.tools_label", "Tools")}:</span>
                        ${tools.map((t: string) => `<span style="font-size:10px; padding:2px 6px; border-radius:4px; border:1px solid var(--border); background:rgba(255,255,255,0.04);">${escapeHtml(t)}</span>`).join("")}
                    </div>
                ` : ''}
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function renderWeeklyArchiveView(container: HTMLElement, records: any[]): void {
    const weekBuckets: Record<number, any[]> = {};

    records.forEach((r) => {
        const dk = toGmt8DateKey(r.date);
        const parsed = dk ? parseDateKeyGmt8(dk) : null;
        const w = parsed ? getWeekNumber(parsed) : 1;
        if (!weekBuckets[w]) weekBuckets[w] = [];
        weekBuckets[w].push(r);
    });

    const sortedWeeks = Object.keys(weekBuckets).map(Number).sort((a, b) => a - b);

    let html = `<div class="archive-weeks-list" style="display:grid; gap:16px;">`;

    sortedWeeks.forEach((w) => {
        const weekRecords = weekBuckets[w];
        const totalHours = weekRecords.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
        const dayCount = weekRecords.length;
        const avgHours = dayCount > 0 ? (totalHours / dayCount).toFixed(1) : "0.0";
        const range = getWeekDateRange(w);

        html += `
            <div class="card" style="padding:16px; margin:0; border-top:2px solid var(--accent); background:rgba(255,255,255,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:8px; border-bottom:1px solid var(--border); margin-bottom:12px;">
                    <div>
                        <h4 style="margin:0; font-family:var(--font-heading); color:var(--accent); font-size:15px;">
                            ${tr("ui.week_label", `Week ${w}`, { week: String(w) })}
                        </h4>
                        <small style="opacity:0.7; font-size:11px;">${range.start} &mdash; ${range.end}</small>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:14px; font-weight:bold; color:var(--text);">${totalHours.toFixed(1)}h Total</span>
                        <div style="font-size:11px; opacity:0.7;">${dayCount} ${tr("archive.days_logged", "days")} (${avgHours}h/day)</div>
                    </div>
                </div>
                <div style="display:grid; gap:6px;">
                    ${weekRecords.map((r) => {
                        const dk = toGmt8DateKey(r.date) || r.date;
                        const pd = parseDateKeyGmt8(dk);
                        const label = pd ? formatGmt8DateLabel(pd, { weekday: "short", month: "short", day: "numeric" }) : dk;
                        const hrs = Number(r.hours || 0).toFixed(1);
                        return `
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:6px 10px; background:rgba(255,255,255,0.02); border-radius:4px; border:1px solid var(--border);">
                                <span>${label}</span>
                                <strong style="color:var(--accent);">${hrs}h</strong>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function renderMonthlyArchiveView(container: HTMLElement, records: any[]): void {
    const monthBuckets: Record<string, any[]> = {};

    records.forEach((r) => {
        const dk = toGmt8DateKey(r.date);
        const ym = dk ? dk.slice(0, 7) : "Unknown";
        if (!monthBuckets[ym]) monthBuckets[ym] = [];
        monthBuckets[ym].push(r);
    });

    const sortedMonths = Object.keys(monthBuckets).sort();

    let html = `<div class="archive-months-list" style="display:grid; gap:16px;">`;

    sortedMonths.forEach((ym) => {
        const monthRecords = monthBuckets[ym];
        const totalHours = monthRecords.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);
        const sessionCount = monthRecords.length;
        const avgHours = sessionCount > 0 ? (totalHours / sessionCount).toFixed(1) : "0.0";

        let monthLabel = ym;
        const testDate = parseDateKeyGmt8(`${ym}-01`);
        if (testDate) {
            monthLabel = formatGmt8DateLabel(testDate, { month: "long", year: "numeric" });
        }

        html += `
            <div class="card" style="padding:16px; margin:0; border-top:2px solid var(--accent); background:rgba(255,255,255,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:8px; border-bottom:1px solid var(--border); margin-bottom:12px;">
                    <div>
                        <h4 style="margin:0; font-family:var(--font-heading); color:var(--accent); font-size:15px;">
                            ${monthLabel}
                        </h4>
                        <small style="opacity:0.7; font-size:11px;">${sessionCount} ${tr("archive.logged_sessions", "logged sessions")}</small>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:14px; font-weight:bold; color:var(--text);">${totalHours.toFixed(1)}h Total</span>
                        <div style="font-size:11px; opacity:0.7;">${avgHours}h ${tr("archive.avg_per_day", "avg/day")}</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:6px;">
                    ${monthRecords.map((r) => {
                        const dk = toGmt8DateKey(r.date) || r.date;
                        const pd = parseDateKeyGmt8(dk);
                        const dayNum = pd ? formatGmt8DateLabel(pd, { month: "short", day: "numeric" }) : dk;
                        const hrs = Number(r.hours || 0).toFixed(1);
                        return `
                            <div style="padding:6px 8px; font-size:11px; background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:4px; display:flex; justify-content:space-between;">
                                <span>${dayNum}</span>
                                <strong style="color:var(--accent);">${hrs}h</strong>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export async function handleRestoreSelectedSnapshot(): Promise<void> {
    if (!selectedSnapshotId) return;
    const snapshot = currentSnapshots.find(s => s.id === selectedSnapshotId);
    if (!snapshot) return;

    const count = snapshot.records ? snapshot.records.length : 0;
    const msg = tr(
        "archive.confirm_restore",
        `Restore this archived snapshot with ${count} records? Your current live records will be archived first before restoring. Continue?`,
        { count: String(count) }
    );
    if (!confirm(msg)) return;

    // Archive current live data first to prevent any data loss
    const currentLive = Store.getRecords();
    if (currentLive.length > 0) {
        try {
            await archiveRecordsSnapshot(currentLive, "pre_restore_backup");
        } catch (e) {
            console.warn("Failed to backup current live records prior to restore:", e);
        }
    }

    try {
        const restored = await restoreArchivedSnapshot(selectedSnapshotId);
        if (restored && Array.isArray(restored)) {
            Store.setRecords(restored);
            await persistDTR(Store.getRecords());
            renderDailyGraph();
            renderWeeklyGraph();
            updateStorageVisualizer();

            showToast(tr("archive.restore_success", `Successfully restored ${restored.length} records from archive.`), "success", 4000);
            closeArchiveViewerModal();
        } else {
            alert("No records found in selected snapshot to restore.");
        }
    } catch (err: any) {
        console.error("Failed to restore snapshot:", err);
        alert(`Restore failed: ${err && err.message ? err.message : err}`);
    }
}

export async function handleDeleteSelectedSnapshot(): Promise<void> {
    if (!selectedSnapshotId) return;
    const confirmMsg = tr("archive.confirm_delete", "Are you sure you want to permanently delete this archived snapshot?");
    if (!confirm(confirmMsg)) return;

    try {
        await deleteArchivedSnapshot(selectedSnapshotId);
        showToast(tr("archive.delete_success", "Archived snapshot deleted."), "info", 3000);
        await reloadArchiveSnapshots();
    } catch (err: any) {
        console.error("Failed to delete snapshot:", err);
        alert(`Delete failed: ${err && err.message ? err.message : err}`);
    }
}

export async function handleManualArchiveLiveRecords(): Promise<void> {
    const live = Store.getRecords();
    if (!live || live.length === 0) {
        alert(tr("archive.no_live_records_to_archive", "No live records currently logged to archive."));
        return;
    }

    try {
        const id = await archiveRecordsSnapshot(live, "manual_archive");
        selectedSnapshotId = id;
        showToast(tr("archive.manual_success", `Archived ${live.length} live records successfully.`), "success", 3500);
        await reloadArchiveSnapshots();
    } catch (err: any) {
        console.error("Failed to archive records:", err);
        alert(`Archival failed: ${err && err.message ? err.message : err}`);
    }
}

export function handleExportSelectedSnapshot(format: 'json' | 'toml' = 'json'): void {
    if (!selectedSnapshotId) return;
    const snapshot = currentSnapshots.find(s => s.id === selectedSnapshotId);
    if (!snapshot || !Array.isArray(snapshot.records)) return;

    const data = {
        archiveId: snapshot.id,
        archivedAt: snapshot.archivedAt,
        reason: snapshot.reason,
        recordCount: snapshot.records.length,
        records: snapshot.records
    };

    const fileName = `DTR_Archive_${snapshot.id}_${toGmt8DateKey(new Date())}.${format}`;

    if (format === 'toml') {
        const lines: string[] = [
            `# DTR Archive Snapshot`,
            `archive_id = "${snapshot.id}"`,
            `archived_at = "${snapshot.archivedAt}"`,
            `reason = "${snapshot.reason}"`,
            `record_count = ${snapshot.records.length}`,
            ``
        ];
        snapshot.records.forEach((r, idx) => {
            lines.push(`[[records]]`);
            lines.push(`date = "${r.date || ''}"`);
            lines.push(`hours = ${Number(r.hours || 0)}`);
            lines.push(`reflection = "${(r.reflection || '').replace(/"/g, '\\"')}"`);
            lines.push(`accomplishments = ${JSON.stringify(r.accomplishments || [])}`);
            lines.push(`tools = ${JSON.stringify(r.tools || [])}`);
            lines.push(``);
        });
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        triggerDownload(blob, fileName);
    } else {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        triggerDownload(blob, fileName);
    }
}

function triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Global exposure for event delegation
if (typeof window !== "undefined") {
    (window as any).openArchiveViewerModal = openArchiveViewerModal;
    (window as any).closeArchiveViewerModal = closeArchiveViewerModal;
    (window as any).onArchiveSnapshotChanged = onArchiveSnapshotChanged;
    (window as any).switchArchiveViewMode = switchArchiveViewMode;
    (window as any).handleRestoreSelectedSnapshot = handleRestoreSelectedSnapshot;
    (window as any).handleDeleteSelectedSnapshot = handleDeleteSelectedSnapshot;
    (window as any).handleManualArchiveLiveRecords = handleManualArchiveLiveRecords;
    (window as any).handleExportSelectedSnapshot = handleExportSelectedSnapshot;
}
