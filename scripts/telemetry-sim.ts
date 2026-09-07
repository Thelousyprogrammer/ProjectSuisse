/**
 * PERFORMANCE SIMULATOR MODULE
 * Handles synthetic data injection and what-if scenarios
 */

let simAnchorDate: Date | null = null; // Tracks the start of the current simulation sequence

function _getSimStartDate(): Date {
    // Default: after last log
    if ((window as any).allLogs && (window as any).allLogs.length > 0) {
        const sorted = [...(window as any).allLogs].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return (window as any).parseDateKeyGmt8((window as any).toGmt8DateKey(sorted[sorted.length - 1].date));
    }
    return (window as any).nowGmt8StartOfDay();
}

function _buildSimPreviewLogs(simHours: number, simDaysToAdd: number): any[] {
    const lastDate = _getSimStartDate();
    const previewEntries: any[] = [];
    for (let i = 1; i <= simDaysToAdd; i++) {
        const nextDate = (window as any).addDaysGmt8(lastDate, i);
        previewEntries.push({
            date: (window as any).toGmt8DateKey(nextDate),
            hours: simHours
        });
    }
    return [...((window as any).allLogs || []), ...previewEntries];
}

function previewSimulation(): void {
    if (!(window as any).isSimulating) return;
    if (typeof (window as any).charts === 'undefined' || !(window as any).charts || !(window as any).charts.trajectory) return;
    if (typeof (window as any).buildTrajectorySeries !== 'function') return;

    const elSimHours = document.getElementById("simHours") as HTMLInputElement;
    const simHoursRaw = elSimHours ? parseFloat(elSimHours.value) : 8;
    const simHours = Number.isFinite(simHoursRaw) ? Math.max(0, simHoursRaw) : 8;
    
    const elSimDays = document.getElementById("simDays") as HTMLInputElement;
    const simDaysToAdd = elSimDays ? parseInt(elSimDays.value, 10) || 5 : 5;

    const previewLogs = _buildSimPreviewLogs(simHours, simDaysToAdd);

    const slider = document.getElementById("paceSlider") as HTMLInputElement;
    const currentPace = slider ? parseFloat(slider.value) : null;

    const series = (window as any).buildTrajectorySeries({ logs: previewLogs, paceOverride: currentPace });

    const charts = (window as any).charts;
    charts.trajectory.data.labels = series.labels;
    charts.trajectory.data.datasets[0].data = series.actualCumulative;
    charts.trajectory.data.datasets[1].data = series.projectedCumulative;
    charts.trajectory.data.datasets[2].data = series.idealCumulative;

    const targetHours = series.forecast ? series.forecast.targetHours : (window as any).getCurrentRequiredOjtHours();
    const allActual: number[] = series.actualCumulative.filter((v: any) => v != null);
    const allProjected: number[] = series.projectedCumulative.filter((v: any) => v != null);
    const yMaxSource = Math.max(
        targetHours,
        allActual.length ? Math.max(...allActual) : 0,
        allProjected.length ? Math.max(...allProjected) : 0
    );
    if (charts.trajectory.options && charts.trajectory.options.scales && charts.trajectory.options.scales.y) {
        charts.trajectory.options.scales.y.max = Math.ceil(yMaxSource / 50) * 50 + 50;
    }

    charts.trajectory.update("none");
}

function toggleSimulation(): void {
    (window as any).isSimulating = !(window as any).isSimulating;
    const isSimulating = (window as any).isSimulating;
    const btn = document.getElementById("simToggleBtn");
    const controls = document.getElementById("simControls");
    const resetBtn = document.getElementById("simResetBtn");
    const card = document.getElementById("simSection");

    if (isSimulating) {
        const t = ((window as any).DTRI18N && (window as any).DTRI18N.t) ? (window as any).DTRI18N.t : null;
        if(btn) {
            btn.innerText = t ? t("simulator.telemetry_exit_sim_mode") : "Exit Sim Mode";
            btn.classList.replace("btn-dim", "btn-accent");
        }
        if(controls) controls.classList.add("expanded");
        if(resetBtn) resetBtn.style.display = "inline-block";
        if (card) card.classList.add("active");
        (window as any).realLogs = JSON.parse(JSON.stringify((window as any).allLogs || [])); // Snapshot current state

        // Wire live preview listeners
        const simHoursInput = document.getElementById("simHours");
        const simDaysInput = document.getElementById("simDays");
        if (simHoursInput) simHoursInput.addEventListener("input", previewSimulation);
        if (simDaysInput) simDaysInput.addEventListener("input", previewSimulation);
    } else {
        const t = ((window as any).DTRI18N && (window as any).DTRI18N.t) ? (window as any).DTRI18N.t : null;
        if(btn) {
            btn.innerText = t ? t("simulator.telemetry_enter_sim_mode") : "Enter Sim Mode";
            btn.classList.replace("btn-accent", "btn-dim");
        }
        if(controls) controls.classList.remove("expanded");
        if(resetBtn) resetBtn.style.display = "none";
        if (card) card.classList.remove("active");

        // Remove live preview listeners on exit
        const simHoursInput = document.getElementById("simHours");
        const simDaysInput = document.getElementById("simDays");
        if (simHoursInput) simHoursInput.removeEventListener("input", previewSimulation);
        if (simDaysInput) simDaysInput.removeEventListener("input", previewSimulation);

        if(typeof (window as any).resetTelemetry === "function") (window as any).resetTelemetry();
        simAnchorDate = null;
        updateSimTrackerUI();
    }
}

