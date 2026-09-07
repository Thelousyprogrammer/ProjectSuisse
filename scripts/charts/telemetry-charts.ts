/**
 * TELEMETRY RENDER MODULE
 * Handles chart initialization and data visualization
 */

import { DTRI18N } from '../dtr-i18n';
import {
    getWeekNumber,
    DAILY_TARGET_HOURS,
    getCurrentRequiredOjtHours,
    getCurrentOjtStartDate,
    parseDateKeyGmt8,
    toGmt8DateKey,
    addDaysGmt8,
    isWorkdayGmt8,
    getGmt8Weekday,
    buildTrajectorySeries,
    OJT_START
} from '../core/dtr-engine';

declare const Chart: any;

declare global {
    interface Window {
        Chart?: any;
        __telemetryMotionInit?: boolean;
        chartViews?: Record<string, string>;
        deltaChartScrollEnabled?: boolean;
        DTRI18N?: any;
        charts?: any;
        COLORS?: any;
    }
}

function getChartColors(): Record<string, any> {
    if (typeof window !== 'undefined' && (window as any).COLORS && (window as any).COLORS.accent) {
        return (window as any).COLORS;
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
        const style = getComputedStyle(document.documentElement);
        const accent = style.getPropertyValue('--accent').trim() || '#ff1e00';
        return {
            accent,
            excellent: style.getPropertyValue('--level-3').trim() || '#FF00FF',
            good: style.getPropertyValue('--level-2').trim() || '#00D1FF',
            warning: style.getPropertyValue('--level-1').trim() || '#FFB800',
            aux: style.getPropertyValue('--chart-aux').trim() || null,
            text: style.getPropertyValue('--text').trim() || '#ffffff',
            grid: style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)',
            fill: style.getPropertyValue('--chart-fill').trim() || 'rgba(255,255,255,0.02)',
            fontBody: style.getPropertyValue('--font-body').trim() || 'monospace',
            fontHeading: style.getPropertyValue('--font-heading').trim() || 'sans-serif'
        };
    }
    return {
        accent: '#ff1e00',
        excellent: '#FF00FF',
        good: '#00D1FF',
        warning: '#FFB800',
        aux: null,
        text: '#ffffff',
        grid: 'rgba(255,255,255,0.05)',
        fill: 'rgba(255,255,255,0.02)',
        fontBody: 'monospace',
        fontHeading: 'sans-serif'
    };
}

const COLORS: any = new Proxy({}, {
    get(_target, prop: string) {
        const current = (typeof window !== 'undefined' && (window as any).COLORS) || {};
        if (current[prop] !== undefined && current[prop] !== null) {
            return current[prop];
        }
        const fallback = getChartColors();
        return fallback[prop];
    }
});
const charts: any = (typeof window !== 'undefined')
    ? ((window as any).charts = (window as any).charts || {})
    : {};

function destroyChartInstance(chartKey: string, canvas: HTMLCanvasElement | null): void {
    if (canvas && typeof Chart !== 'undefined' && typeof Chart.getChart === 'function') {
        try {
            const existing = Chart.getChart(canvas);
            if (existing) {
                existing.destroy();
            }
        } catch (_) {}
    }
    if (charts && charts[chartKey] && typeof charts[chartKey].destroy === 'function') {
        try {
            charts[chartKey].destroy();
        } catch (_) {}
        delete charts[chartKey];
    }
}

// Shared chart motion profile + hover feedback for telemetry cards.
if (typeof window !== "undefined" && window.Chart && !window.__telemetryMotionInit) {
    window.__telemetryMotionInit = true;

    Chart.defaults.animation = {
        duration: 850,
        easing: "easeOutQuart"
    };
    Chart.defaults.animations = {
        x: { duration: 650, easing: "easeOutCubic" },
        y: { duration: 850, easing: "easeOutQuart" }
    };
    Chart.defaults.transitions.active = {
        animation: {
            duration: 180
        }
    };

    Chart.register({
        id: "telemetryHoverPulse",
        afterEvent(chart, args) {
            const card = chart && chart.canvas ? chart.canvas.closest(".chart-card") : null;
            if (!card || !args || !args.event) return;
            const type = args.event.type;
            if (type === "mouseout" || type === "mouseleave") {
                card.classList.remove("telemetry-chart-hover");
                return;
            }
            if (type === "mousemove" || type === "touchmove" || type === "pointermove") {
                const active = chart.getActiveElements();
                card.classList.toggle("telemetry-chart-hover", Array.isArray(active) && active.length > 0);
            }
        }
    });
}

function boostColor(hexOrRgba: any, boost = 0.18): string {
    if (!hexOrRgba || typeof hexOrRgba !== 'string') {
        const fallback = COLORS.accent || '#ff1e00';
        return typeof fallback === 'string' ? fallback : '#ff1e00';
    }

    const hex = hexOrRgba.trim();
    if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
        const n = parseInt(hex.slice(1), 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        const nr = Math.min(255, Math.round(r + (255 - r) * boost));
        const ng = Math.min(255, Math.round(g + (255 - g) * boost));
        const nb = Math.min(255, Math.round(b + (255 - b) * boost));
        return `rgb(${nr}, ${ng}, ${nb})`;
    }

    const rgbMatch = hex.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) {
            const r = Number(parts[0]);
            const g = Number(parts[1]);
            const b = Number(parts[2]);
            const a = parts.length > 3 ? Number(parts[3]) : null;
            if ([r, g, b].every(v => Number.isFinite(v))) {
                const nr = Math.min(255, Math.round(r + (255 - r) * boost));
                const ng = Math.min(255, Math.round(g + (255 - g) * boost));
                const nb = Math.min(255, Math.round(b + (255 - b) * boost));
                return a !== null && Number.isFinite(a)
                    ? `rgba(${nr}, ${ng}, ${nb}, ${a})`
                    : `rgb(${nr}, ${ng}, ${nb})`;
            }
        }
    }

    return hexOrRgba || '#ff1e00';
}

