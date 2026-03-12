/**
 * DTR UI MODULE
 * Handles form clearing, summaries, modal logic, and reflection list rendering
 */

function clearDTRForm() {
    document.getElementById("date").value = "";
    document.getElementById("hours").value = "";
    document.getElementById("reflection").value = "";
    document.getElementById("accomplishments").value = "";
    document.getElementById("tools").value = "";

    const imgInput = document.getElementById("images");
    if (imgInput) imgInput.value = "";

    const preview = document.getElementById("imagePreview");
    if (preview) preview.innerHTML = "";

    const counterEl = document.getElementById("weeklyCounter");
    if (counterEl) counterEl.innerHTML = "";

    document.getElementById("personalHours").value = "";
    document.getElementById("sleepHours").value = "";
    document.getElementById("recoveryHours").value = "";
    document.getElementById("commuteTotal").value = "";
    document.getElementById("commuteProductive").value = "";
    document.getElementById("identityScore").value = "0";

    if (typeof _importedImageIds !== "undefined") {
        _importedImageIds = [];
    }
}

function updateWeeklyCounter(dateInput) {
    if (!dateInput) return;
    const weekNum = getWeekNumber(dateInput);
    const weekHours = dailyRecords
        .filter(r => getWeekNumber(r.date) === weekNum)
        .reduce((sum, r) => sum + r.hours, 0);

    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let color = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) color = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) color = DTR_COLORS.good;

    const counterEl = document.getElementById("weeklyCounter");
    if (counterEl) {
        const weekLabel = `Week ${weekNum}`;
        counterEl.innerHTML = `${weekLabel} Hours: <span style="color:${color}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span>`;
    }
}