function updateSimTrackerUI(): void {
    const tracker = document.getElementById("simTracker");
    const display = document.getElementById("simAnchorDateDisplay");
    if (!tracker || !display) return;

    if (simAnchorDate) {
        tracker.style.display = "block";
        display.innerText = (window as any).formatGmt8DateLabel(simAnchorDate, { month: "short", day: "numeric", year: "numeric" });
    } else {
        tracker.style.display = "none";
    }
}

function runSimulation(): void {
    if (!(window as any).isSimulating) return;

    const elSimHours = document.getElementById("simHours") as HTMLInputElement;
    const simHoursRaw = elSimHours ? parseFloat(elSimHours.value) : 8;
    const simHours = Number.isFinite(simHoursRaw) ? Math.max(0, simHoursRaw) : 8;

    const elSimDays = document.getElementById("simDays") as HTMLInputElement;
    const simDaysToAdd = elSimDays ? parseInt(elSimDays.value, 10) || 5 : 5;
    
    const lastDate = _getSimStartDate();
    
    // Set anchor date on first injection if not set
    if (!simAnchorDate) {
        simAnchorDate = (window as any).addDaysGmt8(lastDate, 1);
        updateSimTrackerUI();
    }

    const newEntries: any[] = [];
    for (let i = 1; i <= simDaysToAdd; i++) {
        const nextDate = (window as any).addDaysGmt8(lastDate, i);
        const dateStr = (window as any).toGmt8DateKey(nextDate);
        
        newEntries.push({
            date: dateStr,
            hours: simHours,
            personalHours: simHours > 8 ? (simHours - 8) * 0.5 : 0, 
            sleepHours: Math.max(4, 9 - (simHours * 0.3)), 
            identityScore: simHours === 0 ? 1 : (simHours > 10 ? 2 : (simHours >= 8 ? 4 : 5)), 
            accomplishments: ["Simulated Entry"],
            commuteTotal: 1.5,
            commuteProductive: 1.0
        });
    }
    
    const allLogs = [...((window as any).allLogs || []), ...newEntries];
    allLogs.sort((a, b) => ((window as any).toGmt8DateKey(a.date) || "").localeCompare((window as any).toGmt8DateKey(b.date) || ""));
    (window as any).allLogs = allLogs;

    // Re-render EVERYTHING
    if(typeof (window as any).renderTelemetry === "function") (window as any).renderTelemetry(allLogs);
    
    // Add visual feedback
    const note = document.querySelector(".sim-note") as HTMLElement;
    if (note) {
        const t = ((window as any).DTRI18N && (window as any).DTRI18N.t) ? (window as any).DTRI18N.t : null;
        const total = allLogs.reduce((s: number, l: any) => s + (l.hours || 0), 0).toFixed(1);
        note.innerText = t ? t("simulator.telemetry_sim_success_msg", { days: String(simDaysToAdd), hours: String(simHours), total: String(total) }) : `Simulated: Added ${simDaysToAdd} days @ ${simHours}h/day. Cumulative: ${total}h`;
        const colors = (typeof (window as any).getThemeValues === "function") ? (window as any).getThemeValues() : { excellent: "#0f0" };
        note.style.color = colors.excellent;
    }
}

function resetTelemetry(): void {
    (window as any).allLogs = JSON.parse(JSON.stringify((window as any).realLogs || []));
    if(typeof (window as any).renderTelemetry === "function") (window as any).renderTelemetry((window as any).allLogs);
    
    const note = document.querySelector(".sim-note") as HTMLElement;
    if (note) {
        const t = ((window as any).DTRI18N && (window as any).DTRI18N.t) ? (window as any).DTRI18N.t : null;
        note.innerText = t ? t("simulator.telemetry_sim_note") : "Note: Simulated data is temporary and won't affect your real DTR records unless synced.";
        note.style.color = "";
    }
}
export {
    _getSimStartDate,
    _buildSimPreviewLogs,
    previewSimulation,
    toggleSimulation,
    updateSimTrackerUI,
    runSimulation,
    resetTelemetry
};
