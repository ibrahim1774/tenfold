import sys,plistlib,urllib.parse,urllib.request
def hints(term, sf):
    u="https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term="+urllib.parse.quote(term)
    r=urllib.request.Request(u,headers={"X-Apple-Store-Front":sf})
    try: d=plistlib.loads(urllib.request.urlopen(r,timeout=15).read())
    except Exception as e: return ["ERR "+str(e)]
    return [h.get('term') for h in d.get('hints',[])]
if __name__=='__main__':
    sf=sys.argv[1]
    for t in sys.argv[2:]: print(t,'->',hints(t,sf)[:8])
