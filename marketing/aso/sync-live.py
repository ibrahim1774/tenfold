"""Copy the LIVE App Store Connect text into locales/*.json (keeps headings/sublines).
Usage: python3 sync-live.py <vloc_live.json> [<info_live.json>]
vloc_live.json: {locale: appStoreVersionLocalization attributes}; info_live.json: {locale: appInfoLocalization attributes}."""
import json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
vloc = json.load(open(sys.argv[1]))
info = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
changed = []
for loc, v in sorted(vloc.items()):
    f = f'{D}/locales/{loc}.json'
    d = json.load(open(f)) if os.path.exists(f) else {}
    before = json.dumps(d, ensure_ascii=False)
    if loc in info:
        d['name'] = info[loc]['name']; d['subtitle'] = info[loc]['subtitle']
    for k in ('keywords', 'promotionalText', 'description'):
        d[k] = v[k]
    if v.get('whatsNew'): d['whatsNew'] = v['whatsNew']
    order = ['name', 'subtitle', 'keywords', 'promotionalText', 'description', 'whatsNew', 'headings', 'sublines']
    d = {k: d[k] for k in order if k in d} | {k: x for k, x in d.items() if k not in order}
    if json.dumps(d, ensure_ascii=False) != before: changed.append(loc)
    with open(f, 'w') as fh:
        fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(x, ensure_ascii=False)}' for k, x in d.items()) + '\n}\n')
print('synced', len(vloc), 'locales; changed:', ' '.join(changed))