function withAlpha(color: any, alpha = 0.2): string {
    const clamped = Math.max(0, Math.min(1, Number(alpha) || 0));
    if (!color || typeof color !== "string") {
        return `rgba(255, 30, 0, ${clamped})`;
    }
    const v = color.trim();

    if (/^#([0-9a-fA-F]{6})$/.test(v)) {
        const n = parseInt(v.slice(1), 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }

    const rgbMatch = v.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(",").map((p) => p.trim());
        if (parts.length >= 3) {
            const r = Number(parts[0]);
            const g = Number(parts[1]);
            const b = Number(parts[2]);
            if ([r, g, b].every((num) => Number.isFinite(num))) {
                return `rgba(${r}, ${g}, ${b}, ${clamped})`;
            }
        }
    }

    return color || `rgba(255, 30, 0, ${clamped})`;
}

/**
 * Interpolates between two hex colors based on a factor (0-1)
 */
function interpolateHex(color1, color2, factor) {
    const f = Math.max(0, Math.min(1, factor));
    const parse = (c) => {
        if (typeof c !== 'string') return [255, 255, 255];
        if (c.startsWith('#')) {
            const hex = c.length === 4 ? c[1]+c[1]+c[2]+c[2]+c[3]+c[3] : c.slice(1);
            return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }
        const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [255, 255, 255];
    };
    const c1 = parse(color1);
    const c2 = parse(color2);
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Maps a ratio (0-1) to the project's performance color ramp
 */
function getPerformanceColor(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    // Ramp: Warning (0.0) -> Accent (0.35) -> Good (0.7) -> Excellent (1.0)
    const cWarning = (typeof COLORS !== 'undefined' && COLORS.warning) ? COLORS.warning : '#FFB800';
    const cAccent = (typeof COLORS !== 'undefined' && COLORS.accent) ? COLORS.accent : '#ff1e00';
    const cGood = (typeof COLORS !== 'undefined' && COLORS.good) ? COLORS.good : '#00D1FF';
    const cExcellent = (typeof COLORS !== 'undefined' && COLORS.excellent) ? COLORS.excellent : '#FF00FF';

    if (r < 0.35) return interpolateHex(cWarning, cAccent, r / 0.35);
    if (r < 0.7) return interpolateHex(cAccent, cGood, (r - 0.35) / 0.35);
    return interpolateHex(cGood, cExcellent, (r - 0.7) / 0.3);
}

function renderTrajectoryChart(logs: any[], customPace: number | null = null): void {
    const canvas = document.getElementById('trajectoryChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('trajectory', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Create GRADIENTS
    const gradAccent = ctx.createLinearGradient(0, 0, 0, 400);
    const topColor = withAlpha(boostColor(COLORS.accent || '#ff1e00', 0.22), 0.5) || 'rgba(255, 30, 0, 0.5)';
    const bottomColor = COLORS.fill || 'rgba(255, 255, 255, 0.02)';
    gradAccent.addColorStop(0, topColor);
    gradAccent.addColorStop(1, bottomColor);

    const lineAccent = boostColor(COLORS.accent, 0.2);
    const lineExcellent = boostColor(COLORS.excellent, 0.18);
    const lineText = boostColor(COLORS.aux || COLORS.text, 0.12);

    const series = buildTrajectorySeries({ logs, paceOverride: customPace });
    const labels = series.labels;
    const actualCumulative = series.actualCumulative;
    const projectedCumulative = series.projectedCumulative;
    const idealCumulative = series.idealCumulative;
    const maxProjected = projectedCumulative.filter((v: any) => v != null);
    const maxActual = actualCumulative.filter((v: any) => v != null);
    const targetHours = series && series.forecast && Number.isFinite(series.forecast.targetHours)
        ? series.forecast.targetHours
        : getCurrentRequiredOjtHours();
    const yMaxSource = Math.max(
        targetHours,
        maxActual.length ? Math.max(...maxActual) : 0,
        maxProjected.length ? Math.max(...maxProjected) : 0
    );

    const chartType = window.chartViews?.trajectory || 'line';
    
    charts.trajectory = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [
                { 
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_trajectory_actual') : 'Actual Progress', 
                    data: actualCumulative, 
                    borderColor: lineAccent, 
                    backgroundColor: chartType === 'bar' ? lineAccent : gradAccent, 
                    borderWidth: chartType === 'bar' ? 0 : 3,
                    fill: chartType === 'bar' ? false : true, 
                    tension: 0.1,
                    pointRadius: chartType === 'bar' ? 0 : 2,
                    spanGaps: false,
                    grouped: false,
                    barPercentage: 0.5,
                    categoryPercentage: 0.8,
                    order: 1
                },
                { 
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_trajectory_projected') : 'Forecasted Projection', 
                    data: projectedCumulative, 
                    borderColor: lineExcellent, 
                    backgroundColor: chartType === 'bar' ? withAlpha(lineExcellent, 0.3) : 'transparent',
                    borderWidth: chartType === 'bar' ? 1 : 2.5,
                    borderDash: chartType === 'bar' ? [] : [3, 3],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4,
                    spanGaps: true,
                    grouped: false,
                    barPercentage: 0.75,
                    categoryPercentage: 0.8,
                    order: 2
                },
                { 
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_trajectory_ideal', { hours: DAILY_TARGET_HOURS }) : `Ideal Target (Standard ${DAILY_TARGET_HOURS}h Daily)`,
                    data: idealCumulative, 
                    borderColor: lineText,
                    backgroundColor: chartType === 'bar' ? withAlpha(lineText, 0.15) : 'transparent',
                    borderWidth: chartType === 'bar' ? 1 : 2,
                    borderDash: chartType === 'bar' ? [] : [5, 5], 
                    pointRadius: 0,
                    grouped: false,
                    barPercentage: 1.0,
                    categoryPercentage: 0.8,
                    order: 3
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                    callbacks: {
                        footer: (tooltipItems: any[]) => {
                            const actual = tooltipItems.find((i: any) => i.datasetIndex === 0)?.parsed.y || 0;
                            const ideal = tooltipItems.find((i: any) => i.datasetIndex === 2)?.parsed.y || 0;
                            const diff = ideal - actual;
                            if (actual === 0 && ideal === 0) return null;
                            const t = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t : null;
                            const deficitLabel = t ? t('charts_general.chart_deficit') : 'Deficit: ';
                            const surplusLabel = t ? t('charts_general.chart_surplus') : 'Surplus: ';
                            const onTrackLabel = t ? t('status_indicators.status_on_track') : 'On Track';
                            const hours = Math.abs(diff).toFixed(1);

                            if (diff > 0) {
                                return t ? t('charts_general.chart_behind_tooltip', { hours }) : `${deficitLabel}${hours}h behind`;
                            } else if (diff < 0) {
                                return t ? t('charts_general.chart_ahead_tooltip', { hours }) : `${surplusLabel}${hours}h ahead`;
                            } else {
                                return onTrackLabel;
                            }
                        }
                    }
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true,
                    max: Math.ceil(yMaxSource / 50) * 50 + 50,
                    grid: { color: COLORS.grid },
                    ticks: { font: { family: "'Formula1 Display', sans-serif", size: 10 } }
                }, 
                x: { 
                    ticks: { 
                        autoSkip: true, 
                        maxTicksLimit: 12,
                        font: { family: "'Formula1 Display', sans-serif", size: 9 }
                    }, 
                    grid: { display: false } 
                } 
            }
        }
    });
}

