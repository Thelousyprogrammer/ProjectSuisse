import os
import re
import sys
from deep_translator import GoogleTranslator
from concurrent.futures import ThreadPoolExecutor

LANGS = ['nl', 'fi', 'sv', 'el', 'no', 'mn', 'ar', 'ko', 'th', 'lo', 'hi']
LOCALES_DIR = "locales"

def protect_placeholders(text):
    placeholders = re.findall(r'\{.*?\}', text)
    temp_text = text
    for i, p in enumerate(placeholders):
        temp_text = temp_text.replace(p, f'__P{i}__')
    return temp_text, placeholders

def restore_placeholders(text, placeholders):
    for i, p in enumerate(placeholders):
        text = text.replace(f'__P{i}__', p).replace(f'__ P{i} __', p).replace(f'__p{i}__', p).replace(f'__ p{i} __', p)
    return text

def translate_line(line, translator):
    if line.strip() == '' or line.strip().startswith('#') or line.strip().startswith('['):
        return line
        
    match = re.match(r'^([\w\.\-]+)\s*=\s*"(.*)"\s*$', line)
    if match:
        key = match.group(1)
        val = match.group(2)
        
        val = val.replace('\\"', '"')
        if not val.strip():
            return line
            
        temp_text, placeholders = protect_placeholders(val)
        try:
            translated_temp = translator.translate(temp_text)
            final_val = restore_placeholders(translated_temp, placeholders)
        except Exception as e:
            final_val = val
            
        final_val = final_val.replace('"', '\\"')
        return f'{key} = "{final_val}"\n'
    return line

def translate_toml(lang_code):
    en_file = os.path.join(LOCALES_DIR, 'en.toml')
    target_file = os.path.join(LOCALES_DIR, f'{lang_code}.toml')
    
    with open(en_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    translator = GoogleTranslator(source='en', target=lang_code)
    
    print(f"Translating {lang_code}...", flush=True)
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        translated_lines = list(executor.map(lambda l: translate_line(l, translator), lines))
        
    with open(target_file, 'w', encoding='utf-8') as f:
        f.writelines(translated_lines)
        
    print(f"Finished {lang_code}.", flush=True)

for lang in LANGS:
    translate_toml(lang)
