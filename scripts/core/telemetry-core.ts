/**
 * TELEMETRY CORE MODULE
 * Shared constants and global state
 */

export const MASTER_GOAL: number = 500;

// --- MODULE STATE ---
export const telemetryState = {
    COLORS: {},
    allLogs: [] as any[],
    realLogs: [] as any[],
    isSimulating: false,
    charts: {} as Record<string, any>
};
