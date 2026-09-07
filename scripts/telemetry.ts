/**
 * TELEMETRY MAIN CONTROLLER
 */

import {
    calculateForecastUnified,
    formatGmt8DateLabel,
    toGmt8DateKey,
    parseDateKeyGmt8,
    addDaysGmt8,
    isWorkdayGmt8,
    hydrateOjtSettingsFromStorage,
    getCurrentRequiredOjtHours,
    getCurrentSemesterEndDate,
    buildTrajectorySeries,
    getWeekNumber
} from './core/dtr-engine';
import { getRecordsFromStore } from './dtr-image-store';
import { DTRI18N } from './dtr-i18n';
import { ThemeSync } from './theme-sync';
import { PageLoader } from './components/page-loader';
import { showToast } from './utils/toast';
import './diagnostic';
import {
    renderTrajectoryChart,
    renderEnergyZoneChart,
    renderIdentityChart,
    renderCandlestickChart,
    renderContextualCharts,
    renderRadarChart,
    renderProductivityMatrix,
    renderWeeklyEffortChart
} from './charts/telemetry-charts';

try {
    (window as any).COLORS = getThemeValues();
} catch (_) {}

document.addEventListener("DOMContentLoaded", async () => {
    PageLoader.show('loader.syncing_telemetry');
    hydrateOjtSettingsFromStorage();

    await initThemeSwitcher();
    (window as any).COLORS = getThemeValues();
    syncTelemetryF1LightToggleLabel();

    try {
        await DTRI18N.bootstrap();

        (window as any).allLogs = await fetchTelemetryData();
        
        (window as any).deltaChartScrollEnabled = localStorage.getItem("telemetry-delta-scroll") === "true";
        const scrollToggle = document.getElementById("deltaChartScrollToggle") as HTMLInputElement;
        if (scrollToggle) scrollToggle.checked = (window as any).deltaChartScrollEnabled;

        populateWeekSelector((window as any).allLogs);
        renderTelemetry((window as any).allLogs);
        initPaceSliderLock();
        initTelemetryEntranceAnimations();
    } catch (err) {
        console.error("Telemetry Sync Failed:", err);
    } finally {
        PageLoader.hide();
    }
});

// --- CORE UTILITIES ---

function getThemeValues(): any {
    const style = getComputedStyle(document.documentElement);
    return {
        accent: style.getPropertyValue('--accent').trim() || '#ff1e00',
        excellent: style.getPropertyValue('--level-3').trim() || '#FF00FF',
        good: style.getPropertyValue('--level-2').trim() || '#00FF00',
        warning: style.getPropertyValue('--level-1').trim() || '#FFF000',
        aux: style.getPropertyValue('--chart-aux').trim() || null,
        text: style.getPropertyValue('--text').trim() || '#ffffff',
        grid: style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)',
        fill: style.getPropertyValue('--chart-fill').trim() || 'rgba(255,255,255,0.02)',
        fontBody: style.getPropertyValue('--font-body').trim() || 'monospace',
        fontHeading: style.getPropertyValue('--font-heading').trim() || 'sans-serif'
    };
}

async function initThemeSwitcher(): Promise<void> {
    const localTheme = ThemeSync.getLocalTheme() || (localStorage.getItem("user-theme") || "f1");
    setTelemetryTheme(localTheme, { broadcast: false, rerender: false });
}

function setTelemetryTheme(themeName: string, options: any = {}): void {
    const opts = { rerender: true, ...options };
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme && currentTheme !== themeName) {
        PageLoader.init(themeName, 5000);
    }

    const done = (appliedTheme: string) => {
        try { if (typeof (window as any).updateFavicon === "function") (window as any).updateFavicon(appliedTheme); } catch (_) {}
        syncTelemetryThemeDropdownSelection(appliedTheme);
        if (!opts.rerender) return;
        setTimeout(() => {
            (window as any).COLORS = getThemeValues();
            renderTelemetry(Array.isArray((window as any).allLogs) ? (window as any).allLogs : []);
        }, 50);
    };

    ThemeSync.setTheme(themeName, options)
        .then((appliedTheme: string) => {
            done(appliedTheme);
        })
        .catch(() => {
            document.documentElement.setAttribute("data-theme", themeName);
            localStorage.setItem("user-theme", themeName);
            done(themeName);
        });
}

(window as any).chartViews = {
    trajectory: 'line',
    effort: 'bar',
    momentum: 'candlestick',
    identity: 'radar'
};

function switchChartView(chartKey: string, viewType: string): void {
    if (!(window as any).chartViews) return;
    (window as any).chartViews[chartKey] = viewType;

    const card = document.querySelector(`.chart-controls button[data-chart="${chartKey}"]`)?.closest('.card');
    if (card) {
        card.querySelectorAll('.chart-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === viewType);
        });
    }

    renderTelemetry((window as any).allLogs);
}

