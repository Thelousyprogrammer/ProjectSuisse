/**
 * HARDWARE TELEMETRY MONITOR
 * Provides real-time performance and device metrics with multi-browser support
 * and intelligent anti-fingerprinting / privacy detection.
 */

import { DTRI18N } from '../dtr-i18n';

declare global {
    interface Navigator {
        deviceMemory?: number;
        userAgentData?: {
            platform?: string;
        };
        connection?: {
            effectiveType: string;
            downlink: number;
            addEventListener: (type: string, listener: () => void) => void;
            removeEventListener?: (type: string, listener: () => void) => void;
        };
        getBattery?: () => Promise<{
            level: number;
            charging: boolean;
            chargingTime?: number;
            dischargingTime?: number;
            addEventListener: (type: string, listener: () => void) => void;
            removeEventListener?: (type: string, listener: () => void) => void;
        }>;
    }

    interface Window {
        HardwareMonitor?: HardwareMonitor;
    }
}

export interface HardwareMetrics {
    cpu: number | string;
    cpuTooltip?: string;
    ram: string;
    ramTooltip?: string;
    net: string;
    netTooltip?: string;
    fps: number;
    loadTime: number | string;
    gpu: string;
    gpuTooltip?: string;
    platform: string;
    battery: string;
    batteryTooltip?: string;
}

export class HardwareMonitor {
    fps = 0;
    metrics: HardwareMetrics;
    private initialized = false;

    fpsRafId: number | null = null;
    updateTimeoutId: any = null;
    onlineListener: (() => void) | null = null;
    offlineListener: (() => void) | null = null;
    connectionListener: (() => void) | null = null;
    batteryChargingListener: (() => void) | null = null;
    batteryLevelListener: (() => void) | null = null;
    batteryRef: any = null;

    private tSafe(keyPath: string, fallback: string): string {
        if (typeof DTRI18N !== 'undefined' && DTRI18N && typeof DTRI18N.t === 'function') {
            const val = DTRI18N.t(keyPath);
            if (val && val !== keyPath) return val;
        }
        return fallback;
    }

    get i18nLoading(): string { return this.tSafe('hardware.loading', 'Loading...'); }
    get i18nUnknown(): string { return this.tSafe('hardware.unknown', 'Unknown'); }
    get i18nNA(): string { return this.tSafe('hardware.not_applicable', 'N/A'); }
    get i18nFirefoxProtected(): string { return this.tSafe('hardware.firefox_protected', 'Firefox Protected'); }
    get i18nSafariRestricted(): string { return this.tSafe('hardware.safari_restricted', 'Safari Restricted'); }
    get i18nFirefoxPrivacyMask(): string { return this.tSafe('hardware.firefox_privacy_mask', 'Firefox Privacy Mask'); }

    static isConsentGranted(): boolean {
        if (typeof localStorage === 'undefined') return true;
        return localStorage.getItem('dtr-hw-telemetry-consent') !== 'deny';
    }

    isAllowed(): boolean {
        return HardwareMonitor.isConsentGranted();
    }

    constructor() {
        const cpuInfo = this.getCPUInfo();
        const ramInfo = this.getRamInfo();

        this.metrics = {
            cpu: cpuInfo.text,
            cpuTooltip: cpuInfo.tooltip,
            ram: ramInfo.text,
            ramTooltip: ramInfo.tooltip,
            net: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline' : 'Online',
            fps: 0,
            loadTime: 0,
            gpu: this.i18nLoading,
            platform: this.getPlatform(),
            battery: this.i18nLoading
        };
    }

