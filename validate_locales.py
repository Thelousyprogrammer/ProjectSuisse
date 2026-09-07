import os
import glob
import sys
import re

# Try importing TOML parser
try:
    import tomllib
    parser = tomllib
    mode = "rb"
except ImportError:
    try:
        import toml
        parser = toml
        mode = "r"
    except ImportError:
        print("No TOML library available. Please install 'toml' or 'tomllib'.")
        sys.exit(1)

# Whitelist of keys whose English value is legitimately identical across most/all languages
UNIVERSAL_ALLOWED_KEYS = {
    "meta.app_title",
    "faq.faq",
    "faq.faq_title",
    "ui.na_short",
    "ui.day_mon_short",
    "ui.day_fri_short",
    "ui.chart_dist_less_4",
    "ui.chart_dist_9_plus",
    "status_indicators.status_normal",
    "status_indicators.status_optimal",
    "charts_general.telemetry_eff_pct",
    "charts_general.chart_radar_mon",
    "charts_general.chart_radar_thu",
    "charts_general.chart_radar_fri",
    "charts_general.chart_radar_sat",
    "charts_general.chart_energy_elite",
    "charts_general.chart_energy_overdrive",
    "storage_management.idb_none",
    "exports.not_available",
    "exports.timezone_label",
    "exports.start_label",
    "exports.delta_label",
    "exports.filter_label",
    "exports.placeholder_export_filename",
    "calendar.month_year_format",
    "calendar.export_format",
    "calendar.quality_standard",
    "calendar.quality_ultra",
    "hardware.gpu",
    "hardware.not_applicable",
    "telemetry_dashboard.telemetry_momentum",
    "telemetry_dashboard.telemetry_index",
    "telemetry_dashboard.telemetry_streak_8h",
    "telemetry_dashboard.summary_delta",
    "telemetry_dashboard.summary_trend",
}

def is_theme_key(k: str) -> bool:
    return k.startswith("themes.theme_")

def is_month_key(k: str) -> bool:
    return k.startswith("calendar.month_")

def flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def extract_placeholders(text):
    if not isinstance(text, str):
        return set()
    return set(re.findall(r'\{[^{}]+\}', text))

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
        
    script_dir = os.path.dirname(os.path.abspath(__file__))
    locales_dir = os.path.join(script_dir, "locales")
    files = sorted(glob.glob(os.path.join(locales_dir, "*.toml")))
    
    strict_mode = "--strict" in sys.argv
    check_untranslated_mode = "--check-untranslated" in sys.argv or strict_mode
    
    if not files:
        print(f"No TOML files found in {locales_dir}")
        return

    print(f"Found {len(files)} locale files.")
    
    parsed_locales = {}
    has_errors = False
    
    # 1. Syntax Validation
    for filepath in files:
        filename = os.path.basename(filepath)
        try:
            kwargs = {}
            if mode == "r":
                kwargs["encoding"] = "utf-8"
            with open(filepath, mode, **kwargs) as f:
                data = parser.load(f)
            parsed_locales[filename] = flatten_dict(data)
            print(f"[OK] {filename}: Syntax OK ({len(parsed_locales[filename])} keys)")
        except Exception as e:
            print(f"[ERROR] {filename}: Syntax Error - {e}")
            has_errors = True

    if has_errors:
        print("\nFix syntax errors before checking for missing keys.")
        sys.exit(1)
        
    if "en.toml" not in parsed_locales:
        print("en.toml not found, cannot compare keys.")
        sys.exit(1)
        
    print("\n--- Key Parity, Integrity & Semantic Alignment Validation (Base: en.toml) ---")
    base_dict = parsed_locales["en.toml"]
    base_keys = set(base_dict.keys())
    print(f"Base en.toml keys count: {len(base_keys)}")
    
    # Pre-compute semantic collections for collision detection
    month_keys = {f"calendar.month_{i}" for i in range(1, 13)}
    weekday_keys = {
        "calendar.mon", "calendar.tue", "calendar.wed", "calendar.thu", "calendar.fri", "calendar.sat", "calendar.sun",
        "ui.day_mon_short", "ui.day_tue_short", "ui.day_wed_short", "ui.day_thu_short", "ui.day_fri_short", "ui.day_sat_short", "ui.day_sun_short"
    }
    
    sibling_groups = [
        [f"identity_scores.identity_{i}" for i in range(1, 6)],
        ["navigation.less", "navigation.more"]
    ]
    
    total_integrity_issues = 0
    total_untranslated_warnings = 0
    total_misaligned_issues = 0
    
    for filename, target_dict in parsed_locales.items():
        if filename == "en.toml":
            continue
        
        file_keys = set(target_dict.keys())
        missing_keys = base_keys - file_keys
        extra_keys = file_keys - base_keys
        
        placeholder_issues = []
        token_leaks = []
        empty_keys = []
        untranslated_keys = []
        misaligned_keys = []
        
        target_months = {target_dict[k].strip().lower() for k in month_keys if k in target_dict and isinstance(target_dict[k], str)}
        target_weekdays = {target_dict[k].strip().lower() for k in weekday_keys if k in target_dict and isinstance(target_dict[k], str)}
        
        for k in base_keys.intersection(file_keys):
            ev = base_dict[k]
            tv = target_dict[k]
            
            if isinstance(tv, str):
                if not tv.strip():
                    empty_keys.append(k)
                leaks = re.findall(r'__[^_\s]+__', tv)
                if leaks:
                    token_leaks.append((k, leaks))
            
            if isinstance(ev, str) and isinstance(tv, str):
                e_ph = extract_placeholders(ev)
                t_ph = extract_placeholders(tv)
                if e_ph != t_ph:
                    placeholder_issues.append((k, sorted(list(e_ph)), sorted(list(t_ph))))
                
                # Check for untranslated text
                if tv.strip().lower() == ev.strip().lower():
                    if k not in UNIVERSAL_ALLOWED_KEYS and not is_theme_key(k) and not is_month_key(k):
                        if len(ev.strip()) > 3:
                            untranslated_keys.append((k, tv))
                            
                # Check for misaligned category collisions:
                # A: Non-month key assigned a month name
                tv_clean = tv.strip().lower()
                if k not in month_keys and tv_clean in target_months and len(tv_clean) > 3:
                    en_val = ev.strip().lower()
                    if not any(m in en_val for m in ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]):
                        misaligned_keys.append((k, tv, "Month name collision"))
                        
                # B: Non-weekday key assigned a weekday name
                if k not in weekday_keys and tv_clean in target_weekdays and len(tv_clean) > 3:
                    en_val = ev.strip().lower()
                    if not any(d in en_val for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
                        misaligned_keys.append((k, tv, "Weekday name collision"))

        # C: Check sibling group collisions (e.g. identity_1 duplicate of identity_2, less duplicate of more)
        for grp in sibling_groups:
            seen = {}
            for k in grp:
                if k in target_dict and isinstance(target_dict[k], str):
                    val = target_dict[k].strip().lower()
                    if val in seen:
                        prev_k = seen[val]
                        if base_dict.get(k) != base_dict.get(prev_k):
                            misaligned_keys.append((k, target_dict[k], f"Duplicate sibling of {prev_k}"))
                    seen[val] = k
                    
        has_file_issues = missing_keys or extra_keys or placeholder_issues or token_leaks or empty_keys or misaligned_keys or (check_untranslated_mode and untranslated_keys)
        
        file_issues_count = len(missing_keys) + len(extra_keys) + len(placeholder_issues) + len(token_leaks) + len(empty_keys) + len(misaligned_keys)
        if check_untranslated_mode:
            file_issues_count += len(untranslated_keys)
            
        total_integrity_issues += file_issues_count
        total_untranslated_warnings += len(untranslated_keys)
        total_misaligned_issues += len(misaligned_keys)
        
        if not has_file_issues and len(untranslated_keys) == 0:
            print(f"[OK] {filename}: All {len(file_keys)} keys match perfectly with full placeholder, semantic, and translation integrity.")
        else:
            status = "[ERROR]" if (file_issues_count > 0 and (missing_keys or extra_keys or misaligned_keys or placeholder_issues)) else "[WARN]"
            print(f"{status} {filename}:")
            if missing_keys:
                print(f"  - Missing {len(missing_keys)} keys: {', '.join(sorted(list(missing_keys))[:5])}{'...' if len(missing_keys) > 5 else ''}")
            if extra_keys:
                print(f"  + Extra {len(extra_keys)} keys: {', '.join(sorted(list(extra_keys))[:5])}{'...' if len(extra_keys) > 5 else ''}")
            if misaligned_keys:
                print(f"  ! Misaligned strings in {len(misaligned_keys)} keys: {', '.join([f'{k} ({r})' for k, _, r in misaligned_keys[:3]])}")
            if placeholder_issues:
                print(f"  ! Placeholder mismatches in {len(placeholder_issues)} keys: {', '.join([k for k, _, _ in placeholder_issues[:3]])}")
            if token_leaks:
                print(f"  ! Leaked translation tokens in {len(token_leaks)} keys: {', '.join([k for k, _ in token_leaks[:3]])}")
            if empty_keys:
                print(f"  ! Empty values in {len(empty_keys)} keys: {', '.join(empty_keys[:3])}")
            if untranslated_keys:
                print(f"  * Untranslated English in {len(untranslated_keys)} keys: {', '.join([k for k, _ in untranslated_keys[:3]])}{'...' if len(untranslated_keys) > 3 else ''}")

    if total_integrity_issues == 0:
        if total_untranslated_warnings > 0:
            print(f"\n[SUCCESS] All 22 locale files passed structural and semantic alignment validation! ({total_untranslated_warnings} untranslated key warnings noted across non-audited locales)")
        else:
            print("\n[SUCCESS] All 22 locale files are 100% synchronized and translated against en.toml!")
    else:
        print(f"\n[FAILURE] Found {total_integrity_issues} total integrity issue(s) (including {total_misaligned_issues} misaligned strings) across locales.")
        sys.exit(1)

if __name__ == "__main__":
    main()