function syncTelemetryThemeDropdownSelection(appliedTheme: string): void {
    const select = document.getElementById("telemetryThemeSelect") as HTMLSelectElement;
    if (!select) return;
    const baseTheme = String(appliedTheme || "f1").replace("-light", "");
    select.value = baseTheme;
}

function syncTelemetryF1LightToggleLabel(): void {
    const btn = document.getElementById("telemetryF1LightToggleBtn") as HTMLButtonElement;
    if (!btn) return;
    const activeTheme = ((window as any).ThemeSync && typeof (window as any).ThemeSync.getLocalTheme === "function")
        ? (window as any).ThemeSync.getLocalTheme()
        : (localStorage.getItem("user-theme") || "f1");
    const isF1Family = activeTheme === "f1" || activeTheme === "f1-light";
    const isLight = activeTheme === "f1-light";
    if (isF1Family) {
        btn.disabled = false;
        const iconSpan = btn.querySelector(".material-symbols-outlined");
        if (iconSpan) {
            iconSpan.textContent = isLight ? "dark_mode" : "light_mode";
            iconSpan.classList.add("notranslate");
            iconSpan.setAttribute("translate", "no");
        }
    } else {
        const iconSpan = btn.querySelector(".material-symbols-outlined");
        if (iconSpan) {
            iconSpan.textContent = "light_mode";
            iconSpan.classList.add("notranslate");
            iconSpan.setAttribute("translate", "no");
        }
        btn.setAttribute("aria-pressed", "false");
        btn.disabled = true;
    }
    btn.setAttribute("aria-pressed", isLight ? "true" : "false");
}

function toggleTelemetryF1LightMode(): void {
    const activeTheme = ((window as any).ThemeSync && typeof (window as any).ThemeSync.getLocalTheme === "function")
        ? (window as any).ThemeSync.getLocalTheme()
        : (localStorage.getItem("user-theme") || "f1");
    if (activeTheme !== "f1" && activeTheme !== "f1-light") return;
    const nextTheme = activeTheme === "f1-light" ? "f1" : "f1-light";
    setTelemetryTheme(nextTheme);
}

document.addEventListener("theme:changed", () => {
    setTimeout(() => {
        (window as any).COLORS = getThemeValues();
        renderTelemetry(Array.isArray((window as any).allLogs) ? (window as any).allLogs : []);
        syncTelemetryF1LightToggleLabel();
    }, 50);
});

document.addEventListener("dtr:languageChanged", () => {
    populateWeekSelector((window as any).allLogs);
    renderTelemetry(Array.isArray((window as any).allLogs) ? (window as any).allLogs : []);
});

let telemetryOnScreenObserver: IntersectionObserver | null = null;

function withSequentialLineDelays(animations: any): any {
    const source = animations && typeof animations === "object" ? animations : {};
    const addDelay = (cfg: any) => ({
        ...(cfg || {}),
        delay(ctx: any) {
            if (!ctx || ctx.type !== "data") return 0;
            const dsType = (ctx.dataset && ctx.dataset.type) || (ctx.chart && ctx.chart.config && ctx.chart.config.type) || "";
            const type = String(dsType).toLowerCase();
            if (type !== "line" && type !== "radar") return 0;
            const ds = Number.isFinite(ctx.datasetIndex) ? ctx.datasetIndex : 0;
            const pt = Number.isFinite(ctx.dataIndex) ? ctx.dataIndex : 0;
            return ds * 240 + pt * 16;
        }
    });

    return {
        ...source,
        x: addDelay(source.x),
        y: addDelay(source.y)
    };
}

