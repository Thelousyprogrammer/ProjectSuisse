/**
 * DTR Calendar Export Module
 * Builds a preview calendar and exports it as PNG/JPEG.
 */

function getThemeCssVar(name: string, fallback: string): string {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name || "").trim();
    return raw || fallback;
}

function padMonthDay(value: number): string {
    return String(value).padStart(2, "0");
}

function formatLocalizedMonthYear(year: number, monthIndex: number): string {
    if (!(window as any).DTRI18N) return `${monthIndex + 1}/${year}`;
    const monthKey = `calendar.month_${monthIndex + 1}`;
    const formatKey = "calendar.month_year_format";
    const monthName = (window as any).DTRI18N.t(monthKey);
    const formatStr = (window as any).DTRI18N.t(formatKey);
    return formatStr.replace("{month}", monthName).replace("{year}", String(year));
}

function parseYearMonth(input: string | null | undefined): { year: number, monthIndex: number } | null {
    const raw = String(input || "");
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

function formatYearMonthValue(dateLike: any): string {
    const key = (typeof (window as any).toGmt8DateKey === "function") ? (window as any).toGmt8DateKey(dateLike) : null;
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) return key.slice(0, 7);

    const raw = String(dateLike || "");
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    return "";
}

function getRecordCountByDate(): Record<string, number> {
    const map: Record<string, number> = {};
    const records: any[] = ((window as any).Store && typeof (window as any).Store.getRecords === "function")
        ? (window as any).Store.getRecords()
        : [];
    records.forEach((record) => {
        const key = (typeof (window as any).toGmt8DateKey === "function") ? (window as any).toGmt8DateKey(record && record.date) : (record && record.date);
        if (!key) return;
        map[key] = (map[key] || 0) + 1;
    });
    return map;
}

function getMonthInputDefault(): string | null {
    const monthSelect = document.getElementById("calendarMonthSelect") as HTMLSelectElement;
    if (!monthSelect) return null;
    if (monthSelect.value) return monthSelect.value;

    const records: any[] = ((window as any).Store && typeof (window as any).Store.getRecords === "function")
        ? (window as any).Store.getRecords()
        : [];
    const latestRecord = records.length ? records[records.length - 1] : null;
    const latestKey = latestRecord ? ((typeof (window as any).toGmt8DateKey === "function") ? (window as any).toGmt8DateKey(latestRecord.date) : latestRecord.date) : "";
    const timelineStart = (typeof (window as any).getCurrentOjtStartDate === "function") ? formatYearMonthValue((window as any).getCurrentOjtStartDate()) : "";
    const initial = latestKey && /^\d{4}-\d{2}-\d{2}$/.test(latestKey)
        ? latestKey.slice(0, 7)
        : (timelineStart || new Date().toISOString().slice(0, 7));
    monthSelect.value = initial;
    return initial;
}

function buildCalendarMonthOptions(): Array<{ value: string, label: string }> {
    const startKey = (typeof (window as any).getCurrentOjtStartDate === "function") ? (window as any).getCurrentOjtStartDate() : "";
    const endKey = (typeof (window as any).getCurrentSemesterEndDate === "function") ? (window as any).getCurrentSemesterEndDate() : "";
    const startParsed = (typeof (window as any).parseDateKeyGmt8 === "function") ? (window as any).parseDateKeyGmt8(startKey) : null;
    const endParsed = (typeof (window as any).parseDateKeyGmt8 === "function") ? (window as any).parseDateKeyGmt8(endKey) : null;
    if (!startParsed || !endParsed || startParsed > endParsed) return [];

    const cursor = new Date(Date.UTC(startParsed.getUTCFullYear(), startParsed.getUTCMonth(), 1));
    const last = new Date(Date.UTC(endParsed.getUTCFullYear(), endParsed.getUTCMonth(), 1));
    const options: Array<{ value: string, label: string }> = [];

    while (cursor <= last) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth();
        const value = `${y}-${padMonthDay(m + 1)}`;
        const label = formatLocalizedMonthYear(y, m);
        options.push({ value, label });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return options;
}

