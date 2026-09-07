import { z } from 'zod';
import { SecurityMonitor } from './utils/security-monitor';

export const DailyRecordSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: z.number().nonnegative(),
    delta: z.number().optional(),
    reflection: z.string(),
    accomplishments: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    images: z.array(z.string()).optional().default([]),
    imageIds: z.array(z.string()).optional().default([]),
    personalHours: z.number().optional().default(0),
    sleepHours: z.number().optional().default(0),
    recoveryHours: z.number().optional().default(0),
    commuteTotal: z.number().optional().default(0),
    commuteProductive: z.number().optional().default(0),
    identityScore: z.number().nullable().optional().default(null)
}).passthrough();

export type DailyRecordData = z.infer<typeof DailyRecordSchema>;

let _records: DailyRecordData[] = [];

function validateAndScanRecord(record: any): DailyRecordData {
    const validated = DailyRecordSchema.parse(record);
    if (!SecurityMonitor.scanInput(validated.reflection, 'Store.reflection')) {
        throw new Error('[SECURITY] Suspicious pattern detected in reflection');
    }
    if (Array.isArray(validated.accomplishments)) {
        for (const a of validated.accomplishments) {
            if (!SecurityMonitor.scanInput(a, 'Store.accomplishments')) {
                throw new Error('[SECURITY] Suspicious pattern detected in accomplishments');
            }
        }
    }
    if (Array.isArray(validated.tools)) {
        for (const t of validated.tools) {
            if (!SecurityMonitor.scanInput(t, 'Store.tools')) {
                throw new Error('[SECURITY] Suspicious pattern detected in tools');
            }
        }
    }
    return validated;
}

export const Store = {
    getRecords: (): DailyRecordData[] => _records,
    setRecords: (newRecords: any[]): void => {
        SecurityMonitor.verifyDataIntegrity();
        if (!Array.isArray(newRecords)) {
            _records = [];
            return;
        }
        const validRecords: DailyRecordData[] = [];
        for (const r of newRecords) {
            try {
                validRecords.push(validateAndScanRecord(r));
            } catch (err) {
                SecurityMonitor.reportIncident({ type: 'STORE_VALIDATION_ERROR', record: r, error: err });
            }
        }
        _records = validRecords;
    },
    addRecord: (record: any): void => {
        SecurityMonitor.verifyDataIntegrity();
        try {
            const validated = validateAndScanRecord(record);
            _records.push(validated);
        } catch (err) {
            SecurityMonitor.reportIncident({ type: 'STORE_ADD_VALIDATION_ERROR', record, error: err });
            throw err;
        }
    },
    updateRecord: (index: number, record: any): void => {
        SecurityMonitor.verifyDataIntegrity();
        try {
            const validated = validateAndScanRecord(record);
            _records[index] = validated;
        } catch (err) {
            SecurityMonitor.reportIncident({ type: 'STORE_UPDATE_VALIDATION_ERROR', record, error: err });
            throw err;
        }
    },
    removeRecordAt: (index: number): void => {
        SecurityMonitor.verifyDataIntegrity();
        _records.splice(index, 1);
    },
    popRecord: (): DailyRecordData | undefined => {
        SecurityMonitor.verifyDataIntegrity();
        return _records.pop();
    },
    clear: (): void => {
        SecurityMonitor.verifyDataIntegrity();
        _records = [];
    }
};

if (typeof window !== 'undefined') {
    (window as any).Store = Store;
}
