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
        
    print("\n--- Key Parity & Integrity Validation (Base: en.toml) ---")
    base_dict = parsed_locales["en.toml"]
    base_keys = set(base_dict.keys())
    print(f"Base en.toml keys count: {len(base_keys)}")
    
    total_issues = 0
    
    for filename, target_dict in parsed_locales.items():
        if filename == "en.toml":
            continue
        
        file_keys = set(target_dict.keys())
        missing_keys = base_keys - file_keys
        extra_keys = file_keys - base_keys
        
        # Check placeholders & leaks
        placeholder_issues = []
        token_leaks = []
        empty_keys = []
        
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
        
        has_file_issues = missing_keys or extra_keys or placeholder_issues or token_leaks or empty_keys
        
        if not has_file_issues:
            print(f"[OK] {filename}: All {len(file_keys)} keys match perfectly with full placeholder integrity.")
        else:
            total_issues += len(missing_keys) + len(extra_keys) + len(placeholder_issues) + len(token_leaks) + len(empty_keys)
            print(f"[WARN] {filename}:")
            if missing_keys:
                print(f"  - Missing {len(missing_keys)} keys: {', '.join(sorted(list(missing_keys))[:5])}{'...' if len(missing_keys) > 5 else ''}")
            if extra_keys:
                print(f"  + Extra {len(extra_keys)} keys: {', '.join(sorted(list(extra_keys))[:5])}{'...' if len(extra_keys) > 5 else ''}")
            if token_leaks:
                print(f"  ! Leaked translation tokens in {len(token_leaks)} keys: {', '.join([k for k, _ in token_leaks[:3]])}")
            if placeholder_issues:
                print(f"  ! Placeholder mismatches in {len(placeholder_issues)} keys: {', '.join([k for k, _, _ in placeholder_issues[:3]])}")
            if empty_keys:
                print(f"  ! Empty values in {len(empty_keys)} keys: {', '.join(empty_keys[:3])}")

    if total_issues == 0:
        print("\n[SUCCESS] All 22 locale files are 100% synchronized with en.toml!")
    else:
        print(f"\n[FAILURE] Found {total_issues} total integrity issue(s) across locales.")
        sys.exit(1)

if __name__ == "__main__":
    main()