function replayChartAnimationForCanvas(canvas: HTMLCanvasElement): void {
    if (!canvas || typeof (window as any).charts === 'undefined' || !(window as any).charts) return;
    const chartId = canvas.id;
    let instance: any = null;
    const charts = (window as any).charts;
    for (const k in charts) {
        if (charts[k] && charts[k].canvas === canvas) {
            instance = charts[k];
            break;
        }
    }
    if (!instance || typeof instance.reset !== "function" || typeof instance.update !== "function") return;

    const profileByChartId: Record<string, any> = {
        trajectoryChart: {
            animation: { duration: 1350, easing: "easeOutExpo" },
            animations: {
                x: { duration: 900, easing: "easeOutCubic", from: 0 },
                y: { duration: 1350, easing: "easeOutExpo", from: 0 }
            }
        },
        deltaChart: {
            animation: { duration: 1000, easing: "easeOutCubic" },
            animations: {
                x: {
                    duration: 650,
                    easing: "easeOutSine",
                    from: 0
                },
                y: {
                    duration: 1000,
                    easing: "easeOutCubic",
                    from: 0
                }
            }
        },
        hourDistChart: {
            animation: { duration: 1100, easing: "easeOutBack" },
            animations: {
                rotate: {
                    duration: 1100,
                    easing: "easeOutBack",
                    from: -1.5
                },
                scale: {
                    duration: 800,
                    easing: "easeOutCubic",
                    from: 0.65
                }
            }
        },
        dayVelocityRadar: {
            animation: { duration: 980, easing: "easeOutQuart" },
            animations: {
                x: {
                    duration: 700,
                    easing: "easeOutQuad",
                    from: 0
                },
                y: {
                    duration: 980,
                    easing: "easeOutQuart",
                    from: 0
                }
            }
        },
        candlestickChart: {
            animation: { duration: 980, easing: "easeOutQuart" },
            animations: {
                x: {
                    duration: 600,
                    easing: "easeOutSine",
                    from: 0
                },
                y: {
                    duration: 980,
                    easing: "easeOutQuart",
                    from: 0
                }
            }
        },
        identityChart: {
            animation: { duration: 1150, easing: "easeOutQuart" },
            animations: {
                x: {
                    duration: 800,
                    easing: "easeOutCubic",
                    from: 0
                },
                y: {
                    duration: 1150,
                    easing: "easeOutExpo",
                    from: 0
                }
            }
        },
        energyZoneChart: {
            animation: { duration: 1250, easing: "easeOutBack" },
            animations: {
                x: {
                    duration: 700,
                    easing: "easeOutCubic",
                    from: 0
                },
                y: {
                    duration: 1250,
                    easing: "easeOutBack",
                    from: 0
                }
            }
        }
    };

    const profile = profileByChartId[chartId];
    if (profile && instance.options) {
        if (profile.animation) instance.options.animation = profile.animation;
        if (profile.animations) instance.options.animations = profile.animations;
    }
    if (instance.options) {
        instance.options.animations = withSequentialLineDelays(instance.options.animations);
    }

    try {
        instance.reset();
        instance.update();
    } catch (_) {}
}

function initTelemetryEntranceAnimations(): void {
    const cards = Array.from(document.querySelectorAll(".telemetry-page .stat-card, .telemetry-page .chart-card")) as HTMLElement[];
    if (!cards.length) return;

    if (telemetryOnScreenObserver) {
        try { telemetryOnScreenObserver.disconnect(); } catch (_) {}
    }

    telemetryOnScreenObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            const card = entry.target as HTMLElement;
            const canvas = card.querySelector("canvas");

            if (entry.isIntersecting) {
                card.classList.add("telemetry-anim-in");
                if (canvas) replayChartAnimationForCanvas(canvas);
                observer.unobserve(card);
                return;
            }
        });
    }, { threshold: 0.22, rootMargin: "0px 0px -8% 0px" });

    cards.forEach((card, idx) => {
        card.classList.add("telemetry-anim-ready");
        card.classList.remove("telemetry-anim-in");
        card.style.setProperty("--telemetry-stagger", `${Math.min(idx * 40, 480)}ms`);
        telemetryOnScreenObserver?.observe(card);
    });
}

// --- UI UTILITIES ---

const safeUpdate = (id: string, value: string | null, color: string | null = null): void => {
    const el = document.getElementById(id);
    if (!el) return;
    if (value !== null) el.innerText = value;
    if (color !== null) el.style.color = color;
};

function fetchTelemetryData(): Promise<any[]> {
    return new Promise(async (resolve) => {
        let logs: any[] = [];

        try {
            const stored = await getRecordsFromStore();
            if (Array.isArray(stored)) logs = stored;
        } catch (_) {}

        if (!logs.length) {
            try {
                const raw = localStorage.getItem("dtr");
                logs = JSON.parse(raw || "[]") || [];
            } catch (_) {
                logs = [];
            }
        }

        const cleaned = logs.map(l => {
            const entry = {
                ...l,
                hours: parseFloat(l.hours) || 0,
                personalHours: parseFloat(l.personalHours) || 0,
                identityScore: parseInt(l.identityScore) || 0
            };
            if (entry.imageIds && entry.imageIds.length > 0) {
                entry.images = [];
            }
            return entry;
        });

        // Hard cutoff: stop recording data and telemetry past the user's semester end date
        const semesterEndDate = typeof getCurrentSemesterEndDate === "function" ? getCurrentSemesterEndDate() : null;
        const boundedLogs = semesterEndDate
            ? cleaned.filter((l: any) => {
                const dk = toGmt8DateKey(l.date);
                return !dk || dk <= semesterEndDate;
            })
            : cleaned;
        
        resolve(boundedLogs);
    });
}