function syncCalendarMonthOptions(forceFallbackSelection = false): string | null {
    const monthSelect = document.getElementById("calendarMonthSelect") as HTMLSelectElement;
    if (!monthSelect) return null;

    const options = buildCalendarMonthOptions();
    const records: any[] = ((window as any).Store && typeof (window as any).Store.getRecords === "function")
        ? (window as any).Store.getRecords()
        : [];
    const latestRecord = records.length ? records[records.length - 1] : null;
    const latestMonth = latestRecord ? formatYearMonthValue(latestRecord.date) : "";
    const previousValue = monthSelect.value;
    const fallbackValue = latestMonth || formatYearMonthValue((window as any).getCurrentOjtStartDate?.()) || (options[0] && options[0].value) || "";

    monthSelect.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
    monthSelect.disabled = options.length === 0;

    const values = new Set(options.map((option) => option.value));
    const nextValue = (!forceFallbackSelection && values.has(previousValue))
        ? previousValue
        : (values.has(fallbackValue) ? fallbackValue : (options[0] ? options[0].value : ""));

    if (nextValue) monthSelect.value = nextValue;
    return nextValue || null;
}

function getPhilippineHolidayMap(year: number): Record<string, string> {
    const t = (key: string) => ((window as any).DTRI18N ? (window as any).DTRI18N.t(`holidays.${key}`) : key);
    const holidays: Record<string, string> = {};
    const fixed = [
        { mm: 1, dd: 1, key: "new_years_day" },
        { mm: 2, dd: 25, key: "edsa_day" },
        { mm: 4, dd: 9, key: "araw_ng_kagitingan" },
        { mm: 5, dd: 1, key: "labor_day" },
        { mm: 6, dd: 12, key: "independence_day" },
        { mm: 8, dd: 21, key: "ninoy_aquino_day" },
        { mm: 11, dd: 1, key: "all_saints_day" },
        { mm: 11, dd: 30, key: "bonifacio_day" },
        { mm: 12, dd: 8, key: "immaculate_conception" },
        { mm: 12, dd: 24, key: "christmas_eve" },
        { mm: 12, dd: 25, key: "christmas_day" },
        { mm: 12, dd: 30, key: "rizal_day" },
        { mm: 12, dd: 31, key: "new_years_eve" }
    ];

    fixed.forEach((entry) => {
        const key = `${year}-${padMonthDay(entry.mm)}-${padMonthDay(entry.dd)}`;
        holidays[key] = t(entry.key);
    });

    const easter = computeEasterSundayUtc(year);
    if (easter) {
        holidays[formatDateKeyUtc(addDaysUtc(easter, -3))] = t("maundy_thursday");
        holidays[formatDateKeyUtc(addDaysUtc(easter, -2))] = t("good_friday");
        holidays[formatDateKeyUtc(addDaysUtc(easter, -1))] = t("black_saturday");
    }

    const nationalHeroes = getLastWeekdayOfMonthUtc(year, 7, 1);
    holidays[formatDateKeyUtc(nationalHeroes)] = t("national_heroes_day");

    return holidays;
}

