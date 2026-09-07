/**
 * DTR GRAPHS MODULE
 * Handles the rendering of GitHub-style contribution graphs (UTC default)
 */

import {
    toUtcDateKey,
    parseDateKeyUtc,
    nowUtcStartOfDay,
    addDaysUtc,
    getUtcWeekday,
    formatUtcDateLabel,
    getWeekNumber,
    getWeekDateRange
} from './utils/date-utils';

function renderDailyGraph(records: any[] = (window as any).Store?.getRecords() || []): void {
    const container = document.getElementById("githubGraph");
    const labelsContainer = document.getElementById("monthLabels");
    const t = ((window as any).DTRI18N && typeof (window as any).DTRI18N.t === "function") ? (window as any).DTRI18N.t : null;
    if (!container) return;

    container.innerHTML = "";
    if (labelsContainer) labelsContainer.innerHTML = "";

    if (!records || records.length === 0) {
        const emptyText = t ? t("no_records_to_visualize") : "No records to visualize.";
        container.innerHTML = `<p class='empty-msg'>${emptyText}</p>`;
        return;
    }

    // Calculate Dynamic Range based strictly on provided records
    const parseFn = typeof parseDateKeyUtc === "function" ? parseDateKeyUtc : (window as any).parseDateKeyUtc;
    const toKeyFn = typeof toUtcDateKey === "function" ? toUtcDateKey : (window as any).toUtcDateKey;
    const nowFn = typeof nowUtcStartOfDay === "function" ? nowUtcStartOfDay : (window as any).nowUtcStartOfDay;
    const addDaysFn = typeof addDaysUtc === "function" ? addDaysUtc : (window as any).addDaysUtc;
    const getWeekdayFn = typeof getUtcWeekday === "function" ? getUtcWeekday : (window as any).getUtcWeekday;
    const formatLabelFn = typeof formatUtcDateLabel === "function" ? formatUtcDateLabel : (window as any).formatUtcDateLabel;

    const dates = records
        .map(r => parseFn(toKeyFn(r.date)))
        .filter(Boolean) as Date[];
    if (!dates.length) {
        const emptyText = t ? t("no_valid_dated_records") : "No valid dated records to visualize.";
        container.innerHTML = `<p class='empty-msg'>${emptyText}</p>`;
        return;
    }
    const today = nowFn ? nowFn() : new Date();
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime()), today.getTime()));
    
    // Align Start to Sunday
    const start = new Date(minDate);
    start.setTime(addDaysFn(start, -getWeekdayFn(start)).getTime());

    // Align End to Saturday of the max week
    const end = new Date(maxDate);
    end.setTime(addDaysFn(end, 6 - getWeekdayFn(end)).getTime());

    const logMap: { [key: string]: any } = {};
    records.forEach(r => {
        const k = toKeyFn(r.date);
        logMap[k] = r;
    });

    const usedMonthKeys = new Set<string>();
    let lastCol = -10; 
    let lastMonthSpan: HTMLSpanElement | null = null;
    let daysIdx = 0;

    for (let d = new Date(start); d <= end; d = addDaysFn(d, 1)) {
        const colIndex = Math.floor(daysIdx / 7) + 1;
        const dateStr = toKeyFn(d);
        const record = logMap[dateStr];
        const recordHours = record ? record.hours : 0;
        
        const cell = document.createElement("div");
        cell.className = "day-cell";
        if (record) cell.style.cursor = "pointer";
        
        let level = 0;
        if (recordHours >= 9) level = 3;
        else if (recordHours >= 5) level = 2;
        else if (recordHours > 3) level = 1;

        cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
        
        // TOOLTIP
        const formattedDate = formatLabelFn(d, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric"
        });
        cell.title = `${formattedDate}: ${recordHours}h ${record ? '(Click to view)' : ''}`;

        // CLICKABLE INFO
        cell.onclick = () => {
            if (record) {
                if (typeof (window as any).showSummary === "function") {
                    (window as any).showSummary(record);
                }
                const summaryEl = document.getElementById("summary");
                if (summaryEl) {
                    summaryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        };

        container.appendChild(cell);

        // Display all months across multi-year spans; override on overlap collision
        const yearMonthKey = dateStr.slice(0, 7);
        const isFirstDayOfMonth = dateStr.slice(8, 10) === "01" || !usedMonthKeys.has(yearMonthKey);

        if (!usedMonthKeys.has(yearMonthKey) && isFirstDayOfMonth) {
            usedMonthKeys.add(yearMonthKey);
            const monthName = formatLabelFn(d, { month: "short" });

            if (labelsContainer) {
                // If overlap occurs with previous label (within 2 columns), override the previous month label
                if (colIndex - lastCol <= 2 && lastMonthSpan) {
                    try {
                        labelsContainer.removeChild(lastMonthSpan);
                    } catch (_) {}
                }

                const monthSpan = document.createElement("span");
                monthSpan.innerText = monthName;
                monthSpan.style.gridColumnStart = String(colIndex);
                labelsContainer.appendChild(monthSpan);

                lastMonthSpan = monthSpan;
                lastCol = colIndex;
            }
        }
        daysIdx++;
    }
}

