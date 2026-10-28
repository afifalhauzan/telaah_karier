W=520
INK="#1f1f1d"; MUTED="#5f5e5a"; GRID="#e4e3df"
COL={"rendah":"#86b6ef","sedang":"#3987e5","tinggi":"#184f95","tv":"#b4b2ad"}
TXT={"rendah":INK,"sedang":"#ffffff","tinggi":"#ffffff","tv":INK}
F='font-family="Times New Roman, Liberation Serif, serif"'
o=[]
def t(x,y,s,size=15,anchor="start",fill=INK,weight="normal",italic=False):
    o.append(f'<text x="{x}" y="{y}" {F} font-size="{size}" text-anchor="{anchor}" fill="{fill}" font-weight="{weight}"{" font-style=\"italic\"" if italic else ""}>{s}</text>')
# panel a
y0=8
t(0,y0+14,"(a) Sebaran tingkat risiko per kelompok",15,weight="bold")
# legend
lx=0; ly=y0+34
for k,lab in [("rendah","Rendah"),("sedang","Sedang"),("tinggi","Tinggi"),("tv","Tanpa verdict")]:
    o.append(f'<rect x="{lx}" y="{ly-10}" width="11" height="11" rx="2" fill="{COL[k]}"/>'); t(lx+15,ly,lab,13.5,fill=MUTED); lx+=15+len(lab)*7+18
rows=[("Penipuan, teks","n = 92",{"rendah":0,"sedang":25,"tinggi":65,"tv":2}),
      ("Penipuan, poster","n = 81",{"rendah":1,"sedang":34,"tinggi":45,"tv":1}),
      ("Asli, teks","n = 92",{"rendah":68,"sedang":23,"tinggi":1,"tv":0})]
LX=118; BW=W-LX-4; BH=26; y=y0+52
for name,n,c in rows:
    tot=sum(c.values()); t(LX-8,y+12,name,14,"end"); t(LX-8,y+26,n,12,"end",MUTED)
    x=LX
    for k in ["rendah","sedang","tinggi","tv"]:
        v=c[k]
        if not v: continue
        w=BW*v/tot
        o.append(f'<rect x="{x:.1f}" y="{y}" width="{max(w-2,1):.1f}" height="{BH}" rx="3" fill="{COL[k]}"/>')
        pct=100*v/tot
        if w>34: t(x+w/2-1,y+18,f"{pct:.0f}%".replace(".",","),13.5,"middle",TXT[k],"bold")
        x+=w
    y+=BH+12
# panel b
y+=14
t(0,y,"(b) Metrik utama dan IK 95% (Wilson)",15,weight="bold"); y+=2
mets=[("Deteksi","penipuan → tinggi",63.6,56.2,70.4),("Recall, ambang longgar","penipuan → sedang/tinggi",97.7,94.2,99.1),
      ("Precision, ambang ketat","label tinggi benar penipuan",99.1,95.1,99.8),("Lolos kritis","penipuan → rendah",0.6,0.1,3.2),("Alarm palsu","asli → tinggi",1.1,0.2,5.9)]
PX=150; PW=W-PX-44; sx=lambda v: PX+PW*v/100
top=y+6
RH=34
for g in [0,25,50,75,100]:
    o.append(f'<line x1="{sx(g):.1f}" y1="{top}" x2="{sx(g):.1f}" y2="{top+RH*len(mets)}" stroke="{GRID}" stroke-width="1"/>')
    t(sx(g),top+RH*len(mets)+15,f"{g}%",12,"middle",MUTED)
for i,(a,b,v,lo,hi) in enumerate(mets):
    cy=top+RH*i+RH/2
    t(PX-8,cy-1,a,14,"end"); t(PX-8,cy+12,b,11.5,"end",MUTED)
    o.append(f'<line x1="{sx(lo):.1f}" y1="{cy}" x2="{sx(hi):.1f}" y2="{cy}" stroke="#184f95" stroke-width="2"/>')
    for e in (lo,hi): o.append(f'<line x1="{sx(e):.1f}" y1="{cy-5}" x2="{sx(e):.1f}" y2="{cy+5}" stroke="#184f95" stroke-width="2"/>')
    o.append(f'<circle cx="{sx(v):.1f}" cy="{cy}" r="5" fill="#184f95" stroke="#fff" stroke-width="2"/>')
    lab=f"{v:.1f}%".replace(".",",")
    if v>50: t(sx(lo)-8,cy+5,lab,13.5,"end",INK,"bold")
    else: t(sx(hi)+8,cy+5,lab,13.5,"start",INK,"bold")
H=top+RH*len(mets)+24
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="#fff"/>'+"".join(o)+'</svg>'
open("chart.svg","w").write(svg)
open("chart.html","w").write(f'<html><body style="margin:0;background:#fff">{svg}</body></html>')
print(W,H)