function computeEasterSundayUtc(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date: Date, days: number): Date {
    return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function formatDateKeyUtc(date: Date): string {
    return `${date.getUTCFullYear()}-${padMonthDay(date.getUTCMonth() + 1)}-${padMonthDay(date.getUTCDate())}`;
}

function getLastWeekdayOfMonthUtc(year: number, monthIndex: number, weekday: number): Date {
    const lastDate = new Date(Date.UTC(year, monthIndex + 1, 0));
    const shift = (lastDate.getUTCDay() - weekday + 7) % 7;
    return addDaysUtc(lastDate, -shift);
}

function buildCalendarMatrix(year: number, monthIndex: number): Array<{ day: number, dateKey: string } | null> {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const firstWeekday = first.getUTCDay();
    const leading = firstWeekday === 0 ? 0 : firstWeekday;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const cells: Array<{ day: number, dateKey: string } | null> = [];

    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
        const key = `${year}-${padMonthDay(monthIndex + 1)}-${padMonthDay(day)}`;
        cells.push({ day, dateKey: key });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

function renderCalendarExportPreview(): void {
    const monthSelect = document.getElementById("calendarMonthSelect") as HTMLSelectElement;
    const titleInput = document.getElementById("calendarTitleInput") as HTMLInputElement;
    const showCounts = document.getElementById("calendarShowCounts") as HTMLInputElement;
    const showLegend = document.getElementById("calendarShowLegend") as HTMLInputElement;
    const preview = document.getElementById("calendarExportPreview");
    if (!monthSelect || !preview) return;

    const rawMonth = monthSelect.value || syncCalendarMonthOptions() || getMonthInputDefault();
    const parsed = parseYearMonth(rawMonth);
    if (!parsed) {
        const msg = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.no_timeline_dates") : "Please choose timeline dates first so calendar months can be generated.";
        preview.innerHTML = `<p>${msg}</p>`;
        return;
    }

    const { year, monthIndex } = parsed;
    const holidayMap = getPhilippineHolidayMap(year);
    const recordsByDate = getRecordCountByDate();
    const matrix = buildCalendarMatrix(year, monthIndex);
    const monthTitle = formatLocalizedMonthYear(year, monthIndex);
    const defaultTitle = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.calendar_title_default") : "DTR Attendance Calendar";
    const customTitle = (titleInput && titleInput.value.trim()) || defaultTitle;

    const sun = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.sun") : "Sun";
    const mon = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.mon") : "Mon";
    const tue = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.tue") : "Tue";
    const wed = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.wed") : "Wed";
    const thu = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.thu") : "Thu";
    const fri = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.fri") : "Fri";
    const sat = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.sat") : "Sat";
    const headLabels = [sun, mon, tue, wed, thu, fri, sat];

    const headHtml = headLabels.map((label) => `<div>${label}</div>`).join("");
    const dayHtml = matrix.map((cell) => {
        if (!cell) return '<div class="calendar-day-cell calendar-day-empty"></div>';

        const count = recordsByDate[cell.dateKey] || 0;
        const holidayName = holidayMap[cell.dateKey] || "";
        const isPresent = count > 0;
        const isHoliday = Boolean(holidayName);
        let className = "calendar-day-cell";
        
        let statusText = "";
        if (isPresent && isHoliday) {
            className += " calendar-day-present-holiday";
            statusText = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.present_holiday") : "Present (Holiday)";
        } else if (isHoliday) {
            className += " calendar-day-holiday";
            statusText = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.holiday") : "Holiday";
        } else if (isPresent) {
            className += " calendar-day-present";
            statusText = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.present") : "Present";
        } else {
            className += " calendar-day-absent";
            statusText = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.absent") : "Absent";
        }

        const recordsLabel = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.records_count", { count: String(count) }) : `Records: ${count}`;

        return `
            <div class="${className}">
                <div class="day-number">${cell.day}</div>
                <div class="day-status">${statusText}</div>
                ${showCounts && showCounts.checked ? `<div class="day-record-count">${recordsLabel}</div>` : ""}
                ${holidayName ? `<div class="day-holiday-name">${holidayName}</div>` : ""}
            </div>
        `;
    }).join("");

    const legendPresent = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.present") : "Present";
    const legendAbsent = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.absent") : "Absent";
    const legendHoliday = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.holiday") : "Holiday";
    const legendPresentHoliday = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.present_holiday") : "Present + Holiday";

    const legendHtml = (showLegend && showLegend.checked)
        ? `
            <div class="calendar-export-legend">
                <span class="calendar-legend-item"><span class="calendar-legend-swatch calendar-swatch-present"></span>${legendPresent}</span>
                <span class="calendar-legend-item"><span class="calendar-legend-swatch calendar-swatch-absent"></span>${legendAbsent}</span>
                <span class="calendar-legend-item"><span class="calendar-legend-swatch calendar-swatch-holiday"></span>${legendHoliday}</span>
                <span class="calendar-legend-item"><span class="calendar-legend-swatch calendar-swatch-present-holiday"></span>${legendPresentHoliday}</span>
            </div>
        `
        : "";

    const totalDays = matrix.filter(Boolean).length;
    const presentDays = matrix.filter((cell) => cell && (recordsByDate[cell.dateKey] || 0) > 0).length;
    const absentDays = totalDays - presentDays;
    const holidayDays = matrix.filter((cell) => cell && holidayMap[cell.dateKey]).length;

    const labelPresent = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.summary_present") : "Present";
    const labelAbsent = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.summary_absent") : "Absent";
    const labelHolidays = (window as any).DTRI18N ? (window as any).DTRI18N.t("calendar.summary_holidays") : "Holidays";

    preview.innerHTML = `
        <h3 class="calendar-export-title"></h3>
        <p class="calendar-export-subtitle">${monthTitle} | ${labelPresent}: ${presentDays} | ${labelAbsent}: ${absentDays} | ${labelHolidays}: ${holidayDays}</p>
        <div class="calendar-grid-head">${headHtml}</div>
        <div class="calendar-grid-body">${dayHtml}</div>
        ${legendHtml}
    `;

    const titleEl = preview.querySelector(".calendar-export-title") as HTMLElement | null;
    if (titleEl) {
        titleEl.textContent = customTitle;
    }
}

function copyComputedCalendarStylesForExport(sourceRoot: HTMLElement, targetRoot: HTMLElement): void {
    if (!sourceRoot || !targetRoot || !window.getComputedStyle) return;
    const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))] as HTMLElement[];
    const targetNodes = [targetRoot, ...Array.from(targetRoot.querySelectorAll("*"))] as HTMLElement[];
    const count = Math.min(sourceNodes.length, targetNodes.length);

    for (let i = 0; i < count; i += 1) {
        const sourceNode = sourceNodes[i];
        const targetNode = targetNodes[i];
        const computed = window.getComputedStyle(sourceNode);

        const sanitize = (val: string) => {
            if (!val) return val;
            if (val.includes("color(")) return "transparent"; 
            return val;
        };

        targetNode.removeAttribute("class");
        targetNode.removeAttribute("id");
        targetNode.style.cssText = [
            `display:${computed.display}`,
            `position:${computed.position}`,
            `box-sizing:${computed.boxSizing}`,
            `width:${computed.width}`,
            `min-width:${computed.minWidth}`,
            `max-width:${computed.maxWidth}`,
            `height:${computed.height}`,
            `min-height:${computed.minHeight}`,
            `max-height:${computed.maxHeight}`,
            `margin:${computed.margin}`,
            `padding:${computed.padding}`,
            `border:${computed.borderTopWidth} ${computed.borderTopStyle} ${sanitize(computed.borderTopColor)}`,
            `border-right:${computed.borderRightWidth} ${computed.borderRightStyle} ${sanitize(computed.borderRightColor)}`,
            `border-bottom:${computed.borderBottomWidth} ${computed.borderBottomStyle} ${sanitize(computed.borderBottomColor)}`,
            `border-left:${computed.borderLeftWidth} ${computed.borderLeftStyle} ${sanitize(computed.borderLeftColor)}`,
            `border-radius:${computed.borderRadius}`,
            `background:${sanitize(computed.backgroundColor)}`,
            "background-image:none",
            `color:${sanitize(computed.color)}`,
            `font:${computed.font}`,
            `font-size:${computed.fontSize}`,
            `font-weight:${computed.fontWeight}`,
            `font-family:${computed.fontFamily}`,
            `line-height:${computed.lineHeight}`,
            `letter-spacing:${computed.letterSpacing}`,
            `text-align:${computed.textAlign}`,
            `text-transform:${computed.textTransform}`,
            `white-space:${computed.whiteSpace}`,
            `gap:${computed.gap}`,
            `grid-template-columns:${computed.gridTemplateColumns}`,
            `flex-direction:${computed.flexDirection}`,
            `justify-content:${computed.justifyContent}`,
            `align-items:${computed.alignItems}`,
            `opacity:${computed.opacity}`,
            `box-shadow:${computed.boxShadow}`,
            `overflow:${computed.overflow}`,
            `overflow-x:${computed.overflowX}`,
            `overflow-y:${computed.overflowY}`
        ].join(";");
    }
}