function renderWeeklyGraph(records: any[] = (window as any).Store?.getRecords() || []): void {
    const container = document.getElementById("weeklyGraph");
    if (!container) return;
    container.innerHTML = "";

    const parseFn = typeof parseDateKeyUtc === "function" ? parseDateKeyUtc : (window as any).parseDateKeyUtc;
    const toKeyFn = typeof toUtcDateKey === "function" ? toUtcDateKey : (window as any).toUtcDateKey;
    const addDaysFn = typeof addDaysUtc === "function" ? addDaysUtc : (window as any).addDaysUtc;
    const formatLabelFn = typeof formatUtcDateLabel === "function" ? formatUtcDateLabel : (window as any).formatUtcDateLabel;
    const getWeekNumFn = typeof getWeekNumber === "function" ? getWeekNumber : (window as any).getWeekNumber;
    const getWeekRangeFn = typeof getWeekDateRange === "function" ? getWeekDateRange : (window as any).getWeekDateRange;

    // 1. Map all hours to their absolute Week Number (Day 1 of OJT = Week 1)
    const weeksMap: { [key: number]: number } = {};
    records.forEach(r => {
        const d = parseFn(toKeyFn(r.date));
        if (!d) return;
        const week = getWeekNumFn(d);
        weeksMap[week] = (weeksMap[week] || 0) + r.hours;
    });

    const weekKeys = Object.keys(weeksMap).map(Number);
    if (!weekKeys.length) return;

    const maxWeek = Math.max(...weekKeys, 1);

    // 2. Group weeks by the calendar month of their starting date
    const monthGroups: { [key: string]: number[] } = {};
    const monthKeysOrder: string[] = [];

    for (let w = 1; w <= maxWeek; w++) {
        const range = getWeekRangeFn(w);
        const startDate = range.start || range.startDate;
        if (!startDate) continue;
        const d = addDaysFn(startDate, 3);
        const monthKey = formatLabelFn(d, { month: "short", year: "numeric" });
        
        if (!monthGroups[monthKey]) {
            monthGroups[monthKey] = [];
            monthKeysOrder.push(monthKey);
        }
        monthGroups[monthKey].push(w);
    }

    // 3. Render each calendar month block
    for (const monthKey of monthKeysOrder) {
        const weeksInMonth = monthGroups[monthKey];
        
        // Skip blocks with absolutely no data recorded in any of the weeks for this month
        let hasAnyData = false;
        for (const w of weeksInMonth) {
            if (weeksMap[w] !== undefined) {
                hasAnyData = true;
                break;
            }
        }
        if (!hasAnyData) continue;

        const monthBlock = document.createElement("div");
        monthBlock.className = "month-block";

        const nameLabel = document.createElement("div");
        nameLabel.className = "month-name";
        nameLabel.innerText = monthKey;
        monthBlock.appendChild(nameLabel);

        const cellsWrapper = document.createElement("div");
        cellsWrapper.className = "week-cells";

        for (const currentWeek of weeksInMonth) {
            const hours = weeksMap[currentWeek] || 0;

            const cell = document.createElement("div");
            cell.className = "day-cell";
            
            let level = 0;
            if (hours >= 40) level = 3;
            else if (hours >= 20) level = 2;
            else if (hours > 0) level = 1;
            
            cell.classList.add(`cell-${['empty', 'low', 'mid', 'high'][level]}`);
            cell.title = `Week ${currentWeek}: ${hours}h`;
            cellsWrapper.appendChild(cell);
        }

        monthBlock.appendChild(cellsWrapper);
        container.appendChild(monthBlock);
    }
}

export {
    renderDailyGraph,
    renderWeeklyGraph
};

if (typeof window !== "undefined") {
    (window as any).renderDailyGraph = renderDailyGraph;
    (window as any).renderWeeklyGraph = renderWeeklyGraph;
}

