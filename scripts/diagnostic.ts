/**
 * DTR Live Diagnostic Script
 * Focuses on RAM consumption, Network Latency, and Asset Retrieval Loading Times.
 * 
 * Usage: 
 * 1. Open Developer Tools (F12) in your browser.
 * 2. Go to the "Console" tab.
 * 3. Run runDTRDiagnostics() or import in dev tools.
 */

export async function runDTRDiagnostics(): Promise<void> {
    console.log("%c🚀 Starting DTR Live Diagnostics...", "color: #00ff00; font-size: 16px; font-weight: bold;");
    
    // ─── 1. RAM Consumption (Cross-Browser Check) ─────────────────────────────────
    console.log("%c🧠 Memory (RAM) Consumption", "color: #00aaff; font-weight: bold; font-size: 14px;");
    
    const perf = performance as any;
    if (perf.memory) {
        const usedMB = (perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2);
        const totalMB = (perf.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2);
        
        console.table({
            "Browser Engine": "Chromium (Blink)",
            "Used JS Heap": `${usedMB} MB`,
            "Total Allocated": `${totalMB} MB`
        });
    } else if (typeof window !== 'undefined' && window.performance && typeof (performance as any).measureUserAgentSpecificMemory === 'function') {
        console.log("Standard Memory API detected. Attempting measurement...");
        (performance as any).measureUserAgentSpecificMemory().then((mem: any) => {
            console.log(`Estimated Memory Usage: ${(mem.bytes / (1024 * 1024)).toFixed(2)} MB`);
        }).catch(() => {
            console.log("Memory measurement blocked (Requires Cross-Origin Isolated environment).");
        });
    } else {
        const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');
        console.log(isFirefox 
            ? "Firefox detected: JS Heap size is hidden for security reasons (privacy protections)." 
            : "Memory API not supported in this browser.");
        console.log("%c💡 Tip: For comparative analysis in Firefox, focus on 'Asset Retrieval' and 'DOM Interactive' timings below.", "font-style: italic; opacity: 0.8;");
    }
    
    // ─── 2. Paint Timings ──────────────────────────────────────────────────────
    console.log("%c🎨 Rendering & Paint Timings", "color: #00ffaa; font-weight: bold; font-size: 14px;");
    const paintEntries = performance.getEntriesByType("paint");
    if (paintEntries.length > 0) {
        console.table(paintEntries.map(e => ({
            "Metric": e.name,
            "Timing (ms)": e.startTime.toFixed(2)
        })));
    } else {
        console.log("Paint timings not available (common in some private windows).");
    }

    // ─── 3. Network Latency & TTFB ─────────────────────────────────────────────
    console.log("%c🌐 Network Latency & Page Load", "color: #ffaa00; font-weight: bold; font-size: 14px;");
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
        const nav = navEntries[0];
        const ttfb = (nav.responseStart - nav.requestStart).toFixed(2);
        const domInteractive = nav.domInteractive.toFixed(2);
        const fullPageLoad = nav.loadEventEnd.toFixed(2);

        console.table({
            "Time to First Byte (TTFB)": `${ttfb} ms`,
            "DOM Interactive (Ready to Use)": `${domInteractive} ms`,
            "Full Document Load": `${fullPageLoad} ms`
        });
    }

    // Active ping test for current latency
    try {
        const pingStart = performance.now();
        await fetch(window.location.href.split('?')[0] + '?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
        const pingEnd = performance.now();
        const latency = (pingEnd - pingStart).toFixed(2);
        console.log(`Active Ping Latency to host: %c${latency} ms`, `color: ${Number(latency) < 100 ? '#00ff00' : '#ff0000'}; font-weight:bold;`);
    } catch (_) {
        console.warn("Could not measure active ping latency.");
    }

    // ─── 4. DOM Complexity ─────────────────────────────────────────────────────
    console.log("%c🏗️ DOM Structure", "color: #ff5500; font-weight: bold; font-size: 14px;");
    const nodeCount = document.getElementsByTagName('*').length;
    console.log(`Total DOM Nodes: %c${nodeCount}`, "font-weight:bold; color: #ff5500;");
    if (nodeCount > 1500) {
        console.warn("⚠️ High node count! May cause scroll lag in Firefox due to reflow overhead.");
    }

    // ─── 5. Asset Retrieval Loading Times ──────────────────────────────────────
    console.log("%c📦 Asset Retrieval Loading Times", "color: #ff00ff; font-weight: bold; font-size: 14px;");
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    
    const slowestResources = resources
        .map(r => ({
            "Asset Name": r.name.split('/').pop()?.split('?')[0] || r.name,
            "Type": r.initiatorType,
            "Duration (ms)": parseFloat(r.duration.toFixed(2)),
            "Transfer Size (KB)": r.transferSize ? (r.transferSize / 1024).toFixed(2) : 'Cached/Unknown'
        }))
        .sort((a, b) => Number(b["Duration (ms)"]) - Number(a["Duration (ms)"]))
        .slice(0, 10); 

    console.log("Top 10 Slowest Assets:");
    console.table(slowestResources);

    const images = resources.filter(r => r.initiatorType === 'img');
    const scripts = resources.filter(r => r.initiatorType === 'script');
    const css = resources.filter(r => r.initiatorType === 'link' || r.name.includes('.css'));
    const fetchCalls = resources.filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest');

    const calcAvg = (arr: PerformanceResourceTiming[]) => arr.length ? (arr.reduce((a, b) => a + b.duration, 0) / arr.length).toFixed(2) : '0';

    console.log("Average Asset Loading Times:");
    console.table({
        "Images": `${calcAvg(images)} ms (${images.length} files)`,
        "Scripts (JS)": `${calcAvg(scripts)} ms (${scripts.length} files)`,
        "Stylesheets (CSS)": `${calcAvg(css)} ms (${css.length} files)`,
        "Fetch/XHR (.toml / APIs)": `${calcAvg(fetchCalls)} ms (${fetchCalls.length} requests)`
    });

    if (typeof (window as any).Store !== 'undefined' && typeof (window as any).Store.getRecords === 'function') {
        const dbStart = performance.now();
        const recordCount = (window as any).Store.getRecords().length;
        const dbEnd = performance.now();
        console.log(`IndexedDB Local Store parsed %c${recordCount} records%c in %c${(dbEnd - dbStart).toFixed(2)} ms`, "color:#00ff00;", "color:inherit;", "color:#00aaff; font-weight:bold;");
    }

    // ─── 6. Storage Quota ──────────────────────────────────────────────────────
    function formatBytes(bytes: number | undefined, decimals = 2): string {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        console.log(`Storage Partition: %c${formatBytes(usage)} used%c of %c${formatBytes(quota)} quota`, "color:#00ff00;", "color:inherit;", "color:#00aaff; font-weight:bold;");
    }

    console.log("%c✅ Diagnostics Complete", "color: #00ff00; font-size: 14px; font-weight: bold;");
}

declare global {
    interface Window {
        runDTRDiagnostics?: () => Promise<void>;
    }
}

if (typeof window !== "undefined") {
    window.runDTRDiagnostics = runDTRDiagnostics;
}