function buildStandaloneCalendarExportNode(sourceRoot: HTMLElement): HTMLElement | null {
    if (!sourceRoot) return null;
    const temp = sourceRoot.cloneNode(true) as HTMLElement;
    temp.style.position = "fixed";
    temp.style.left = "-10000px";
    temp.style.top = "0";
    temp.style.zIndex = "-1";
    temp.style.transform = "none";
    temp.style.isolation = "isolate";
    copyComputedCalendarStylesForExport(sourceRoot, temp);
    return temp;
}

async function exportCalendarImage(): Promise<void> {
    const preview = document.getElementById("calendarExportPreview");
    const formatSelect = document.getElementById("calendarFormatSelect") as HTMLSelectElement;
    const scaleSelect = document.getElementById("calendarScaleSelect") as HTMLSelectElement;
    const monthSelect = document.getElementById("calendarMonthSelect") as HTMLSelectElement;
    if (!preview || !formatSelect || !scaleSelect || !monthSelect) return;
    if (!(window as any).html2canvas) {
        alert("html2canvas is not available. Please reload the page.");
        return;
    }

    renderCalendarExportPreview();
    const format = (formatSelect.value || "png").toLowerCase() === "jpeg" ? "jpeg" : "png";
    const scale = Math.max(1, Math.min(4, parseInt(scaleSelect.value, 10) || 2));
    const rawBgColor = getThemeCssVar("--panel", "#111111");
    const bgColor = rawBgColor.includes("color(") ? "#111111" : rawBgColor;
    const exportNode = buildStandaloneCalendarExportNode(preview);
    if (!exportNode) return;
    document.body.appendChild(exportNode);

    let canvas;
    try {
        canvas = await (window as any).html2canvas(exportNode, {
            backgroundColor: bgColor,
            scale
        });
    } finally {
        exportNode.remove();
    }
    const quality = format === "jpeg" ? 0.92 : 1;
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const dataUrl = canvas.toDataURL(mime, quality);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `DTR_Calendar_${monthSelect.value || "month"}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function initCalendarExportUI(): void {
    const monthSelect = document.getElementById("calendarMonthSelect");
    const titleInput = document.getElementById("calendarTitleInput");
    const showCounts = document.getElementById("calendarShowCounts");
    const showLegend = document.getElementById("calendarShowLegend");
    if (!monthSelect) return;

    syncCalendarMonthOptions(true);
    const rerender = () => renderCalendarExportPreview();
    [monthSelect, titleInput, showCounts, showLegend].forEach((element) => {
        if (!element) return;
        element.addEventListener("input", rerender);
        element.addEventListener("change", rerender);
    });
    document.addEventListener("theme:changed", rerender);
    document.addEventListener("dtr:languageChanged", () => {
        syncCalendarMonthOptions(false);
        renderCalendarExportPreview();
    });
    document.addEventListener("dtr:timelineChanged", () => {
        syncCalendarMonthOptions(true);
        renderCalendarExportPreview();
    });
    rerender();

    let signature = JSON.stringify(getRecordCountByDate());
    setInterval(() => {
        const next = JSON.stringify(getRecordCountByDate());
        if (next !== signature) {
            signature = next;
            syncCalendarMonthOptions();
            renderCalendarExportPreview();
        }
    }, 1500);
}

export {
    renderCalendarExportPreview,
    exportCalendarImage,
    initCalendarExportUI
};
