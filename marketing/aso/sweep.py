import json,sys,time,urllib.parse,urllib.request
sys.path.insert(0,'/private/tmp/claude-501/-Users-ibrahim-Library-Mobile-Documents-com-apple-CloudDocs-Desktop-AI-Projects-tenfold-tenfold/ba65ad4e-3dcb-404e-b2fb-8b51c5d4d0ee/scratchpad/aso')
from hints import hints
country, sf, out = sys.argv[1], sys.argv[2], sys.argv[3]
terms=[l.strip() for l in open(sys.argv[4]) if l.strip()]
res={}
for t in terms:
    # autosuggest evidence: is the exact term suggested when typing it, and at what position; also when typing a shorter prefix
    full=hints(t,sf)
    words=t.split()
    pre=hints(t[:max(4,len(t)//2)],sf)
    pos_full = full.index(t)+1 if t in full else None
    pos_pre = pre.index(t)+1 if t in pre else None
    # apps using it in title (iTunes search, top 200)
    u=f"https://itunes.apple.com/search?term={urllib.parse.quote(t)}&country={country}&entity=software&limit=200"
    try:
        d=json.load(urllib.request.urlopen(u,timeout=20)); apps=d.get('results',[])
    except Exception as e: apps=[]
    in_title=sum(1 for a in apps if t.lower() in a.get('trackName','').lower())
    top=[(a['trackName'][:40], a.get('userRatingCount',0)) for a in apps[:5]]
    res[t]={'suggested_when_typed':pos_full,'suggested_from_prefix':pos_pre,'completions':full[:6],'apps_in_title_top200':in_title,'results':len(apps),'top5':top}
    print(t,'| typed:',pos_full,'| prefix:',pos_pre,'| in-title:',in_title,'| top:',top[0] if top else None, flush=True)
    time.sleep(3.2)
json.dump(res,open(out,'w'),ensure_ascii=False,indent=1)