function showSummary(record) {
    const s = document.getElementById("summary");
    if (!s) return;
    s.style.display = "block";

    if (!record || !record.date) {
        s.innerHTML = `<h2>Session Delta Summary</h2><p>No record selected.</p>`;
        return;
    }

    const previousDelta = dailyRecords.length > 1 ? dailyRecords[dailyRecords.length - 2].delta : 0;
    
    let deltaColor = DTR_COLORS.neutral;
    if (record.delta <= 0) deltaColor = DTR_COLORS.warning;
    else if (record.delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

    let trendLabel = "No previous record", trendColor = DTR_COLORS.neutral;
    if (dailyRecords.length > 1) {
        if (record.delta > previousDelta) { trendLabel = "Improved"; trendColor = DTR_COLORS.good; }
        else if (record.delta < previousDelta) { trendLabel = "Declined"; trendColor = DTR_COLORS.warning; }
        else { trendLabel = "Same as before"; trendColor = DTR_COLORS.neutral; }
    }

    const hasSummaryImages = (record.imageIds && record.imageIds.length) || (record.images && record.images.length);
    const summaryImagesContainer = hasSummaryImages
        ? '<div class="summary-images" style="display:flex; gap:6px; flex-wrap:wrap; justify-content: flex-end;"></div>'
        : "";

    const totalHours = getTotalHours();
    const targetHours = getCurrentRequiredOjtHours();
    let overallColor = (totalHours >= targetHours) ? DTR_COLORS.excellent : DTR_COLORS.good;
    
    const weekNum = record.date ? getWeekNumber(record.date) : null;
    const timelineWeekDayLabel = record.date ? getTimelineWeekDayLabel(record.date) : "Week: 1 | Day: 1";
    const weekHours = weekNum ? getWeekHours(weekNum) : 0;
    const maxWeeklyHours = DAILY_TARGET_HOURS * 7;
    let weekColor = DTR_COLORS.neutral;
    if (weekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
    else if (weekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
    else weekColor = DTR_COLORS.excellent;

    const identityLabels = {
        0: "Not Set",
        1: "1 - Misaligned",
        2: "2 - Improving",
        3: "3 - On Track",
        4: "4 - High Growth",
        5: "5 - Fully Aligned"
    };
    const commuteEff = record.commuteTotal > 0 ? ((record.commuteProductive / record.commuteTotal) * 100).toFixed(1) + "%" : "N/A";

    // OJT Forecast logic Alignment (SINGLE SOURCE OF TRUTH)
    const f = calculateForecastUnified({ logs: dailyRecords });
    const absDelta = Math.abs(f.currentStatusDelta).toFixed(1);
    const statusText = f.currentStatusDelta > 0
        ? "Ahead (+" + absDelta + "h)"
        : (f.currentStatusDelta < 0
            ? "Behind (" + absDelta + "h)"
            : "On Track");

    s.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 20px;">
            <div style="flex: 1;">
                <h2>Session Delta Summary</h2>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="margin:0;"><strong>Date:</strong> ${record.date}</p>
                    <span style="font-size:0.8em; color:${f.isAhead ? DTR_COLORS.good : DTR_COLORS.warning}; font-family:var(--font-body); text-transform:uppercase; font-weight:bold;">${statusText}</span>
                </div>
                <p><strong>Timeline:</strong> ${timelineWeekDayLabel}</p>
                <p><strong>Hours Worked:</strong> ${record.hours}</p>
                <p><strong>Delta:</strong> <span style="color:${deltaColor}; font-weight:bold;">${record.delta >= 0 ? "+" : ""}${record.delta.toFixed(2)} hours</span></p>
                <p><strong>Trend:</strong> <span style="color:${trendColor}; font-weight:bold;">${trendLabel}</span></p>
                <p><strong>Overall:</strong> <span style="color:${overallColor}; font-weight:bold;">${totalHours} / ${targetHours}h</span></p>
                <p><strong>Weekly:</strong> <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span></p>
            </div>
            <div style="max-width:300px;">
                ${summaryImagesContainer}
            </div>
        </div>
        <p><strong>Reflection:</strong> ${record.reflection}</p>
        <p><strong>Tools:</strong> ${Array.isArray(record.tools) ? record.tools.join(", ") : record.tools}</p>
        <div style="margin-top:20px; padding-top:15px; border-top: 1px dotted var(--border); display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:0.9em;">
            <div><strong>Personal:</strong> ${record.personalHours || 0}h</div>
            <div><strong>Sleep:</strong> ${record.sleepHours || 0}h</div>
            <div><strong>Recovery:</strong> ${record.recoveryHours || 0}h</div>
            <div><strong>Identity:</strong> ${identityLabels[record.identityScore] || "Not Set"}</div>
            <div style="grid-column: span 2;"><strong>Commute Eff:</strong> ${commuteEff}</div>
        </div>
        
        <div style="margin-top:15px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border-left:4px solid ${f.isAhead ? DTR_COLORS.good : DTR_COLORS.warning};">
            <h4 style="margin:0 0 8px 0; font-size:0.9em; text-transform:uppercase; color:var(--accent); font-family:var(--font-body);">OJT Forecast</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; font-size:0.85em; font-family:var(--font-body);">
                <div>Total Rendered: <strong>${Math.round(f.totalActualHours)}h</strong></div>
                <div>Rem. Hours: <strong>${Math.round(f.remainingHours)}h</strong></div>
                <div>Need Pace: <strong>${Math.ceil(f.requiredRate)}h/day</strong></div>
                <div>Projected: <strong>${formatGmt8DateLabel(f.projectedDate, {month:'short', day:'numeric'})}</strong></div>
            </div>
        </div>
    `;
    if (hasSummaryImages && typeof getRecordImageUrls === "function") {
        const container = s.querySelector(".summary-images");
        if (container) {
            getRecordImageUrls(record).then((urls) => {
                const sessionLabel = "Session";
                urls.forEach((src) => {
                    if (!src || typeof src !== "string") return;
                    const img = document.createElement("img");
                    img.src = src;
                    img.setAttribute("style", "width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border); transition: transform 0.2s;");
                    img.alt = sessionLabel;
                    img.onerror = function () { this.style.visibility = "hidden"; };
                    img.onmouseover = function () { this.style.transform = "scale(2.5)"; this.style.zIndex = "100"; };
                    img.onmouseout = function () { this.style.transform = "scale(1)"; this.style.zIndex = "1"; };
                    container.appendChild(img);
                });
            });
        }
    }
}

function loadReflectionViewer() {
    const viewer = document.getElementById("reflectionViewer");
    if (!viewer) return;
    viewer.innerHTML = "";

    if (dailyRecords.length === 0) {
        const emptyText = "No reflections saved yet.";
        viewer.innerHTML = `<p class="empty">${emptyText}</p>`;
        return;
    }

    const dedupedMap = new Map();
    dailyRecords.forEach((r, idx) => {
        const dateKey = toGmt8DateKey(r && r.date) || (r && r.date);
        if (!dateKey) return;
        dedupedMap.set(dateKey, { r: { ...r, date: dateKey }, originalIndex: idx });
    });
    const dedupedEntries = Array.from(dedupedMap.values()).sort((a, b) => a.r.date.localeCompare(b.r.date));
    const duplicateCount = Math.max(0, dailyRecords.length - dedupedEntries.length);

    updateReflectionWeekOptions();
    const weekFilter = currentReflectionViewMode === "week" ? getReflectionSelectedWeek() : null;
    const sourceEntries = weekFilter
        ? dedupedEntries.filter(entry => getWeekNumber(entry.r.date) === weekFilter)
        : dedupedEntries;
    const sourceRecords = sourceEntries.map(entry => entry.r);

    if (!sourceRecords.length) {
        const emptyText = "No reflections for the selected week.";
        viewer.innerHTML = `<p class="empty">${emptyText}</p>`;
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
    const fallbackWeek = dailyRecords.length > 0 ? getWeekNumber(dailyRecords[dailyRecords.length - 1].date) : 1;
    const weekHoursLabel = "Week " + (weekFilter || fallbackWeek) + " Hours";
    if (weekFilter) {
        const weekHours = getWeekHours(weekFilter);
        let weekColor = DTR_COLORS.neutral;
        if (weekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
        else if (weekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
        const range = getWeekDateRange(weekFilter);
        const counterDiv = document.createElement("div");
        counterDiv.style.marginBottom = "10px";
        counterDiv.innerHTML = `<strong>${weekHoursLabel}:</strong> <span style="color:${weekColor}; font-weight:bold;">${weekHours} / ${maxWeeklyHours}</span> <span style="opacity:0.7; font-size:0.9em;">(${range.start} - ${range.end})</span>`;
        viewer.appendChild(counterDiv);
    } else {
        const latestDate = dailyRecords[dailyRecords.length - 1].date;
        const currentWeek = getWeekNumber(latestDate);
        const currentWeekHours = getWeekHours(currentWeek);
        let weekColor = DTR_COLORS.neutral;
        if (currentWeekHours < maxWeeklyHours * 0.5) weekColor = DTR_COLORS.warning;
        else if (currentWeekHours < maxWeeklyHours) weekColor = DTR_COLORS.good;
        const counterDiv = document.createElement("div");
        counterDiv.style.marginBottom = "10px";
        counterDiv.innerHTML = `<strong>${weekHoursLabel}:</strong> <span style="color:${weekColor}; font-weight:bold;">${currentWeekHours} / ${maxWeeklyHours}</span>`;
        viewer.appendChild(counterDiv);
    }

    let displayItems = sourceEntries.map((entry) => {
        const r = entry.r;
        const originalIndex = entry.originalIndex;
        let trendLabel = "No previous record", trendColor = DTR_COLORS.neutral;
        if (originalIndex > 0) {
            const prevDelta = dailyRecords[originalIndex - 1].delta;
            if (r.delta > prevDelta) { trendLabel = "Improved"; trendColor = DTR_COLORS.good; }
            else if (r.delta < prevDelta) { trendLabel = "Declined"; trendColor = DTR_COLORS.warning; }
            else { trendLabel = "Same as before"; trendColor = DTR_COLORS.neutral; }
        }
        return { r, originalIndex, trendLabel, trendColor };
    });

    if (currentSortMode === "date-desc") displayItems.sort((a,b) => (toGmt8DateKey(b.r.date) || "").localeCompare(toGmt8DateKey(a.r.date) || ""));
    else if (currentSortMode === "delta-desc") displayItems.sort((a,b) => b.r.delta - a.r.delta);
    else if (currentSortMode === "delta-asc") displayItems.sort((a,b) => a.r.delta - b.r.delta);

    displayItems.forEach(item => {
        const r = item.r;
        const weekNum = getWeekNumber(r.date);
        const timelineWeekDayLabel = getTimelineWeekDayLabel(r.date);
        const weekHours = getWeekHours(weekNum);
        let deltaColor = DTR_COLORS.neutral;
        if (r.delta <= 0) deltaColor = DTR_COLORS.warning;
        else if (r.delta > GREAT_DELTA_THRESHOLD) deltaColor = DTR_COLORS.good;

        const hasImages = (r.imageIds && r.imageIds.length) || (r.images && r.images.length);
        const reflectionImagesHTML = hasImages
            ? '<div class="reflection-images" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;"></div>'
            : "";

        const div = document.createElement("div");
        div.className = "reflection-item";

        const identityLabels = { 
            0: "Not Set", 
            1: "1 - Drifting", 
            2: "2 - Re-centering", 
            3: "3 - Aligned", 
            4: "4 - Compounding", 
            5: "5 - Mission Locked"
        };
        const commuteEff = r.commuteTotal > 0 ? ((r.commuteProductive / r.commuteTotal) * 100).toFixed(1) + "%" : "N/A";

        const toolsHTML = (Array.isArray(r.tools) && r.tools.length)
            ? r.tools.map(t => `<span style="display:inline-block; padding:2px 8px; margin:2px 3px 2px 0; border:1px solid var(--accent); border-radius:12px; font-size:0.78em; color:var(--accent); white-space:nowrap;">${t}</span>`).join("")
            : `<span style="opacity:0.5;">N/A</span>`;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>${item.originalIndex + 1}. ${r.date} (${timelineWeekDayLabel})</strong>
                <button class="edit-btn" data-index="${item.originalIndex}">✎ Edit</button>
            </div>
            <p>${r.reflection}</p>
            <div style="margin: 8px 0; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border-left: 3px solid var(--accent); font-size: 0.85em;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px;">
                    <div><strong>Hours Worked:</strong> ${r.hours}h (Δ ${r.delta.toFixed(2)})</div>
                    <div><strong>Trend:</strong> <span style="color:${item.trendColor}">${item.trendLabel}</span></div>
                    <div><strong>Personal:</strong> ${r.personalHours || 0}h</div>
                    <div><strong>Sleep:</strong> ${r.sleepHours || 0}h</div>
                    <div><strong>Recovery:</strong> ${r.recoveryHours || 0}h</div>
                    <div><strong>Identity:</strong> ${identityLabels[r.identityScore] || "Not Set"}</div>
                    <div style="grid-column: span 2;"><strong>Commute Eff:</strong> ${commuteEff}</div>
                    <div style="grid-column: span 2; margin-top: 4px;"><strong>Tools Used:</strong><br>${toolsHTML}</div>
                </div>
            </div>
            ${reflectionImagesHTML}
            <hr>
        `;
        if (hasImages && typeof getRecordImageUrls === "function") {
            const imgContainer = div.querySelector(".reflection-images");
            const thumbStyle = "width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid var(--border); cursor:zoom-in;";
            getRecordImageUrls(r).then((urls) => {
                if (!imgContainer) return;
                urls.forEach((src) => {
                    if (!src || typeof src !== "string") return;
                    const img = document.createElement("img");
                    img.src = src;
                    img.setAttribute("style", thumbStyle);
                    img.alt = "Reflection";
                    img.onerror = function () { this.style.visibility = "hidden"; this.title = "Image failed to load"; };
                    img.onclick = function () {
                        this.style.width = "auto"; this.style.height = "300px"; this.style.position = "fixed";
                        this.style.top = "50%"; this.style.left = "50%"; this.style.transform = "translate(-50%, -50%)";
                        this.style.zIndex = "9999"; this.style.boxShadow = "0 0 20px rgba(0,0,0,0.8)";
                        this.onclick = function () {
                            this.style.width = "50px"; this.style.height = "50px"; this.style.position = "static";
                            this.style.transform = "none"; this.style.zIndex = "1"; this.style.boxShadow = "none";
                            this.onclick = null;
                        };
                    };
                    imgContainer.appendChild(img);
                });
            });
        }
        viewer.appendChild(div);
    });
}

function closeEditModal() {
    const modal = document.getElementById("editModal");
    if (modal) modal.style.display = "none";
    editingIndex = null;
}

function saveEditModal() {
    if (editingIndex === null) return;

    const date = document.getElementById("editDate").value;
    const hours = parseFloat(document.getElementById("editHours").value);
    const reflection = document.getElementById("editReflection").value;
    const accomplishments = document.getElementById("editAccomplishments").value.split("\n").map(a => a.trim()).filter(Boolean);
    const tools = document.getElementById("editTools").value.split(",").map(t => t.trim()).filter(Boolean);

    // Convert l2Data values to proper types (matching submitDTR)
    const l2Data = {
        personalHours: parseFloat(document.getElementById("editPersonalHours").value) || 0,
        sleepHours: parseFloat(document.getElementById("editSleepHours").value) || 0,
        recoveryHours: parseFloat(document.getElementById("editRecoveryHours").value) || 0,
        commuteTotal: parseFloat(document.getElementById("editCommuteTotal").value) || 0,
        commuteProductive: parseFloat(document.getElementById("editCommuteProductive").value) || 0,
        identityScore: parseInt(document.getElementById("editIdentityScore").value) || null
    };
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const files = Array.from(document.getElementById("editImages").files);
    
    if (files.length > 0) {
        Promise.allSettled(files.map((file) => saveImageToStore(file)))
            .then((results) => {
                const newImageIds = results
                    .filter((r) => r.status === "fulfilled")
                    .map((r) => r.value);
                const failedCount = results.filter((r) => r.status === "rejected").length;

                if (!newImageIds.length) {
                    const old = dailyRecords[editingIndex];
                    if (failedCount > 0) {
                        alert("Image upload failed for " + failedCount + " image(s). Keeping old images.");
                    }
                    finalizeSave(date, hours, reflection, accomplishments, tools, old.imageIds || [], l2Data);
                    return;
                }

                if (failedCount > 0) {
                    alert("Some images failed to upload (" + failedCount + "). Saving only successfully uploaded images.");
                }

                // Delete old images and save new ones
                const old = dailyRecords[editingIndex];
                const oldIds = old.imageIds || [];
                if (oldIds.length && typeof deleteImagesFromStore === "function") {
                    deleteImagesFromStore(oldIds).catch(() => {});
                }

                finalizeSave(date, hours, reflection, accomplishments, tools, newImageIds, l2Data);
            })
            .catch((err) => {
                console.error("Edit: IndexedDB save error:", err);
                alert("Failed to save images to storage: " + (err && err.message ? err.message : err));
            });
    } else {
        const old = dailyRecords[editingIndex];
        finalizeSave(date, hours, reflection, accomplishments, tools, old.imageIds || [], l2Data);
    }
}

async function finalizeSave(date, hours, reflection, accomplishments, tools, imageIds, l2Data) {
    const startDate = typeof getCurrentOjtStartDate === "function" ? getCurrentOjtStartDate() : null;
    const dateKey = typeof toGmt8DateKey === "function" ? toGmt8DateKey(date) : date;
    if (startDate && dateKey && dateKey < startDate) {
        alert(`DTR Date cannot be earlier than OJT Starting Date (${startDate}).`);
        return;
    }

    const normalizedDate = dateKey || date;
    const duplicateIndex = dailyRecords.findIndex((r, idx) =>
        idx !== editingIndex && (toGmt8DateKey(r.date) || r.date) === normalizedDate
    );
    if (duplicateIndex !== -1) {
        if (!confirm("A DTR record for " + normalizedDate + " already exists. Overwrite it with this edit?")) {
            return;
        }
        dailyRecords.splice(duplicateIndex, 1);
        if (duplicateIndex < editingIndex) editingIndex -= 1;
    }

    dailyRecords[editingIndex] = new DailyRecord(normalizedDate, hours, reflection, accomplishments, tools, [], l2Data, imageIds || []);
    dailyRecords.sort((a, b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));
    if (typeof persistDTR === "function") {
        const ok = await persistDTR(dailyRecords);
        if (!ok) {
            alert("Failed to save record update.");
            return;
        }
    } else {
        localStorage.setItem("dtr", JSON.stringify(dailyRecords));
    }

    closeEditModal();
    updateReflectionWeekOptions();
    loadReflectionViewer();
    const newIndex = dailyRecords.findIndex(r => r.date === date);
    showSummary(dailyRecords[newIndex]);
    if (typeof renderDailyGraph === "function") renderDailyGraph();
    if (typeof renderWeeklyGraph === "function") renderWeeklyGraph();
    if (typeof updateStorageVisualizer === "function") updateStorageVisualizer();
    alert("Record updated successfully!");
}

document.addEventListener("click", e => {
    if (!e.target.classList.contains("edit-btn")) return;
    editingIndex = Number(e.target.dataset.index);
    const r = dailyRecords[editingIndex];
    if (typeof applyDtrDateIntegrityGuardToInputs === "function") {
        applyDtrDateIntegrityGuardToInputs();
    }

    document.getElementById("editDate").value = r.date;
    document.getElementById("editHours").value = r.hours;
    document.getElementById("editReflection").value = r.reflection;
    document.getElementById("editAccomplishments").value = Array.isArray(r.accomplishments) ? r.accomplishments.join("\n") : (r.accomplishments || "");
    document.getElementById("editTools").value = Array.isArray(r.tools) ? r.tools.join(", ") : (r.tools || "");

    document.getElementById("editPersonalHours").value = r.personalHours || 0;
    document.getElementById("editSleepHours").value = r.sleepHours || 0;
    document.getElementById("editRecoveryHours").value = r.recoveryHours || 0;
    document.getElementById("editIdentityScore").value = r.identityScore || 0;
    document.getElementById("editCommuteTotal").value = r.commuteTotal || 0;
    document.getElementById("editCommuteProductive").value = r.commuteProductive || 0;

    const imgInput = document.getElementById("editImages");
    if (imgInput) imgInput.value = "";
    const imgPreview = document.getElementById("editImagePreview");
    if (imgPreview) {
        imgPreview.innerHTML = "";
        const hasImages = (r.imageIds && r.imageIds.length) || (r.images && r.images.length);
        if (hasImages && typeof getRecordImageUrls === "function") {
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

    document.getElementById("editModal").style.display = "flex";
});

const editImgInput = document.getElementById("editImages");
if (editImgInput) {
    editImgInput.addEventListener("change", function () {
        const preview = document.getElementById("editImagePreview");
        if (!preview) return;
        preview.innerHTML = "";
        const files = Array.from(this.files);

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement("img");
                img.src = e.target.result;
                img.style.width = "60px";
                img.style.height = "60px";
                img.style.objectFit = "cover";
                img.style.borderRadius = "5px";
                img.style.border = "2px solid var(--accent)";
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });
}