function populateWeekSelector(logs: any[]): void {
    const select = document.getElementById("weekSelect") as HTMLSelectElement;
    if (!select) return;
    
    const currentVal = select.value;
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
    const allWeeksLabel = t ? t("navigation.all_weeks") : "Full OJT Period";
    
    select.innerHTML = `<option value="all" data-i18n="navigation.all_weeks">${allWeeksLabel}</option>`;
    if (!logs || logs.length === 0) return;

    const weeks = [...new Set(logs.map((r: any) => getWeekNumber(r.date)))].sort((a: any, b: any) => b - a);
    
    weeks.forEach(w => {
        const opt = document.createElement("option");
        opt.value = String(w);
        opt.setAttribute("data-i18n", "ui.week_label");
        opt.innerText = (t && t("ui.week_label", { week: String(w) })) || `Week ${w}`;
        select.appendChild(opt);
    });
    
    if (currentVal) select.value = currentVal;
}

async function updateView(): Promise<void> {
    const select = document.getElementById("weekSelect") as HTMLSelectElement;
    if (!select) return;
    const val = select.value;

    PageLoader.show('loader.syncing_telemetry');

    try {
        const allLogs = await fetchTelemetryData();
        (window as any).allLogs = allLogs;
        
        let filtered = allLogs;
        if (val !== "all") {
            filtered = allLogs.filter((r: any) => String(getWeekNumber(r.date)) === val);
        }

        renderTelemetry(filtered, val);

    } catch (err) {
        console.error("AJAX Update Failed:", err);
    } finally {
        PageLoader.hide();
    }
}

function updateTargetPace(val: string | number): void {
    const pace = typeof val === 'string' ? parseFloat(val) : val;
    const display = document.getElementById("paceSliderVal");
    if (display) display.innerText = pace.toFixed(1);
    
    const allLogs = (window as any).allLogs || [];
    const charts = (window as any).charts;

    if (charts && charts.trajectory) {
        const series = buildTrajectorySeries({ logs: allLogs, paceOverride: pace });
        charts.trajectory.data.labels = series.labels;
        charts.trajectory.data.datasets[0].data = series.actualCumulative;
        charts.trajectory.data.datasets[1].data = series.projectedCumulative;
        charts.trajectory.data.datasets[2].data = series.idealCumulative;

        const projected = series.projectedCumulative.filter((v: any) => v != null);
        const actual = series.actualCumulative.filter((v: any) => v != null);
        const targetHours = series && series.forecast && Number.isFinite(series.forecast.targetHours)
            ? series.forecast.targetHours
            : getCurrentRequiredOjtHours();
        const yMaxSource = Math.max(
            targetHours,
            actual.length ? Math.max(...actual) : 0,
            projected.length ? Math.max(...projected) : 0
        );
        if (charts.trajectory.options && charts.trajectory.options.scales && charts.trajectory.options.scales.y) {
            charts.trajectory.options.scales.y.max = Math.ceil(yMaxSource / 50) * 50 + 50;
        }
        charts.trajectory.update("none");
    } else {
        renderTrajectoryChart(allLogs, pace);
    }

    const f = calculateForecastUnified({ logs: allLogs, paceOverride: pace });
    const projectedLabelLong = formatGmt8DateLabel(f.projectedDate, { month: "long", day: "numeric", year: "numeric" });
    const projectedPrefix = tr('status_predicted_prefix', "Projected: ");
    safeUpdate("completionDateText", `${projectedPrefix}${projectedLabelLong}`);

    const paceSufficient = f.remainingHours <= 0 || pace >= f.requiredRate;
    const defEl = document.getElementById("timeDeficitText");
    const COLORS = (window as any).COLORS;
    if (defEl) {
        if (f.remainingHours <= 0) {
            defEl.innerHTML = tr('simulator.sim_goal_reached', `Simulation: <strong>Goal Reached</strong>`);
            defEl.style.color = COLORS.excellent;
        } else if (!paceSufficient) {
            defEl.innerHTML = tr('simulator.sim_below_target', `Simulation: <strong>Below Target Pace</strong>`);
            defEl.style.color = COLORS.accent;
        } else {
            defEl.innerHTML = tr('simulator.sim_on_track', `Simulation: <strong>On Track</strong>`);
            defEl.style.color = COLORS.good;
        }
    }

    const statusMsg = document.getElementById("paceStatusMsg");
    if (statusMsg) {
        const projectedLabel = formatGmt8DateLabel(f.projectedDate, { month: "short", day: "numeric" });
        if (f.remainingHours <= 0) {
            statusMsg.innerText = tr('status_indicators.status_goal_already_reached_sim', `Goal already reached.`);
            statusMsg.style.color = COLORS.excellent;
        } else if (f.isSemesterEnded) {
            const endLabel = f.effectiveDeadline || "";
            statusMsg.innerText = tr('status_indicators.semester_ended_telemetry_stopped', `Semester ended on ${endLabel}. Telemetry recording stopped.`, { date: endLabel });
            statusMsg.style.color = COLORS.accent;
        } else if (paceSufficient) {
            statusMsg.innerText = tr('status_indicators.status_sim_pace_finish', `At ${pace.toFixed(1)}h/day, you finish by ${projectedLabel}.`, { pace: String(pace.toFixed(1)), date: projectedLabel });
            statusMsg.style.color = COLORS.good;
        } else {
            const targetRate = Math.ceil(f.requiredRate);
            statusMsg.innerText = tr('status_indicators.status_sim_pace_insufficient', `${pace.toFixed(1)}h/day is insufficient. Target ${targetRate}h+.`, { pace: String(pace.toFixed(1)), target: String(targetRate) });
            statusMsg.style.color = COLORS.accent;
        }
    }

    handleHealthIndicators(allLogs, pace);
}