function renderEnergyZoneChart(logs: any[]): void {
    const canvas = document.getElementById('energyZoneChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('energy', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const detailsEl = document.getElementById('energyZoneDateDetails');

    const t = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t : null;
    const zoneTranslationMap: Record<string, string> = {
        "Elite": t ? t("charts_general.chart_energy_elite") : "Elite",
        "Overdrive": t ? t("charts_general.chart_energy_overdrive") : "Overdrive",
        "Solid": t ? t("charts_general.chart_energy_solid") : "Solid",
        "Survival": t ? t("charts_general.chart_energy_survival") : "Survival",
        "Recovery": t ? t("charts_general.chart_energy_recovery") : "Recovery"
    };
    const zoneOrder = ["Recovery", "Survival", "Solid", "Overdrive", "Elite"];
    const zones: Record<string, number> = { Elite: 0, Overdrive: 0, Solid: 0, Survival: 0, Recovery: 0 };
    const zoneDates: Record<string, string[]> = { Elite: [], Overdrive: [], Solid: [], Survival: [], Recovery: [] };

    // Build a set of all logged date keys for gap detection
    const loggedDateKeys = new Set<string>();
    logs.forEach(r => {
        const dateKey = toGmt8DateKey(r.date) || r.date;
        if (dateKey) loggedDateKeys.add(dateKey);
    });

    // Count missing dates between OJT start and last log as Recovery
    if (loggedDateKeys.size > 0) {
        const ojtStartKey = toGmt8DateKey(OJT_START || getCurrentOjtStartDate());
        const sortedKeys = [...loggedDateKeys].sort();
        const lastKey = sortedKeys[sortedKeys.length - 1];
        const startDate = parseDateKeyGmt8(ojtStartKey);
        const endDate = parseDateKeyGmt8(lastKey);
        if (startDate && endDate) {
            for (let d: Date | null = new Date(startDate.getTime()); d && d <= endDate; d = addDaysGmt8(d, 1)) {
                const dk = toGmt8DateKey(d);
                if (dk && !loggedDateKeys.has(dk) && isWorkdayGmt8(d)) {
                    zones["Recovery"]++;
                    zoneDates["Recovery"].push(dk + " ⟵ gap");
                }
            }
        }
    }

    logs.forEach(r => {
        const total = r.hours + (r.personalHours || 0);
        const dateKey = toGmt8DateKey(r.date) || r.date;
        let zone = "Recovery";
        // Priority: Overdrive > Elite > Solid > Survival > Recovery
        if (total > 9) zone = "Overdrive";
        else if (r.hours >= 8 && (r.personalHours || 0) >= 1) zone = "Elite";
        else if (r.hours >= 8) zone = "Solid";
        else if (r.hours >= 6) zone = "Survival";
        zones[zone]++;
        if (dateKey) zoneDates[zone].push(dateKey);
    });

    const noDatesLabel = t ? t("charts_general.chart_no_dates_window") : "No dates in current window.";
    const zoneClickText = t ? t("charts_general.chart_click_zone_bar") : "Click a zone bar to view specific dates.";

    if (detailsEl) {
        detailsEl.innerHTML = zoneClickText;
    }

    charts.energy = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zoneOrder.map(z => zoneTranslationMap[z] || z),
            datasets: [{
                label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_energy_sessions') : 'Sessions',
                data: zoneOrder.map(z => zones[z]),
                backgroundColor: [withAlpha(COLORS.text, 0.6), COLORS.warning, COLORS.good, COLORS.accent, COLORS.excellent],
                borderRadius: 4
            }]
        },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (!detailsEl) return;
                if (!elements || !elements.length) return;
                const idx = elements[0].index;
                const zoneKey = zoneOrder[idx];
                const zoneLabel = zoneTranslationMap[zoneKey] || zoneKey;
                const dates = zoneDates[zoneKey] || [];
                
                if (!dates.length) {
                    detailsEl.innerHTML = `<strong>${zoneLabel}:</strong> ${noDatesLabel}`;
                    return;
                }

                // Sort by date (already format YYYY-MM-DD, so alphabetic sort is chronological)
                const sortedDates = [...dates].sort();
                
                const items = sortedDates.map((d) => {
                    // Extract date parts for label
                    const rawDate = d.split(" ")[0]; // handle "gap" marker if present
                    const dObj = parseDateKeyGmt8(rawDate);
                    const w = dObj ? getWeekNumber(dObj) : "?";
                    const isGap = d.includes("gap");
                    const color = isGap ? "opacity:0.5;" : "";
                    const weekLabel = dObj ? `<span style="opacity:0.6; font-size:9px; margin-left:4px;">W${w}</span>` : "";
                    return `<div style="${color} border-bottom:1px solid rgba(255,255,255,0.05); padding: 2px 0;">${rawDate}${weekLabel}</div>`;
                }).join("");

                detailsEl.innerHTML = `
                    <div style="margin-bottom:8px; border-bottom:1px solid var(--accent); padding-bottom:4px;">
                        <strong>${zoneLabel} (${dates.length})</strong>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; font-size: 10px;">
                        ${items}
                    </div>
                `;
            },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 }
                }
            },
            scales: { 
                x: { 
                    beginAtZero: true, 
                    grid: { color: COLORS.grid },
                    ticks: { font: { family: "'Formula1 Display', sans-serif", size: 9 } }
                },
                y: {
                    ticks: { font: { family: "'Formula1 Display', sans-serif", size: 10 } }
                }
            }
        }
    });
}
function renderIdentityChart(logs: any[]): void {
    const canvas = document.getElementById('identityChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('identity', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const t = (window.DTRI18N && typeof window.DTRI18N.t === "function") ? window.DTRI18N.t : null;

    const weeklyIdentity: Record<number, { sum: number; count: number }> = {};
    logs.forEach((r) => {
        const score = parseInt(r.identityScore, 10) || 0;
        if (score <= 0) return;
        const w = getWeekNumber(r.date);
        if (!weeklyIdentity[w]) weeklyIdentity[w] = { sum: 0, count: 0 };
        weeklyIdentity[w].sum += score;
        weeklyIdentity[w].count += 1;
    });

    const sortedWeeks = Object.keys(weeklyIdentity).map(Number).sort((a, b) => a - b);
    const noDataLabel = t ? t("chart_id_no_data") : "No Data";
    const alignScoreLabel = t ? t("chart_id_alignment") : "Alignment Score";

    if (!sortedWeeks.length) {
        charts.identity = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [(window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_id_no_data') : noDataLabel],
                datasets: [{
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_id_alignment') : alignScoreLabel,
                    data: [0],
                    backgroundColor: withAlpha(COLORS.grid, 0.35)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 5, grid: { color: COLORS.grid } } }
            }
        });
        return;
    }

    const labels = sortedWeeks.map((w) => (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t("ui.week_label", { week: w }) : `Week ${w}`);
    const avgScores = sortedWeeks.map((w) => weeklyIdentity[w].sum / weeklyIdentity[w].count);
    const counts = sortedWeeks.map((w) => weeklyIdentity[w].count);
    const targetLine = sortedWeeks.map(() => 4);
    const idTheme = {
        excellent: boostColor(COLORS.excellent, 0.12),
        good: boostColor(COLORS.good, 0.12),
        warning: boostColor(COLORS.accent, 0.12),
        accent: boostColor(COLORS.accent, 0.12),
        text: boostColor(COLORS.text, 0.06)
    };

    const weeklyAvgLabel = t ? t("chart_id_weekly_avg") : "Weekly Avg";
    const targetLabel = t ? t("chart_id_target") : "Target (4.0)";
    const entryCountLabel = t ? t("chart_id_entry_count") : "Entry Count";

    const viewType = window.chartViews?.identity || 'radar';
    if (charts.identity && typeof charts.identity.destroy === "function") {
        charts.identity.destroy();
    }

    if (viewType === 'radar') {
        const radarLabels = sortedWeeks.map(w => `W${w}`);
        charts.identity = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: radarLabels,
                datasets: [
                    {
                        label: weeklyAvgLabel,
                        data: avgScores,
                        backgroundColor: withAlpha(COLORS.accent, 0.2),
                        borderColor: COLORS.accent,
                        borderWidth: 2,
                        pointBackgroundColor: COLORS.accent,
                        fill: true
                    },
                    {
                        label: entryCountLabel,
                        data: counts.map(c => c),
                        backgroundColor: withAlpha(COLORS.excellent, 0.1),
                        borderColor: COLORS.excellent,
                        borderWidth: 2,
                        pointBackgroundColor: COLORS.excellent,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: COLORS.grid },
                        grid: { color: COLORS.grid },
                        pointLabels: { color: COLORS.text, font: { size: 10 } },
                        suggestedMin: 0,
                        suggestedMax: 5,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: { legend: { display: true, labels: { color: COLORS.text } } }
            }
        });
        return;
    }

    charts.identity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('charts_general.chart_id_weekly_avg') : weeklyAvgLabel,
                    data: avgScores,
                    backgroundColor: avgScores.map((score) => {
                        if (score >= 4) return withAlpha(idTheme.excellent, 0.67);
                        if (score >= 3) return withAlpha(idTheme.good, 0.67);
                        if (score >= 2) return withAlpha(idTheme.warning, 0.67);
                        return withAlpha(idTheme.accent, 0.67);
                    }),
                    borderColor: avgScores.map((score) => {
                        if (score >= 4) return idTheme.excellent;
                        if (score >= 3) return idTheme.good;
                        if (score >= 2) return idTheme.warning;
                        return idTheme.accent;
                    }),
                    borderWidth: 2,
                    borderRadius: 4,
                    yAxisID: 'y',
                    xAxisID: 'x'
                },
                {
                    type: 'line',
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('chart_id_target') : targetLabel,
                    data: targetLine,
                    borderColor: withAlpha(idTheme.text, 0.53),
                    borderDash: [5, 3],
                    pointRadius: 0,
                    tension: 0,
                    yAxisID: 'y',
                    xAxisID: 'x'
                },
                {
                    type: 'line',
                    label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('chart_id_entry_count') : entryCountLabel,
                    data: counts,
                    borderColor: COLORS.aux || idTheme.accent,
                    backgroundColor: withAlpha(COLORS.aux || idTheme.accent, 0.2),
                    pointBackgroundColor: COLORS.aux || idTheme.accent,
                    pointRadius: 3,
                    pointBorderColor: boostColor(COLORS.text, 0.1),
                    pointBorderWidth: 1,
                    tension: 0.3,
                    yAxisID: 'y1',
                    xAxisID: 'x'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { font: { size: 11, family: "'Formula1 Display', sans-serif" }, color: COLORS.text }
                },
                tooltip: {
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                    callbacks: {
                        afterLabel: (context: any) => {
                            if (context.dataset.type === 'bar') {
                                const idx = context.dataIndex;
                                return `${entryCountLabel}: ${counts[idx]}`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'category',
                    grid: { display: false }
                },
                y: {
                    min: 0,
                    max: 5,
                    ticks: { stepSize: 1, callback: (value: any) => Number(value).toFixed(1) },
                    grid: { color: COLORS.grid },
                    title: { display: true, text: alignScoreLabel, font: { size: 11 } }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { precision: 0 },
                    title: { display: true, text: entryCountLabel, font: { size: 11 } }
                }
            }
        }
    });
}

