import json,glob,os,re,sys
D=os.path.dirname(os.path.abspath(__file__))
en=json.load(open(f'{D}/locales/en-US.json'))
LOCALES="ar-SA bn-BD ca cs da de-DE el en-AU en-CA en-GB es-ES es-MX fi fr-CA fr-FR gu-IN he hi hr hu id it ja kn-IN ko ml-IN mr-IN ms nl-NL no or-IN pa-IN pl pt-BR pt-PT ro ru sk sl-SI sv ta-IN te-IN th tr uk ur-PK vi zh-Hans zh-Hant".split()
LIM={'name':30,'subtitle':30,'keywords':100,'promotionalText':170,'description':4000}
ATOMS=['https://ibrahim1774.github.io/tenfold/terms.html','https://ibrahim1774.github.io/tenfold/privacy.html','iPhone']
BAN=re.compile(r'\b(free|trial|gratis|gratuit|kostenlos)\b',re.I)
problems=0; missing=[]
for loc in LOCALES:
    f=f'{D}/locales/{loc}.json'
    if not os.path.exists(f): missing.append(loc); continue
    try: d=json.load(open(f))
    except Exception as e: print(loc,'BAD JSON',e); problems+=1; continue
    p=[]
    for k,l in LIM.items():
        if k not in d: p.append(f'missing {k}')
        elif len(d[k])>l: p.append(f'{k} {len(d[k])}>{l}')
        elif not d[k].strip(): p.append(f'{k} empty')
    for a in ATOMS:
        if a not in d.get('description',''): p.append(f'atom missing: {a[:30]}')
    if not loc.startswith('en'):
        for k in ['subtitle','promotionalText','description']:
            if d.get(k)==en[k]: p.append(f'{k} same as English')
    if '—' not in d.get('name','') and '-' not in d.get('name',''): p.append('name has no "Descriptor — Brand" shape')
    if re.search(r'caption|subtit',(d.get('name','')+d.get('subtitle','')+d.get('keywords','')),re.I): p.append('captions word in name/subtitle/keywords')
    if BAN.search(d.get('description','')+d.get('promotionalText','')): p.append('pricing word')
    kw=[w.strip().lower() for w in d.get('keywords','').split(',') if w.strip()]
    if ', ' in d.get('keywords',''): p.append('space after comma in keywords')
    namesub=(d.get('name','')+' '+d.get('subtitle','')).lower()
    dup=[w for w in kw if w and w in namesub]
    if dup: p.append(f'keyword repeats name/subtitle: {dup}')
    if len(d.get('headings',[]))!=7 or any(len(h)!=2 for h in d.get('headings',[])): p.append('headings not 7 pairs')
    if len(d.get('sublines',[]))!=7: p.append('sublines not 7')
    print(f"{loc:8} name {len(d.get('name','')):2} sub {len(d.get('subtitle','')):2} kw {len(d.get('keywords','')):3} promo {len(d.get('promotionalText','')):3} desc {len(d.get('description','')):4}  "+('OK' if not p else 'PROBLEM: '+'; '.join(p)))
    problems+=len(p)
print('missing:',missing); print('problems:',problems)