function resetPaceSlider(): void {
    const toggle = document.getElementById("cardDraggableToggle") as HTMLInputElement | null;
    const isDragging = toggle ? toggle.checked : localStorage.getItem("dtr-card-draggable") === "true";
    if (isDragging) {
        const msg = tr('pace_slider_drag_disabled_toast', 'Card reordering is active. Disable it first in the header to adjust the pace slider.');
        showToast(msg, 'warning', 3500);
        return;
    }
    const slider = document.getElementById("paceSlider") as HTMLInputElement;
    if (slider) {
        slider.value = "8.0";
        updateTargetPace(8.0);
    }
}

function updatePaceSliderLockState(isDragging: boolean): void {
    const wrap = document.querySelector('.pace-slider-wrap') as HTMLElement | null;
    const slider = document.getElementById('paceSlider') as HTMLInputElement | null;
    const resetBtn = document.getElementById('resetPaceBtn') as HTMLButtonElement | null;
    if (!slider) return;
    if (isDragging) {
        slider.style.opacity = '0.45';
        slider.style.cursor = 'not-allowed';
        if (wrap) wrap.classList.add('card-dragging-locked');
        if (resetBtn) resetBtn.style.opacity = '0.45';
    } else {
        slider.style.opacity = '1';
        slider.style.cursor = 'pointer';
        if (wrap) wrap.classList.remove('card-dragging-locked');
        if (resetBtn) resetBtn.style.opacity = '1';
    }
}

function initPaceSliderLock(): void {
    const wrap = document.querySelector('.pace-slider-wrap') as HTMLElement | null;
    const slider = document.getElementById('paceSlider') as HTMLInputElement | null;
    const toggle = document.getElementById('cardDraggableToggle') as HTMLInputElement | null;
    if (!wrap || !slider) return;

    const isInitiallyDragging = toggle ? toggle.checked : localStorage.getItem("dtr-card-draggable") === "true";
    updatePaceSliderLockState(isInitiallyDragging);

    if (toggle) {
        toggle.addEventListener('change', () => {
            updatePaceSliderLockState(toggle.checked);
        });
    }

    const handleSliderBlockedInteraction = (e: Event) => {
        const isDragging = toggle ? toggle.checked : localStorage.getItem("dtr-card-draggable") === "true";
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();

            const msg = tr(
                'pace_slider_drag_disabled_toast',
                'Card reordering is active. Disable it first in the header to adjust the pace slider.'
            );
            showToast(msg, 'warning', 3500);

            if (toggle && toggle.parentElement) {
                toggle.parentElement.classList.add('highlight-pulse');
                setTimeout(() => {
                    toggle.parentElement?.classList.remove('highlight-pulse');
                }, 1400);
            }
            return false;
        }
    };

    wrap.addEventListener('pointerdown', handleSliderBlockedInteraction, true);
    slider.addEventListener('pointerdown', handleSliderBlockedInteraction, true);
    slider.addEventListener('mousedown', handleSliderBlockedInteraction, true);
    slider.addEventListener('touchstart', handleSliderBlockedInteraction, { capture: true, passive: false });
}

function toggleDeltaChartScroll(enabled: boolean): void {
    localStorage.setItem("telemetry-delta-scroll", String(enabled));
    (window as any).deltaChartScrollEnabled = enabled;
    const allLogs = (window as any).allLogs || [];
    const select = document.getElementById("weekSelect") as HTMLSelectElement | null;
    const val = select ? select.value : "all";
    let filtered = allLogs;
    if (val && val !== "all") {
        filtered = allLogs.filter((r: any) => String(getWeekNumber(r.date)) === val);
    }
    renderContextualCharts(filtered, val);
}

// --- MAIN RENDER LOOP ---

function tr(key: string, fallback: string, params: Record<string, string> = {}): string {
    const t = DTRI18N && typeof DTRI18N.t === "function" ? DTRI18N.t : null;
    if (!t) return fallback;
    const res = t(key, params);
    return (res && res !== key) ? res : fallback;
}