    setConsent(allowed: boolean): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dtr-hw-telemetry-consent', allowed ? 'allow' : 'deny');
        }
        if (allowed) {
            this.startMonitoring();
        } else {
            this.stopMonitoring();
        }
        this.updateConsentUI(allowed);
    }

    optIn(): void {
        this.setConsent(true);
    }

    optOut(): void {
        this.setConsent(false);
    }

    updateConsentUI(allowed: boolean): void {
        const metricsContainer = document.getElementById('hwMetricsContainer');
        const deniedBanner = document.getElementById('hwDeniedBanner');
        const consentIcon = document.getElementById('hwConsentIcon');
        const consentBtn = document.getElementById('hwConsentBtn');
        const consentToggle = document.getElementById('hardwareTelemetryConsentToggle') as HTMLInputElement | null;

        if (consentToggle) {
            consentToggle.checked = allowed;
        }

        if (metricsContainer) {
            metricsContainer.style.display = allowed ? 'block' : 'none';
        }
        if (deniedBanner) {
            deniedBanner.style.display = allowed ? 'none' : 'block';
        }

        if (consentIcon) {
            consentIcon.textContent = allowed ? 'shield' : 'shield_with_heart';
        }
        if (consentBtn) {
            consentBtn.title = allowed ? 'Opt Out / Deny Telemetry' : 'Allow Telemetry';
        }
    }

    cleanGPUString(str: string): string {
        if (!str || typeof str !== 'string') return '';
        let clean = str
            .replace(/^ANGLE\s*\(/i, '')
            .replace(/\)$/, '')
            .trim();

        if (clean.includes(',')) {
            const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                // If the second part has a recognizable GPU brand or model, prefer it
                if (/geforce|radeon|intel|iris|arc|apple|rtx|gtx|quadro|adreno|mali/i.test(parts[1])) {
                    clean = parts[1];
                } else if (parts[1].length >= parts[0].length) {
                    clean = parts[1];
                }
            }
        }

        return clean
            .replace(/,?\s*Direct3D.*$/i, '')
            .replace(/,?\s*OpenGL.*$/i, '')
            .replace(/,?\s*Vulkan.*$/i, '')
            .replace(/,?\s*Metal.*$/i, '')
            .replace(/\s*\([^)]*0x[0-9a-fA-F]+[^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim() || str;
    }

    formatArchitecture(arch: string): string {
        const a = arch.toLowerCase().trim();
        if (a === 'lovelace') return 'NVIDIA Ada Lovelace';
        if (a === 'ampere') return 'NVIDIA Ampere';
        if (a === 'turing') return 'NVIDIA Turing';
        if (a === 'volta') return 'NVIDIA Volta';
        if (a === 'pascal') return 'NVIDIA Pascal';
        if (a === 'maxwell') return 'NVIDIA Maxwell';
        if (a.startsWith('rdna-3') || a === 'rdna3') return 'AMD RDNA 3';
        if (a.startsWith('rdna-2') || a === 'rdna2') return 'AMD RDNA 2';
        if (a.startsWith('rdna')) return 'AMD RDNA';
        if (a === 'gen-12' || a === 'gen12' || a === 'xe') return 'Intel Xe Graphics';
        return arch.charAt(0).toUpperCase() + arch.slice(1);
    }

    async fetchGPUInfo(): Promise<void> {
        if (!this.isAllowed()) return;
        let webglGPU = '';
        let webgpuArchitecture = '';
        let webgpuName = '';

        // 1. Try WebGL / WebGL2 FIRST (contains the full marketing name e.g. "NVIDIA GeForce RTX 4050 Laptop GPU")
        try {
            const canvas = document.createElement('canvas');
            const gl = (
                canvas.getContext('webgl2') ||
                canvas.getContext('webgl', { powerPreference: "high-performance" }) || 
                canvas.getContext('webgl') ||
                canvas.getContext('experimental-webgl')
            ) as (WebGLRenderingContext | WebGL2RenderingContext | null);

            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                let renderer: any = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
                if (!renderer || typeof renderer !== 'string') {
                    renderer = gl.getParameter(gl.RENDERER);
                }
                if (renderer && typeof renderer === 'string') {
                    webglGPU = this.cleanGPUString(renderer);
                }
            }
        } catch (_) {}

        // 2. Try WebGPU (provides microarchitecture codenames like "lovelace" and adapter details)
        try {
            if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
                let adapter: any = null;
                try {
                    adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: "high-performance" });
                } catch (_) {}
                if (!adapter) {
                    try {
                        adapter = await (navigator as any).gpu.requestAdapter();
                    } catch (_) {}
                }

                if (adapter) {
                    const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
                    if (info) {
                        if (info.description || info.device) {
                            webgpuName = this.cleanGPUString(info.description || info.device);
                        }
                        if (info.architecture) {
                            webgpuArchitecture = String(info.architecture).trim();
                        }
                    }
                    if (!webgpuName && adapter.name) {
                        webgpuName = this.cleanGPUString(adapter.name);
                    }
                }
            }
        } catch (_) {}

        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

        // 3. Resolve GPU model with cross-browser intelligence
        if (isFirefox && /gtx\s*980/i.test(webglGPU)) {
            // Firefox Resist Fingerprinting (RFP) specifically masks modern GPUs as GTX 980
            this.metrics.gpu = `GeForce GTX 980 (${this.i18nFirefoxPrivacyMask})`;
            this.metrics.gpuTooltip = 'Firefox Enhanced Tracking Protection / Resist Fingerprinting (RFP) intentionally masks your actual GPU to prevent websites from fingerprinting your device.';
            this.updateCardMetrics();
            return;
        }

        // If WebGL found a specific GPU model (e.g. "NVIDIA GeForce RTX 4050 Laptop GPU")
        if (webglGPU && !/^(webkit|generic|software)/i.test(webglGPU)) {
            this.metrics.gpu = webglGPU;
            let tip = `GPU: ${webglGPU}`;
            if (webgpuArchitecture) {
                tip += ` (${this.formatArchitecture(webgpuArchitecture)} Architecture)`;
            }
            this.metrics.gpuTooltip = tip;
            this.updateCardMetrics();
            return;
        }

        // If WebGPU gave a full name
        if (webgpuName && !/^(webkit|generic|software)/i.test(webgpuName)) {
            this.metrics.gpu = webgpuName;
            this.metrics.gpuTooltip = `GPU: ${webgpuName}`;
            this.updateCardMetrics();
            return;
        }

        // If only WebGPU architecture is available (e.g. "lovelace")
        if (webgpuArchitecture) {
            const formattedArch = this.formatArchitecture(webgpuArchitecture);
            this.metrics.gpu = formattedArch;
            this.metrics.gpuTooltip = `GPU Microarchitecture: ${formattedArch} (Model hidden by browser)`;
            this.updateCardMetrics();
            return;
        }

        // Fallback to WebGL string or Unknown
        if (webglGPU) {
            this.metrics.gpu = webglGPU;
            this.metrics.gpuTooltip = `GPU: ${webglGPU}`;
            this.updateCardMetrics();
            return;
        }

        this.metrics.gpu = this.i18nUnknown;
        this.metrics.gpuTooltip = 'Graphics card information could not be determined.';
        this.updateCardMetrics();
    }

    getPlatform(): string {
        if (typeof navigator === 'undefined') return this.i18nUnknown;
        if (navigator.userAgentData && navigator.userAgentData.platform) {
            return navigator.userAgentData.platform;
        }
        const ua = navigator.userAgent || '';
        if (/Win(dows )?/i.test(ua)) return 'Windows';
        if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return (navigator as any).platform || this.i18nUnknown;
    }

    getCPUInfo(): { text: string; tooltip: string } {
        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
        const isChrome = typeof window !== 'undefined' && !!(window as any).chrome;

        if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
            const cores = navigator.hardwareConcurrency;
            let tip = `${cores} logical processor threads reported by navigator.hardwareConcurrency.`;
            if (isChrome && cores === 8) {
                tip += ' Note: Chromium may clamp hardwareConcurrency to 8 threads for security/anti-profiling, even if your CPU physically has more threads (e.g. 12).';
            } else if (isFirefox) {
                tip += ` Firefox reports actual logical processor concurrency (${cores} threads).`;
            }
            return {
                text: `${cores} Cores`,
                tooltip: tip
            };
        }

        return {
            text: this.i18nNA,
            tooltip: 'CPU concurrency metric unsupported.'
        };
    }

    getRamInfo(): { text: string; tooltip: string } {
        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
        const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number') {
            return {
                text: `${navigator.deviceMemory} GB`,
                tooltip: `Reported via Chromium Device Memory API (~${navigator.deviceMemory} GB RAM allocated to browser processes).`
            };
        }

        if (isFirefox) {
            return {
                text: `${this.i18nNA} (${this.i18nFirefoxProtected})`,
                tooltip: 'Firefox does not implement the Device Memory API to prevent device fingerprinting.'
            };
        }
        if (isSafari) {
            return {
                text: `${this.i18nNA} (${this.i18nSafariRestricted})`,
                tooltip: 'Safari does not implement the Device Memory API for privacy.'
            };
        }
        return {
            text: this.i18nNA,
            tooltip: 'Device Memory API unsupported on this browser.'
        };
    }

    refreshLocalizedMetrics(): void {
        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
        const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (this.metrics.gpu === 'Unknown' || this.metrics.gpu === this.i18nUnknown || this.metrics.gpu.includes('hardware.')) {
            this.metrics.gpu = this.i18nUnknown;
        } else if (isFirefox && /gtx\s*980/i.test(this.metrics.gpu)) {
            this.metrics.gpu = `GeForce GTX 980 (${this.i18nFirefoxPrivacyMask})`;
        }

        if (this.metrics.platform === 'Unknown' || this.metrics.platform === this.i18nUnknown || this.metrics.platform.includes('hardware.')) {
            this.metrics.platform = this.getPlatform();
        }

        const ram = this.getRamInfo();
        this.metrics.ram = ram.text;
        this.metrics.ramTooltip = ram.tooltip;

        const cpu = this.getCPUInfo();
        this.metrics.cpu = cpu.text;
        this.metrics.cpuTooltip = cpu.tooltip;

        if (!this.batteryRef) {
            if (isFirefox) {
                this.metrics.battery = `${this.i18nNA} (${this.i18nFirefoxProtected})`;
                this.metrics.batteryTooltip = 'Firefox removed the Battery Status API in Firefox 52 to prevent cross-site tracking and fingerprinting.';
            } else if (isSafari) {
                this.metrics.battery = `${this.i18nNA} (${this.i18nSafariRestricted})`;
                this.metrics.batteryTooltip = 'Safari does not support the Battery Status API for user privacy.';
            } else {
                this.metrics.battery = this.i18nNA;
                this.metrics.batteryTooltip = 'Battery Status API unsupported on this browser.';
            }
        }
    }

    init(): void {
        const allowed = HardwareMonitor.isConsentGranted();
        this.updateConsentUI(allowed);
        this.refreshLocalizedMetrics();

        if (typeof document !== 'undefined') {
            document.addEventListener('dtr:languageChanged', () => {
                if (!this.isAllowed()) return;
                this.refreshLocalizedMetrics();
                this.updateCardMetrics();
            });
        }

        if (allowed) {
            this.startMonitoring();
        }
    }

    startMonitoring(): void {
        if (this.initialized) {
            if (!this.fpsRafId) this.startFpsCounter();
            if (!this.updateTimeoutId) this.updateLoop();
            this.fetchGPUInfo();
            this.monitorNetwork();
            this.monitorBattery();
            return;
        }

        this.initialized = true;
        this.refreshLocalizedMetrics();
        this.updateCardMetrics();
        this.fetchGPUInfo();
        this.measureLoadTime();
        this.startFpsCounter();
        this.monitorNetwork();
        this.monitorBattery();
        this.updateLoop();
    }

    stopMonitoring(): void {
        if (this.fpsRafId) {
            cancelAnimationFrame(this.fpsRafId);
            this.fpsRafId = null;
        }

        if (this.updateTimeoutId) {
            clearTimeout(this.updateTimeoutId);
            this.updateTimeoutId = null;
        }

        if (typeof window !== 'undefined') {
            if (this.onlineListener) window.removeEventListener('online', this.onlineListener);
            if (this.offlineListener) window.removeEventListener('offline', this.offlineListener);
        }
        if (typeof navigator !== 'undefined' && navigator.connection && typeof navigator.connection.removeEventListener === 'function' && this.connectionListener) {
            navigator.connection.removeEventListener('change', this.connectionListener);
        }
        this.onlineListener = null;
        this.offlineListener = null;
        this.connectionListener = null;

        if (this.batteryRef) {
            if (this.batteryChargingListener && typeof this.batteryRef.removeEventListener === 'function') {
                this.batteryRef.removeEventListener('chargingchange', this.batteryChargingListener);
            }
            if (this.batteryLevelListener && typeof this.batteryRef.removeEventListener === 'function') {
                this.batteryRef.removeEventListener('levelchange', this.batteryLevelListener);
            }
            this.batteryRef = null;
            this.batteryChargingListener = null;
            this.batteryLevelListener = null;
        }

        this.initialized = false;
    }

    measureLoadTime(): void {
        if (typeof window === 'undefined') return;
        const checkLoadTime = () => {
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
            if (nav && nav.loadEventEnd > 0) {
                this.metrics.loadTime = (nav.loadEventEnd - nav.startTime).toFixed(0);
            }
        };
        if (document.readyState === 'complete') {
            checkLoadTime();
        } else {
            window.addEventListener('load', checkLoadTime);
        }
    }

    startFpsCounter(): void {
        if (this.fpsRafId) cancelAnimationFrame(this.fpsRafId);
        let frameCount = 0;
        let lastTime = performance.now();

        const loop = (time: number) => {
            if (!this.isAllowed()) {
                this.fpsRafId = null;
                return;
            }
            frameCount++;
            if (time - lastTime >= 1000) {
                this.metrics.fps = Math.round((frameCount * 1000) / (time - lastTime));
                frameCount = 0;
                lastTime = time;
                const fpsEl = document.getElementById('hwFps');
                if (fpsEl) {
                    fpsEl.textContent = `${this.metrics.fps} FPS`;
                    fpsEl.title = `Current page render frame rate: ${this.metrics.fps} FPS`;
                }
            }
            this.fpsRafId = requestAnimationFrame(loop);
        };
        this.fpsRafId = requestAnimationFrame(loop);
    }

    monitorNetwork(): void {
        if (!this.isAllowed()) return;
        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);

        const updateNet = () => {
            if (!this.isAllowed()) return;
            if (typeof navigator === 'undefined') {
                this.metrics.net = this.i18nUnknown;
                this.metrics.netTooltip = 'Network state unknown';
                this.updateCardMetrics();
                return;
            }

            if (!navigator.onLine) {
                this.metrics.net = 'Offline';
                this.metrics.netTooltip = 'Device is disconnected from the network.';
                this.updateCardMetrics();
                return;
            }

            if (navigator.connection) {
                const conn = navigator.connection;
                const type = conn.effectiveType ? conn.effectiveType.toUpperCase() : '';
                const speed = (typeof conn.downlink === 'number' && conn.downlink > 0) ? `${conn.downlink} Mbps` : '';
                if (type && speed) {
                    this.metrics.net = `${type} (${speed})`;
                    this.metrics.netTooltip = `Connection Type: ${type}, Estimated Downlink: ${speed}`;
                } else if (type) {
                    this.metrics.net = type;
                    this.metrics.netTooltip = `Connection Type: ${type}`;
                } else {
                    this.metrics.net = 'Online';
                    this.metrics.netTooltip = 'Connected to network.';
                }
            } else if (isFirefox) {
                this.metrics.net = 'Online (Standard)';
                this.metrics.netTooltip = 'Firefox only exposes online/offline state to prevent network fingerprinting (NetworkInformation API unsupported).';
            } else {
                this.metrics.net = 'Online';
                this.metrics.netTooltip = 'Connected to network.';
            }
            this.updateCardMetrics();
        };

        if (typeof window !== 'undefined') {
            this.onlineListener = updateNet;
            this.offlineListener = updateNet;
            window.addEventListener('online', this.onlineListener);
            window.addEventListener('offline', this.offlineListener);
        }
        if (typeof navigator !== 'undefined' && navigator.connection) {
            this.connectionListener = updateNet;
            navigator.connection.addEventListener('change', this.connectionListener);
        }
        updateNet();
    }

    async monitorBattery(): Promise<void> {
        if (!this.isAllowed()) return;
        const isFirefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent);
        const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (typeof navigator !== 'undefined' && 'getBattery' in navigator && typeof navigator.getBattery === 'function') {
            try {
                const battery = await navigator.getBattery();
                this.batteryRef = battery;
                const updateBattery = () => {
                    if (!this.isAllowed()) return;
                    const level = Math.round(battery.level * 100);
                    const icon = battery.charging ? '⚡' : '🔋';
                    const isSpecDummy = (level === 100 && battery.charging && (battery.chargingTime === 0 || !isFinite(Number(battery.dischargingTime))));
                    const statusText = (level === 100 && battery.charging) ? ' (Fully Charged)' : (battery.charging ? ' (Charging)' : '');
                    this.metrics.battery = `${level}% ${icon}${statusText}`;
                    if (isSpecDummy || (level === 100 && battery.charging)) {
                        this.metrics.batteryTooltip = `Battery Level: 100%, Status: Fully Charged / AC. Note: If unplugged or on a desktop/VM, Chromium defaults to 100% (Charging) per W3C privacy specifications to prevent cross-site battery fingerprinting.`;
                    } else {
                        this.metrics.batteryTooltip = `Battery Level: ${level}%, Charging: ${battery.charging ? 'Yes' : 'No'}`;
                    }
                    this.updateCardMetrics();
                };
                this.batteryChargingListener = updateBattery;
                this.batteryLevelListener = updateBattery;
                battery.addEventListener('chargingchange', this.batteryChargingListener);
                battery.addEventListener('levelchange', this.batteryLevelListener);
                updateBattery();
                return;
            } catch (_) {}
        }

        if (isFirefox) {
            this.metrics.battery = `${this.i18nNA} (${this.i18nFirefoxProtected})`;
            this.metrics.batteryTooltip = 'Firefox removed the Battery Status API in Firefox 52 to prevent cross-site tracking and fingerprinting.';
        } else if (isSafari) {
            this.metrics.battery = `${this.i18nNA} (${this.i18nSafariRestricted})`;
            this.metrics.batteryTooltip = 'Safari does not support the Battery Status API for user privacy.';
        } else {
            this.metrics.battery = this.i18nNA;
            this.metrics.batteryTooltip = 'Battery Status API unsupported on this browser.';
        }
        this.updateCardMetrics();
    }

    updateCardMetrics(): void {
        if (!this.isAllowed()) return;

        // Safety check: if metrics contain raw unlocalized keypath strings, refresh them now
        if (
            (typeof this.metrics.ram === 'string' && this.metrics.ram.includes('hardware.')) ||
            (typeof this.metrics.battery === 'string' && this.metrics.battery.includes('hardware.')) ||
            (typeof this.metrics.gpu === 'string' && this.metrics.gpu.includes('hardware.'))
        ) {
            this.refreshLocalizedMetrics();
        }

        const cpuCoresEl = document.getElementById('hwCpuCores');
        if (cpuCoresEl) {
            cpuCoresEl.textContent = `${this.metrics.cpu}`;
            if (this.metrics.cpuTooltip) cpuCoresEl.title = this.metrics.cpuTooltip;
        }

        const deviceMemoryEl = document.getElementById('hwDeviceMemory');
        if (deviceMemoryEl) {
            deviceMemoryEl.textContent = `${this.metrics.ram}`;
            if (this.metrics.ramTooltip) deviceMemoryEl.title = this.metrics.ramTooltip;
        }

        const networkEl = document.getElementById('hwNetworkStatus');
        if (networkEl) {
            networkEl.textContent = `${this.metrics.net}`;
            if (this.metrics.netTooltip) networkEl.title = this.metrics.netTooltip;
        }

        const fpsEl = document.getElementById('hwFps');
        if (fpsEl) {
            fpsEl.textContent = `${this.metrics.fps} FPS`;
            fpsEl.title = `Current page render frame rate: ${this.metrics.fps} FPS`;
        }

        const gpuEl = document.getElementById('hwGpu');
        if (gpuEl) {
            gpuEl.textContent = this.metrics.gpu;
            if (this.metrics.gpuTooltip) {
                gpuEl.title = this.metrics.gpuTooltip;
            } else {
                gpuEl.title = this.metrics.gpu;
            }
        }

        const platformEl = document.getElementById('hwPlatform');
        if (platformEl) {
            platformEl.textContent = this.metrics.platform;
            platformEl.title = `Operating System / Platform: ${this.metrics.platform}`;
        }

        const batteryEl = document.getElementById('hwBattery');
        if (batteryEl) {
            batteryEl.textContent = this.metrics.battery;
            if (this.metrics.batteryTooltip) batteryEl.title = this.metrics.batteryTooltip;
        }
    }

    updateLoop(): void {
        if (!this.isAllowed()) return;
        this.updateCardMetrics();
        this.updateTimeoutId = setTimeout(() => this.updateLoop(), 2000);
    }
}

export const hardwareMonitorInstance = new HardwareMonitor();
if (typeof window !== 'undefined') {
    window.HardwareMonitor = hardwareMonitorInstance;
}


