/**
 * Localization Audit Script
 * 
 * Compares all .toml files in the locales directory against a master (en.toml)
 * to identify missing or extra keys. This ensures parity across all supported languages.
 * 
 * Usage: node or ts-node runner
 */

import { parse } from 'smol-toml';

declare const require: any;
declare const __dirname: string;
declare const module: any;

const fs = (typeof require !== 'undefined') ? require('fs') : null;
const path = (typeof require !== 'undefined') ? require('path') : null;

const LOCALES_DIR = path ? path.join(__dirname, '..', 'locales') : '';
const MASTER_FILE = 'en.toml';

function getDeepKeys(obj: Record<string, any>, prefix = ''): string[] {
    return Object.keys(obj).reduce((res: string[], el: string) => {
        if (typeof obj[el] === 'object' && obj[el] !== null && !Array.isArray(obj[el])) {
            return res.concat(getDeepKeys(obj[el], prefix + el + '.'));
        }
        return res.concat(prefix + el);
    }, []);
}

export function auditLocales(): void {
    console.log('\x1b[36m%s\x1b[0m', '--- DTR Localization Audit ---');
    
    if (!fs.existsSync(path.join(LOCALES_DIR, MASTER_FILE))) {
        console.error(`Master file ${MASTER_FILE} not found in ${LOCALES_DIR}`);
        return;
    }

    const files = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.toml'));
    const masterPath = path.join(LOCALES_DIR, MASTER_FILE);
    const masterContent = parse(fs.readFileSync(masterPath, 'utf-8')) as Record<string, any>;
    const masterKeys = new Set(getDeepKeys(masterContent));

    console.log(`Master Library: ${MASTER_FILE} (${masterKeys.size} keys)\n`);

    let totalDiscrepancies = 0;

    files.forEach(file => {
        if (file === MASTER_FILE) return;

        const targetPath = path.join(LOCALES_DIR, file);
        let targetContent: Record<string, any>;
        try {
            targetContent = parse(fs.readFileSync(targetPath, 'utf-8')) as Record<string, any>;
        } catch (e: any) {
            console.log(`\x1b[31m[ERROR] Failed to parse ${file}: ${e.message}\x1b[0m`);
            return;
        }

        const targetKeysList = getDeepKeys(targetContent);
        const targetKeys = new Set(targetKeysList);

        const missing = [...masterKeys].filter(k => !targetKeys.has(k));
        const extra = [...targetKeys].filter(k => !masterKeys.has(k));

        if (missing.length === 0 && extra.length === 0) {
            console.log(`\x1b[32m[OK] ${file}\x1b[0m - Perfectly aligned.`);
        } else {
            console.log(`\x1b[33m[WARN] ${file}\x1b[0m`);
            if (missing.length > 0) {
                console.log(`  - \x1b[31m%d missing keys:\x1b[0m`, missing.length);
                missing.forEach(k => console.log(`    \x1b[90m${k}\x1b[0m`));
                totalDiscrepancies += missing.length;
            }
            if (extra.length > 0) {
                console.log(`  + \x1b[35m%d extra keys (not in master):\x1b[0m`, extra.length);
                extra.forEach(k => console.log(`    \x1b[90m${k}\x1b[0m`));
                totalDiscrepancies += extra.length;
            }
        }
        console.log('');
    });

    if (totalDiscrepancies === 0) {
        console.log('\x1b[42m\x1b[30m PASSED \x1b[0m All locale files are perfectly synchronized.');
    } else {
        console.log(`\x1b[41m\x1b[30m FAILED \x1b[0m Found ${totalDiscrepancies} total discrepancies.`);
    }
}

if (typeof require !== 'undefined' && require.main === module) {
    auditLocales();
}