function renderTelemetry(logs: any[], selectedWeek: string | number = "all"): void {
    const today = parseDateKeyGmt8(toGmt8DateKey(new Date())) || new Date();
    const allLogs = (window as any).allLogs || [];
    
    const mainContainer = document.querySelector(".telemetry-page");
    const emptyMsgId = "telemetryEmptyStateMsg";
    let emptyEl = document.getElementById(emptyMsgId);
    let charts = (window as any).charts;

    if (!logs || logs.length === 0) {
        if (typeof charts !== 'undefined' && charts) {
            for (const k in charts) {
                if (charts[k] && typeof charts[k].destroy === 'function') charts[k].destroy();
                delete charts[k];
            }
        }
        
        document.querySelectorAll(".telemetry-section").forEach((s: any) => {
            s.style.display = "none";
        });

        if (!emptyEl && mainContainer) {
            emptyEl = document.createElement("div");
            emptyEl.id = emptyMsgId;
            emptyEl.className = "card empty-state-card telemetry-empty-state";
            emptyEl.style.textAlign = "center";
            emptyEl.style.padding = "60px 24px";
            emptyEl.style.marginTop = "3rem";
            emptyEl.style.maxWidth = "540px";
            emptyEl.style.marginLeft = "auto";
            emptyEl.style.marginRight = "auto";
            mainContainer.appendChild(emptyEl);
        }
        if (emptyEl) {
            emptyEl.style.display = "block";
            emptyEl.innerHTML = `
                <div class="telemetry-empty-icon" aria-hidden="true"></div>
                <h2 data-i18n="charts_general.no_records_to_visualize" style="margin: 0 0 12px;">${tr("charts_general.no_records_to_visualize", "No records to visualize.")}</h2>
                <p class="telemetry-empty-description" data-i18n="ui.no_valid_dated_records">${tr("ui.no_valid_dated_records", "No valid dated records to visualize.")}</p>
                <div class="telemetry-empty-status">SYNCING TELEMETRY</div>
            `;
        }
        return;
    } else {
        if (emptyEl) emptyEl.style.display = "none";
        document.querySelectorAll(".telemetry-section").forEach((s: any) => s.style.display = "");
    }

    if (typeof charts !== 'undefined' && charts) {
        for (const k in charts) {
            if (charts[k] && typeof charts[k].destroy === 'function') {
                charts[k].destroy();
            }
            delete charts[k];
        }
    }

    if (!logs) logs = [];
    const COLORS = (window as any).COLORS;

    const f = calculateForecastUnified({ logs: allLogs });

    safeUpdate("totalRenderedText", `${Math.round(f.totalActualHours)}h`);
    safeUpdate("remainingHoursText", `${Math.round(f.remainingHours)}h`);
    const defEl = document.getElementById("timeDeficitText");
    if (defEl) {
        const d = f.currentStatusDelta;
        const absD = Math.abs(d).toFixed(1);
        if (d > 0) {
            defEl.innerHTML = tr("status_indicators.status_ahead_hours", `Ahead (+${absD}h)`, { hours: String(absD) });
            defEl.style.color = COLORS.good;
        } else if (d < 0) {
            defEl.innerHTML = tr("status_indicators.status_behind_hours", `Behind (-${absD}h)`, { hours: String(absD) });
            defEl.style.color = COLORS.accent;
        } else {
            defEl.innerHTML = tr("status_indicators.status_on_track", `On Track`);
            defEl.style.color = COLORS.text;
        }
    }

    safeUpdate("completionDateText", formatGmt8DateLabel(f.projectedDate, { month: "short", day: "numeric" }));
    safeUpdate("remHoursPace", `${Math.round(f.remainingHours)}h`);
    safeUpdate("remDaysPace", `${f.workDaysRemaining}`);
    safeUpdate("reqPaceValue", `${Math.ceil(f.requiredRate)}h/day`);
    safeUpdate("last7DayPace", `${Math.round(allLogs.slice(-7).reduce((s: number, r: any) => s + (r.hours || 0), 0) / Math.max(1, Math.min(7, allLogs.length)))}h/day`);

    const statusMsg = document.getElementById("paceStatusMsg");
    if (statusMsg) {
        if (f.remainingHours <= 0) {
            statusMsg.innerText = tr('status_indicators.status_goal_reached', "Goal Reached! OJT Complete.");
            statusMsg.style.color = COLORS.excellent;
        } else if (f.isSemesterEnded) {
            const endLabel = f.effectiveDeadline || "";
            statusMsg.innerText = tr('status_indicators.semester_ended_telemetry_stopped', `Semester ended on ${endLabel}. Telemetry recording stopped.`, { date: endLabel });
            statusMsg.style.color = COLORS.accent;
        } else {
            const projectedLabel = formatGmt8DateLabel(f.projectedDate, { month: "short", day: "numeric" });
            if (f.isAhead) {
                statusMsg.innerText = tr('status_indicators.status_on_track_to_finish', `On track to finish by ${projectedLabel}.`, { date: projectedLabel });
            } else {
                statusMsg.innerText = tr('status_indicators.status_increase_hours', `Required pace higher than current. Increase hours.`);
            }
            statusMsg.style.color = f.isAhead ? COLORS.good : COLORS.accent;
        }
    }

    const filteredActual = logs.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalPlanned = logs.length * 8;
    const timeEfficiency = totalPlanned > 0 ? (filteredActual / totalPlanned) * 100 : 0;
    const totalBlocks = logs.reduce((sum, r) => sum + (r.accomplishments ? r.accomplishments.length : 0), 0);
    const energyEfficiency = filteredActual > 0 ? (totalBlocks / filteredActual) * 100 : 0;

    safeUpdate("timeEffValue", `${timeEfficiency.toFixed(1)}%`);
    safeUpdate("energyEffValue", `${energyEfficiency.toFixed(1)}%`);

    const avgIdentity = logs.length > 0 ? logs.reduce((sum, r) => sum + (r.identityScore || 0), 0) / logs.length : 0;
    const blocksPerHour = filteredActual > 0 ? totalBlocks / filteredActual : 0;
    const focusScore = (blocksPerHour * (avgIdentity / 5)) * 10;
    safeUpdate("focusScore", focusScore.toFixed(1));

    handleHealthIndicators(logs);

    const totalCommute = logs.reduce((sum, r) => sum + (r.commuteTotal || 0), 0);
    const prodCommute = logs.reduce((sum, r) => sum + (r.commuteProductive || 0), 0);
    const commuteEff = totalCommute > 0 ? (prodCommute / totalCommute) * 100 : 0;
    safeUpdate("commuteEff", `${commuteEff.toFixed(1)}%`);
    
    const weekLogs = logs.filter(r => (r.personalHours || 0) > 0);
    const consistencyFactor = weekLogs.length >= 4 ? 1.0 : (weekLogs.length >= 2 ? 0.7 : 0.4);
    const totalDeepHours = logs.reduce((sum, r) => sum + (r.personalHours || 0), 0);
    safeUpdate("deepWorkScore", (totalDeepHours * consistencyFactor).toFixed(1));

    const totalSleep = logs.reduce((sum, r) => sum + (r.sleepHours || 0), 0);
    safeUpdate("avgSleep", `${(logs.length > 0 ? totalSleep / logs.length : 0).toFixed(1)}h`);
    const totalRecovery = logs.reduce((sum, r) => sum + (r.recoveryHours || 0), 0);
    safeUpdate("avgRecovery", `${(logs.length > 0 ? totalRecovery / logs.length : 0).toFixed(1)}h`);
    safeUpdate("avgIdentity", `${avgIdentity.toFixed(1)} / 5`);
    const totalPersonal = logs.reduce((sum, r) => sum + (r.personalHours || 0), 0);
    const personalRatio = filteredActual > 0 ? (totalPersonal / filteredActual) * 100 : 0;
    safeUpdate("personalOjtRatio", `${personalRatio.toFixed(1)}%`);

    if (typeof (window as any).calculateMomentum === "function") {
        (window as any).calculateMomentum(today);
    }

    if (typeof (window as any).Chart !== 'undefined') {
        const Chart = (window as any).Chart;
        Chart.defaults.color = COLORS.text;
        Chart.defaults.borderColor = COLORS.grid;
        Chart.defaults.font.family = COLORS.fontBody;

        const slider = document.getElementById("paceSlider") as HTMLInputElement;
        const currentPace = slider ? parseFloat(slider.value) : null;
        if (slider) {
            const display = document.getElementById("paceSliderVal");
            if (display) display.innerText = parseFloat(slider.value).toFixed(1);
        }

        renderTrajectoryChart(allLogs, currentPace);
        renderIdentityChart(allLogs);
        renderEnergyZoneChart(logs);
        renderContextualCharts(logs, selectedWeek);
        renderRadarChart(logs);
        renderProductivityMatrix(logs);
        renderWeeklyEffortChart(allLogs);
        renderWeeklyMatrix(allLogs);
        initTelemetryEntranceAnimations();
    }
}