function renderCandlestickChart(logs: any[]): void {
    const canvas = document.getElementById('candlestickChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('candlestick', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const weeklyOHLC: Record<number, any> = {};
    const sorted = [...logs].sort((a,b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));

    const tCandle = (window.DTRI18N && typeof window.DTRI18N.t === "function") ? window.DTRI18N.t : null;
    const wickLabel = tCandle ? tCandle('ui.chart_wick') : "Wick";
    const bodyLabel = tCandle ? tCandle('ui.chart_body') : "Body";
    const highLabel = tCandle ? tCandle('ui.chart_high') : "High";
    const openLabel = tCandle ? tCandle('ui.chart_open') : "Open";
    const closeLabel = tCandle ? tCandle('ui.chart_close') : "Close";
    const lowLabel = tCandle ? tCandle('ui.chart_low') : "Low";

    sorted.forEach(r => {
        const w = getWeekNumber(r.date);
        const delta = r.hours - 8;
        
        if (!weeklyOHLC[w]) {
            const label = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t("week_label", { week: w }) : `Week ${w}`;
            weeklyOHLC[w] = { week: label, open: delta, close: delta, high: delta, low: delta };
        } else {
            weeklyOHLC[w].close = delta; 
            weeklyOHLC[w].high = Math.max(weeklyOHLC[w].high, delta);
            weeklyOHLC[w].low = Math.min(weeklyOHLC[w].low, delta);
        }
    });

    const weeks: any[] = Object.values(weeklyOHLC).map(w => {
        if (Math.abs(w.open - w.close) < 0.05) {
            w.close = w.open + 0.05;
        }
        return w;
    });

    const viewType = window.chartViews?.momentum || 'candlestick';
    if (charts.candlestick && typeof charts.candlestick.destroy === "function") {
        charts.candlestick.destroy();
    }

    if (viewType === 'bar') {
        charts.candlestick = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weeks.map(w => w.week),
                datasets: [
                    {
                        label: bodyLabel,
                        data: weeks.map(w => w.close),
                        backgroundColor: weeks.map(w => w.close >= 0 ? COLORS.good : COLORS.accent),
                        borderColor: weeks.map(w => w.close >= 0 ? COLORS.good : COLORS.accent),
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => {
                                const val = context.parsed.y;
                                return `${bodyLabel}: ${val > 0 ? '+' : ''}${val.toFixed(1)}h`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: COLORS.grid },
                        ticks: { callback: (value: any) => (value > 0 ? '+' : '') + value + 'h' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
        return;
    }

    charts.candlestick = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks.map(w => w.week),
            datasets: [
                {
                    label: wickLabel,
                    data: weeks.map(w => [w.low, w.high]),
                    backgroundColor: weeks.map(w => w.close >= w.open ? withAlpha(COLORS.good, 0.53) : withAlpha(COLORS.accent, 0.53)),
                    borderColor: 'transparent',
                    barPercentage: 0.1,
                    grouped: false,
                    order: 2
                },
                {
                    label: bodyLabel,
                    data: weeks.map(w => [Math.min(w.open, w.close), Math.max(w.open, w.close)]),
                    backgroundColor: weeks.map(w => w.close >= w.open ? COLORS.good : COLORS.accent),
                    borderColor: weeks.map(w => w.close >= w.open ? COLORS.good : COLORS.accent),
                    borderWidth: 1,
                    barPercentage: 0.7, 
                    grouped: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                    displayColors: true,
                    callbacks: {
                        label: (context: any) => {
                            if (context.datasetIndex !== 1) return null;
                            const d = weeks[context.dataIndex];
                            return [
                                `${highLabel}:  ${d.high > 0 ? '+' : ''}${d.high.toFixed(1)}h`,
                                `${openLabel}:  ${d.open > 0 ? '+' : ''}${d.open.toFixed(1)}h`,
                                `${closeLabel}: ${d.close > 0 ? '+' : ''}${d.close.toFixed(1)}h`,
                                `${lowLabel}:   ${d.low > 0 ? '+' : ''}${d.low.toFixed(1)}h`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: COLORS.grid },
                    ticks: { callback: (value: any) => (value > 0 ? '+' : '') + value + 'h' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderContextualCharts(logs: any[], selectedWeek?: any): void {
    const deltaCanvas = document.getElementById('deltaChart') as HTMLCanvasElement | null;
    const container = document.getElementById('deltaChartContainer') || (deltaCanvas ? deltaCanvas.parentElement : null);
    const scrollWrapper = document.getElementById('deltaChartScrollWrapper') || (container ? container.parentElement : null);
    
    const isScroll = typeof window !== 'undefined' && 
        (Boolean((window as any).deltaChartScrollEnabled) || localStorage.getItem("telemetry-delta-scroll") === "true");

    if (container) {
        if (isScroll && Array.isArray(logs) && logs.length > 0) {
            const minWidthPerPoint = 45;
            const targetWidth = Math.max(logs.length * minWidthPerPoint, 800);
            container.style.width = `${targetWidth}px`;
            container.style.minWidth = `${targetWidth}px`;
            if (scrollWrapper) {
                scrollWrapper.style.overflowX = 'auto';
            }
        } else {
            container.style.width = '100%';
            container.style.minWidth = '100%';
            if (scrollWrapper) {
                scrollWrapper.style.overflowX = 'hidden';
            }
        }
    }
    if (deltaCanvas) {
        destroyChartInstance('delta', deltaCanvas);
        const deltas = logs.map(r => r.hours - 8);
        let cumulativeDelta = 0;
        const cumulativeDeltas = deltas.map(d => {
            cumulativeDelta += d;
            return cumulativeDelta;
        });
        
        const t = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t : null;
        const dailyDeltaLabel = t ? t('chart_daily_delta') : "Daily Delta";
        const cumulativeDeltaLabel = t ? t('chart_cumulative_delta') : "Cumulative Delta";
        const dailyDeltaHoursLabel = t ? t('chart_daily_delta_label') : "Daily Delta (hours)";
        const cumulativeHoursLabel = t ? t('chart_delta_cumulative_label') : "Cumulative (hours)";

        const ctx = deltaCanvas.getContext('2d');
        if (ctx) {
            charts.delta = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: logs.map(r => r.date),
                    datasets: [
                        {
                            label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('chart_delta_daily') : dailyDeltaLabel,
                            data: deltas,
                            backgroundColor: deltas.map(d => d >= 0 ? withAlpha(COLORS.good, 0.53) : withAlpha(COLORS.accent, 0.53)),
                            borderColor: deltas.map(d => d >= 0 ? COLORS.good : COLORS.accent),
                            borderWidth: 1,
                            borderRadius: 2,
                            yAxisID: 'y',
                            order: 2
                        },
                        {
                            label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('chart_delta_cumulative') : cumulativeDeltaLabel,
                            type: 'line',
                            data: cumulativeDeltas,
                            borderColor: COLORS.aux || boostColor(COLORS.accent, 0.22),
                            backgroundColor: 'transparent',
                            borderWidth: 3,
                            pointBackgroundColor: COLORS.aux || boostColor(COLORS.accent, 0.22),
                            pointBorderColor: boostColor(COLORS.text, 0.1),
                            pointBorderWidth: 1,
                            pointRadius: 3,
                            tension: 0.3,
                            yAxisID: 'y1',
                            order: 1
                        }
                    ]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    indexAxis: undefined,
                    plugins: { 
                        legend: { 
                            display: true,
                            position: 'top',
                            labels: { 
                                font: { size: 11, family: "'Formula1 Display', sans-serif" }, 
                                color: COLORS.text 
                            }
                        },
                        tooltip: {
                            titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                            bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                            callbacks: {
                                label: (context: any) => {
                                    if (context.dataset.label === dailyDeltaLabel) {
                                        const val = context.parsed.y;
                                        return `${dailyDeltaLabel}: ${val > 0 ? '+' : ''}${val.toFixed(1)}h`;
                                    } else {
                                        const val = context.parsed.y;
                                        return `${cumulativeDeltaLabel}: ${val > 0 ? '+' : ''}${val.toFixed(1)}h`;
                                    }
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            type: 'linear',
                            position: 'left',
                            grid: { color: COLORS.grid },
                            title: { display: true, text: dailyDeltaHoursLabel, font: { size: 10 } },
                            ticks: { callback: (value: any) => (value > 0 ? '+' : '') + value + 'h' }
                        },
                        y1: { 
                            type: 'linear',
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: cumulativeHoursLabel, font: { size: 10 } },
                            ticks: { callback: (value: any) => (value > 0 ? '+' : '') + value + 'h' }
                        },
                        x: { display: true }
                    }
                }
            });
        }
    }
    renderCandlestickChart(logs);
}

function renderRadarChart(logs: any[]): void {
    const canvas = document.getElementById('dayVelocityRadar') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('radar', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tRadar = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t : null;
    const days = tRadar 
        ? [tRadar('chart_radar_mon'), tRadar('chart_radar_tue'), tRadar('chart_radar_wed'), tRadar('chart_radar_thu'), tRadar('chart_radar_fri'), tRadar('chart_radar_sat')]
        : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; 

    const dayAverages = [0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0];

    logs.forEach(l => {
        const d0 = parseDateKeyGmt8(toGmt8DateKey(l.date));
        if (!d0) return;
        const d = getGmt8Weekday(d0);
        if (d === 0) return;
        const idx = d - 1;
        dayAverages[idx] += l.hours;
        dayCounts[idx]++;
    });

    const data = dayAverages.map((sum, i) => dayCounts[i] > 0 ? sum / dayCounts[i] : 0);

    charts.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: days,
            datasets: [{
                label: (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t('chart_radar_avg_hours') : 'Avg Hours',
                data: data,
                borderColor: COLORS.aux || boostColor(COLORS.accent, 0.22),
                backgroundColor: withAlpha(COLORS.aux || boostColor(COLORS.accent, 0.22), 0.12),
                borderWidth: 3,
                pointBackgroundColor: COLORS.aux || boostColor(COLORS.accent, 0.24),
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: COLORS.grid },
                    grid: { color: COLORS.grid },
                    pointLabels: { 
                        color: COLORS.text, 
                        font: { size: 11, family: "'Formula1 Display', sans-serif" } 
                    },
                    ticks: { display: false, stepSize: 2 },
                    min: 0,
                    max: 12
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderProductivityMatrix(logs: any[]): void {
    const canvas = document.getElementById('productivityMatrixChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('productivity', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const t = (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t : null;

    const dataPoints = logs.map(r => {
        const tasks = (r.accomplishments && Array.isArray(r.accomplishments)) ? r.accomplishments.length : 0;
        const output = r.hours > 0 ? (tasks / r.hours) : 0;
        const identity = parseInt(r.identityScore, 10) || 0;
        const perfRatio = Math.min(1, (output / 2.5) * 0.4 + (identity / 5) * 0.6);
        return {
            x: identity,
            y: parseFloat(output.toFixed(2)),
            r: Math.max(6, Math.min(22, (r.hours * 2.2))),
            perf: perfRatio,
            date: r.date,
            duration: r.hours,
            tasks: tasks
        };
    }).filter(p => p.x > 0);

    if (charts.productivity && typeof charts.productivity.destroy === "function") {
        charts.productivity.destroy();
    }

    charts.productivity = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                data: dataPoints,
                backgroundColor: (ctx: any) => {
                    const p = ctx.raw;
                    return p ? withAlpha(getPerformanceColor(p.perf), 0.8) : COLORS.accent;
                },
                borderColor: (ctx: any) => {
                    const p = ctx.raw;
                    return p ? getPerformanceColor(p.perf) : COLORS.accent;
                },
                borderWidth: 2,
                hoverRadius: 2,
                hoverBorderWidth: 3,
                hoverBorderColor: '#ffffff',
                shadowBlur: 20,
                shadowColor: (ctx: any) => {
                    const p = ctx.raw;
                    return p ? getPerformanceColor(p.perf) : 'transparent';
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(16, 19, 26, 0.95)',
                    titleColor: COLORS.accent,
                    borderColor: COLORS.border || 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    callbacks: {
                        label: (context: any) => {
                            const p = context.raw;
                            return [
                                `DATE: ${p.date}`,
                                `ALIGNMENT: ${p.x}/5`,
                                `OUTPUT: ${p.y} tasks/hr`,
                                `INTENSITY: ${p.duration}h`,
                                `PERFORMANCE: ${p.perf}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: t ? t('charts_general.chart_productivity_matrix_x') : 'IDENTITY ALIGNMENT', color: COLORS.text, font: { size: 10, weight: 'bold', family: "'Formula1 Display', sans-serif" } },
                    min: 0.5,
                    max: 5.5,
                    grid: { color: COLORS.grid, borderDash: [2, 2] },
                    ticks: { stepSize: 1, color: withAlpha(COLORS.text, 0.7), font: { family: "'Formula1 Display', sans-serif", size: 9 } }
                },
                y: {
                    title: { display: true, text: t ? t('charts_general.chart_productivity_matrix_y') : 'TASKS PER HOUR', color: COLORS.text, font: { size: 10, weight: 'bold', family: "'Formula1 Display', sans-serif" } },
                    beginAtZero: true,
                    grid: { color: COLORS.grid, borderDash: [2, 2] },
                    ticks: { color: withAlpha(COLORS.text, 0.7), font: { family: "'Formula1 Display', sans-serif", size: 9 } }
                }
            }
        }
    });
}

function renderWeeklyEffortChart(logs: any[]): void {
    const canvas = document.getElementById('weeklyEffortChart') as HTMLCanvasElement | null;
    if (!canvas) return;
    destroyChartInstance('weeklyEffort', canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const weeklyData: Record<number, { ojt: number; personal: number }> = {};
    logs.forEach(r => {
        const w = getWeekNumber(r.date);
        if (!weeklyData[w]) weeklyData[w] = { ojt: 0, personal: 0 };
        weeklyData[w].ojt += r.hours;
        weeklyData[w].personal += (r.personalHours || 0);
    });

    const sortedWeeks = Object.keys(weeklyData).map(Number).sort((a,b) => a - b);
    const t = (window.DTRI18N && typeof window.DTRI18N.t === "function") ? window.DTRI18N.t : null;
    const labels = sortedWeeks.map(w => (window.DTRI18N && window.DTRI18N.t) ? window.DTRI18N.t("week_label", { week: w }) : `Week ${w}`);
    const ojtHours = sortedWeeks.map(w => weeklyData[w].ojt);
    const personalHours = sortedWeeks.map(w => weeklyData[w].personal);
    const totalHours = sortedWeeks.map(w => weeklyData[w].ojt + weeklyData[w].personal);

    const viewType = window.chartViews?.effort || 'bar';
    if (charts.weeklyEffort && typeof charts.weeklyEffort.destroy === "function") {
        charts.weeklyEffort.destroy();
    }

    const pieColors = [
        COLORS.accent, COLORS.good, COLORS.warning, COLORS.excellent,
        '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#a855f7'
    ];

    const datasets = viewType === 'pie' ? [
        {
            label: t ? t('chart_effort_total') : 'Total Hours',
            data: totalHours,
            backgroundColor: sortedWeeks.map((_, i) => withAlpha(pieColors[i % pieColors.length], 0.85)),
            borderColor: COLORS.bg || '#10131a',
            borderWidth: 2,
            hoverOffset: 6
        }
    ] : [
        {
            label: t ? t('chart_effort_ojt') : 'OJT Hours',
            data: ojtHours,
            backgroundColor: COLORS.accent,
            borderRadius: 4
        },
        {
            label: t ? t('chart_effort_personal') : 'Personal Hours',
            data: personalHours,
            backgroundColor: (COLORS.aux || COLORS.excellent),
            borderRadius: 4
        }
    ];

    charts.weeklyEffort = new Chart(ctx, {
        type: viewType === 'pie' ? 'pie' : 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: viewType === 'pie' ? 10 : 0
            },
            plugins: {
                legend: { 
                    position: viewType === 'pie' ? 'left' : 'top', 
                    labels: { 
                        color: COLORS.text, 
                        font: { size: 11, family: "'Formula1 Display', sans-serif" },
                        padding: viewType === 'pie' ? 20 : 10
                    } 
                },
                tooltip: {
                    titleFont: { family: "'Formula1 Display', sans-serif", size: 12 },
                    bodyFont: { family: "'Formula1 Display', sans-serif", size: 11 },
                    callbacks: {
                        afterBody: (tooltipItems: any[]) => {
                            if (viewType !== 'pie') return null;
                            const idx = tooltipItems[0].dataIndex;
                            const ojtStr = ojtHours[idx].toFixed(1) + 'h';
                            const persStr = personalHours[idx] > 0 ? personalHours[idx].toFixed(1) + 'h' : 'N/A';
                            return [
                                `OJT Worked: ${ojtStr}`,
                                `Personal Projects: ${persStr}`
                            ];
                        },
                        footer: (tooltipItems: any[]) => {
                            const total = tooltipItems.reduce((s: number, i: any) => {
                                const val = typeof i.parsed === 'number' ? i.parsed : (i.parsed.y || 0);
                                return s + val;
                            }, 0);
                            return t ? t('chart_effort_total', { hours: total.toFixed(1) }) : `Total Effort: ${total.toFixed(1)}h`;
                        }
                    }
                }
            },
            scales: viewType === 'pie' ? { x: { display: false }, y: { display: false } } : {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, grid: { color: COLORS.grid }, title: { display: true, text: t ? t('hours_worked') : 'Hours', color: COLORS.text } }
            }
        }
    });
}

export {
    boostColor,
    withAlpha,
    renderTrajectoryChart,
    renderEnergyZoneChart,
    renderIdentityChart,
    renderCandlestickChart,
    renderContextualCharts,
    renderRadarChart,
    renderProductivityMatrix,
    renderWeeklyEffortChart
};
