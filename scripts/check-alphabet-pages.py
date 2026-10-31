"""check-alphabet-pages.py - which alphabet pages are stale or break the writing rules.

    check-alphabet-pages.py <alphabet> <page-locales>      e.g.  ro en,ro,de,ru,it,es,fr,hu,pt   |   de en

Prints, per page language, how many entries fail and the list of codes (ENTRIES line, ready for
generate-alphabet-content.py --code). A page fails when it is missing, has backticks/bold, a (word) /ipa/
pair that does not match the entry facts, lost accents/apostrophes, or glosses a word with itself.
"""
import importlib.util,sys,json,re,glob,os,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0,str(ROOT/'scripts'))
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts'/'generate-alphabet-content.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
PAIR=re.compile(r"\(([^()/\n]+)\)\s*(/[^/\n]+/)")
def stale_codes(lang,locs):
    d=json.load(open(f'src/data/alphabets/{lang}.json',encoding='utf8'))
    out=collections.defaultdict(list)
    for e in d['letters']+d['groups']:
        facts=g.entry_words(e)
        for l in locs:
            pages=(e.get('sections') or {}).get(l) or {}
            text=' '.join(p.get('text','') for p in pages.values())
            bad = (not text) or '`' in text or '**' in text
            for w,ipa in PAIR.findall(text):
                known=facts.get(w.strip().lower())
                if known is None or ipa not in known: bad=True
            if text and (g.diacritic_problems('x',l,text) or g.circular_gloss_problems('x',text)): bad=True
            if bad: out[l].append(e['code'])
    return out
if __name__=='__main__':
    langs=sys.argv[1].split(','); locs=sys.argv[2].split(',')
    for lang in langs:
        o=stale_codes(lang,locs)
        print(lang,{l:len(v) for l,v in o.items()}, 'ENTRIES', ','.join(sorted({c for v in o.values() for c in v})))