function renderWeeklyMatrix(logs: any[]): void {
    const tbody = document.getElementById("telemetryWeeklyTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const weeklyData: Record<number, any> = {};
    logs.forEach(r => {
        const w = getWeekNumber(r.date);
        if (!weeklyData[w]) weeklyData[w] = { ojt: 0, personal: 0, count: 0 };
        weeklyData[w].ojt += (r.hours || 0);
        weeklyData[w].personal += (r.personalHours || 0);
        weeklyData[w].count++;
    });

    const sortedWeeks = Object.keys(weeklyData).map(Number).sort((a,b) => a - b);
    let prevHours: number | null = null;
    const t = (DTRI18N && typeof DTRI18N.t === "function") ? DTRI18N.t : null;
    const COLORS = (window as any).COLORS;

    sortedWeeks.forEach(w => {
        const data = weeklyData[w];
        let growth = "-";
        if (prevHours !== null && prevHours > 0) {
            const diff = ((data.ojt - prevHours) / prevHours) * 100;
            growth = (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%";
        }
        
        const eff = ((data.ojt / (data.count * 8)) * 100).toFixed(1) + "%";
        
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid var(--grid)";
        tr.innerHTML = `
            <td style="padding: 8px;">${t ? t("ui.week_label", { week: String(w) }) : ("Week " + w)}</td>
            <td style="padding: 8px;">${data.ojt.toFixed(1)}h</td>
            <td style="padding: 8px;">${data.personal.toFixed(1)}h</td>
            <td style="padding: 8px; color: ${growth.startsWith('+') ? COLORS.good : (growth === '-' ? COLORS.text : COLORS.accent)}">${growth}</td>
            <td style="padding: 8px;">${eff}</td>
        `;
        tbody.appendChild(tr);
        prevHours = data.ojt;
    });
}

// --- CALCULATIONS ---

function handleHealthIndicators(logs: any[], paceOverride: number | null = null): void {
    let fatigueRisk = 0;
    const allLogs = (window as any).allLogs || [];
    const sorted = [...allLogs].sort((a, b) => (toGmt8DateKey(a.date) || "").localeCompare(toGmt8DateKey(b.date) || ""));
    
    const simulatedLogs = [...sorted];
    if (paceOverride !== null) {
        const pace = parseFloat(String(paceOverride));
        const lastDateKey = sorted.length > 0 ? (toGmt8DateKey(sorted[sorted.length - 1].date) || toGmt8DateKey(new Date())) : toGmt8DateKey(new Date());
        let lastDate = parseDateKeyGmt8(lastDateKey);

        for (let i = 1; i <= 7; i++) {
            const nextDate = addDaysGmt8(lastDate, i);
            if (nextDate && isWorkdayGmt8(nextDate)) {
                simulatedLogs.push({
                    hours: pace,
                    personalHours: pace > 8 ? (pace - 8) * 0.5 : 0,
                    sleepHours: Math.max(4, 9 - (pace * 0.3)),
                    date: nextDate.toISOString()
                });
            }
        }
    }

    const rec7 = simulatedLogs.slice(-7);
    const avgSleep7 = rec7.length > 0 ? rec7.reduce((s, r) => s + (r.sleepHours || 0), 0) / rec7.length : 8;
    const avgOjt7 = rec7.length > 0 ? rec7.reduce((s, r) => s + (r.hours || 0), 0) / rec7.length : 8;
    
    if (avgSleep7 < 6) fatigueRisk += 2;
    else if (avgSleep7 < 7) fatigueRisk += 1;
    
    if (avgOjt7 > 10) fatigueRisk += 2;
    else if (avgOjt7 > 9) fatigueRisk += 1;

    let consecutiveHigh = 0;
    for (let i = simulatedLogs.length - 1; i >= 0; i--) {
        if (simulatedLogs[i].hours >= 9) consecutiveHigh++;
        else break;
        if (consecutiveHigh >= 3) fatigueRisk++; 
    }

    const fatLabel = document.getElementById("fatigueLabel");
    if (fatLabel) {
        const fatInd = document.getElementById("fatigueIndicator");
        if (fatigueRisk > 2) {
            fatLabel.innerText = tr("health_indicators.high_fatigue", "High Risk");
            fatLabel.style.color = "var(--level-1)";
            if (fatInd) {
                fatInd.innerText = "🔴";
                fatInd.style.background = "transparent";
            }
        } else if (fatigueRisk > 0) {
            fatLabel.innerText = tr("health_indicators.moderate_fatigue", "Moderate");
            fatLabel.style.color = "var(--level-2)";
            if (fatInd) {
                fatInd.innerText = "🟡";
                fatInd.style.background = "transparent";
            }
        } else {
            fatLabel.innerText = tr("health_indicators.low_fatigue", "Low");
            fatLabel.style.color = "var(--level-3)";
            if (fatInd) {
                fatInd.innerText = "🟢";
                fatInd.style.background = "transparent";
            }
        }
    }
}

export {
    getThemeValues,
    initThemeSwitcher,
    setTelemetryTheme,
    syncTelemetryThemeDropdownSelection,
    syncTelemetryF1LightToggleLabel,
    toggleTelemetryF1LightMode,
    withSequentialLineDelays,
    replayChartAnimationForCanvas,
    initTelemetryEntranceAnimations,
    fetchTelemetryData,
    populateWeekSelector,
    updateView,
    updateTargetPace,
    resetPaceSlider,
    renderTelemetry,
    renderWeeklyMatrix,
    handleHealthIndicators,
    switchChartView,
    toggleDeltaChartScroll,
    updatePaceSliderLockState
};
