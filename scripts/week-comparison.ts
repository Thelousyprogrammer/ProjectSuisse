/**
 * WEEK COMPARISON MODULE
 */

import { Store } from './store';
import { DTRI18N } from './dtr-i18n';
import { getRecordsFromStore } from './dtr-image-store';
import { hydrateOjtSettingsFromStorage, getWeekNumber, getWeekDateRange } from './core/dtr-engine.js';

document.addEventListener("DOMContentLoaded", async () => {
    hydrateOjtSettingsFromStorage();

    // Wait for i18n to be ready to avoid raw keys in generated content
    if (DTRI18N && typeof DTRI18N.bootstrap === "function") {
        await DTRI18N.bootstrap();
    }

    const logs = await fetchWeekComparisonTelemetryData();
    renderWeekComparison(logs);
});

async function fetchWeekComparisonTelemetryData(): Promise<any[]> {
    let logs: any[] = [];
    try {
        const stored = await getRecordsFromStore();
        if (Array.isArray(stored)) logs = stored;
    } catch (_) {}
    if (!logs.length) {
        logs = Store.getRecords();
    }
    return logs.map(l => ({
        ...l,
        hours: parseFloat(l.hours) || 0,
        personalHours: parseFloat(l.personalHours) || 0
    }));
}

function getThemeColors(): { accent: string, excellent: string, text: string } {
    const style = getComputedStyle(document.documentElement);
    return {
        accent: style.getPropertyValue('--accent').trim() || '#ff1e00',
        excellent: style.getPropertyValue('--level-3').trim() || '#FF00FF',
        text: style.getPropertyValue('--text').trim() || '#ffffff'
    };
}

function renderWeekComparison(logs: any[]): void {
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
    const tbody = document.getElementById("comparisonTableBody");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        const noDataLabel = t ? t("ui.no_data_available") : "No data available";
        tbody.innerHTML = `<tr><td colspan="5" data-i18n="ui.no_data_available">${noDataLabel}</td></tr>`;
        return;
    }

    const colors = getThemeColors();
    const weekGroups: Record<number, { hours: number, personal: number, count: number, dates: Date[] }> = {};
    
    logs.forEach(r => {
        const w = getWeekNumber(r.date);
        if (!weekGroups[w]) weekGroups[w] = { hours: 0, personal: 0, count: 0, dates: [] };
        weekGroups[w].hours += r.hours;
        weekGroups[w].personal += r.personalHours;
        weekGroups[w].count++;
        weekGroups[w].dates.push(new Date(r.date));
    });

    const sortedWeeks = Object.keys(weekGroups).map(Number).sort((a,b) => a - b);
    tbody.innerHTML = "";

    const labels = sortedWeeks.map(w => t ? t("ui.week_label", { week: String(w) }) : `Week ${w}`);
    const ojtData = sortedWeeks.map(w => weekGroups[w].hours);
    const personalData = sortedWeeks.map(w => weekGroups[w].personal);
    const targetData = sortedWeeks.map(() => 40); // Standard 40h week target

    const canvas = document.getElementById('growthChart') as HTMLCanvasElement;
    if (canvas && (window as any).Chart) {
        const existing = (window as any).Chart.getChart(canvas);
        if (existing) {
            try { existing.destroy(); } catch (_) {}
        }
        new (window as any).Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: t ? t('week_comparison.chart_effort_personal') : 'Personal Hours',
                        data: personalData,
                        borderColor: colors.excellent,
                        backgroundColor: colors.excellent + '44',
                        fill: true,
                        tension: 0.3,
                        stack: 'combined'
                    },
                    {
                        label: t ? t('week_comparison.chart_effort_ojt') : 'OJT Hours',
                        data: ojtData,
                        borderColor: colors.accent,
                        backgroundColor: colors.accent + '44',
                        fill: true,
                        tension: 0.3,
                        stack: 'combined'
                    },
                    {
                        label: 'Target (40h)',
                        data: targetData,
                        borderColor: 'rgba(255,255,255,0.3)',
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        stacked: true,
                        beginAtZero: true, 
                        grid: { color: 'rgba(255,255,255,0.05)' }, 
                        ticks: { color: colors.text } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: colors.text } 
                    }
                },
                plugins: {
                    legend: { labels: { color: colors.text, usePointStyle: true } },
                    tooltip: { mode: 'index', intersect: false }
                }
            }
        });
    }

    let prevWeekHours: number | null = null;

    sortedWeeks.forEach(w => {
        const data = weekGroups[w];
        
        let growthLabel = "-";
        let growthClass = "";
        if (prevWeekHours !== null && prevWeekHours > 0) {
            const diff = ((data.hours - prevWeekHours) / prevWeekHours) * 100;
            growthLabel = (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%";
            growthClass = diff >= 0 ? "growth-positive" : "growth-negative";
        }

        const dateRange = getWeekDateRange(w);
        const rangeLabel = `${dateRange.start} - ${dateRange.end}`;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${t ? t("ui.week_label", { week: String(w) }) : `Week ${w}`}<br><small>${rangeLabel}</small></td>
            <td>${data.hours.toFixed(1)}h</td>
            <td>${data.personal.toFixed(1)}h</td>
            <td class="${growthClass}">${growthLabel}</td>
            <td>${((data.hours / (data.count * 8)) * 100).toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
        prevWeekHours = data.hours;
    });

    // Add summary
    const totalHours = logs.reduce((s,r) => s + r.hours, 0);
    const totalPersonal = logs.reduce((s,r) => s + r.personalHours, 0);
    const elGrandTotalHours = document.getElementById("grandTotalHours");
    const elGrandTotalPersonal = document.getElementById("grandTotalPersonal");
    if(elGrandTotalHours) elGrandTotalHours.innerText = totalHours.toFixed(1) + "h";
    if(elGrandTotalPersonal) elGrandTotalPersonal.innerText = totalPersonal.toFixed(1) + "h";
}

export {
    fetchWeekComparisonTelemetryData,
    getThemeColors,
    renderWeekComparison
};
