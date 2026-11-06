#!/usr/bin/env python3
"""Adds JSDoc @param types to un-annotated function declarations in a script.
Types come from the parameter's default value or from TYPES below (by parameter name).
Unknown names get `any` and are reported so they can be tightened by hand.
Usage: python3 tools/annotate-params.py public/scripts/api-client.js [--dry]"""
import re, sys
TYPES = {
  "email":"string","password":"string","reason":"string","id":"string","key":"string","token":"string","theme":"string","skin":"string",
  "sessionId":"string","accessToken":"string","confirmation":"string","currentPassword":"string","newPassword":"string","poId":"string",
  "path":"string","next":"boolean","g":"CanvasRenderingContext2D","x":"number","y":"number","w":"number","h":"number","r":"number","bx":"number","by":"number","bw":"number","bh":"number","mag":"number","frames":"number","dt":"number","v":"number","phase":"number","crouch":"boolean","volume":"number","fallback":"string","file":"string","prefix":"string","sectionId":"string","gross":"number","value":"any","payable":"Record<string, any>","keys":"string[]","explicitKeys":"Record<string, any> | undefined","cleaned":"Record<string, any>","before":"string | null","limit":"number","action":"string","send":"() => Promise<any>","nextData":"Record<string, any>","payload":"Record<string, any>","ref":"Record<string, any>","value":"any","type":"string","name":"string","title":"string","message":"string","section":"string","record":"string","text":"string","label":"string",
  "selector":"string","code":"string","branch":"string","client":"string","detail":"string","tone":"string","status":"string","module":"string",
  "delta":"number","score":"number","index":"number","qty":"number","count":"number","amount":"number","revision":"number | null",
  "disabled":"boolean","granted":"boolean","open":"boolean",
  "lines":"any[]","rows":"any[]","list":"any[]","items":"any[]","entries":"any[]",
  "records":"Record<string, any[]>","meta":"Record<string, any>","params":"Record<string, any>","options":"Record<string, any>","values":"Record<string, any>",
  "po":"ClientPO","sale":"Sale","stock":"StockRow","user":"AppUser","employee":"Employee","notice":"AppNotification","request":"PaymentRequest",
  "el":"AnyEl","element":"AnyEl","node":"AnyEl","row":"AnyEl","button":"AnyEl","input":"AnyEl","form":"AnyEl","event":"Event","root":"ParentNode",
}
def split_params(s):
    out=[];depth=0;cur=""
    for ch in s:
        if ch in "([{": depth+=1
        if ch in ")]}": depth-=1
        if ch=="," and depth==0: out.append(cur.strip());cur=""
        else: cur+=ch
    if cur.strip(): out.append(cur.strip())
    return out
def type_for(p, unknown):
    m=re.match(r"^([\w$]+)\s*=\s*(.*)$",p,re.S)
    name,default=(m.group(1),m.group(2).strip()) if m else (p,None)
    opt = default is not None
    if default is not None:
        if default in ("true","false"): t="boolean"
        elif re.match(r"^-?\d+(\.\d+)?$",default): t="number"
        elif re.match(r'^(".*"|\'.*\'|`.*`)$',default): t="string"
        elif default=="[]": t=TYPES.get(name,"any[]") if TYPES.get(name,"").endswith("[]") else "any[]"
        elif default=="{}": t="Record<string, any>"
        elif default=="null": t=(TYPES.get(name) or "any"); t = t if t=="any" else f"{t} | null"
        else: t=TYPES.get(name,"any")
    else:
        t=TYPES.get(name)
        if t is None: t="any"; unknown.append(name)
    return name,t,opt
def main(path,dry):
    L=open(path,encoding="utf-8").read().split("\n"); out=[]; n=0; unknown=[]
    for i,l in enumerate(L):
        m=re.match(r"^(\s*)((?:async )?function\*? [\w$]+)\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\{",l)
        if m and m.group(3).strip() and not (out and out[-1].rstrip().endswith("*/")):
            params=split_params(m.group(3)); tags=[]; unk=[]
            for p in params:
                if p.startswith("{") or p.startswith("["):
                    # destructured: build object type from names (with defaults)
                    inner=p[1:p.rindex("}" if p.startswith("{") else "]")]
                    if p.startswith("{"):
                        fields=[]
                        for part in split_params(inner):
                            nm,t,opt=type_for(part,unk)
                            nm=nm.split(":")[0].strip()
                            fields.append(f"{nm}{'?' if opt else ''}: {t}")
                        tags.append("@param {{ "+", ".join(fields)+" }} [options]" if "=" in p.split("}")[-1] else "@param {{ "+", ".join(fields)+" }} options")
                    continue
                if p.startswith("..."):
                    tags.append(f"@param {{...any}} {p[3:]}"); continue
                nm,t,opt=type_for(p,unk)
                tags.append(f"@param {{{t}}} [{nm}]" if opt else f"@param {{{t}}} {nm}")
            unknown+= [f"{path}:{i+1} {m.group(2)} -> {u}" for u in unk]
            out.append(f"{m.group(1)}/** {' '.join(tags)} */"); n+=1
        out.append(l)
    print(f"{path}: annotated {n} functions; {len(unknown)} unknown param names")
    for u in unknown: print("  ?",u)
    if not dry: open(path,"w",encoding="utf-8").write("\n".join(out))
if __name__=="__main__": main(sys.argv[1],"--dry" in sys.argv)
