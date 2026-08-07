"""
CRS social post image generator — branded 1200x1200 square (works on FB + LinkedIn).
Usage:
  python social_post_image.py --theme monday   --headline "Doing Business in Canada" --sub "Your 3-step compliance checklist" --out out.png
  python social_post_image.py --theme wednesday --headline "Registry News" --sub "What changed this week" --out out.png
  python social_post_image.py --theme friday    --headline "Certificate of Good Standing" --sub "Proof your corporation is active" --out out.png
Themes drive the accent motif (monday=maple leaf, wednesday=news, friday=document/seal).
No prices are ever drawn — captions/pricing are handled separately.
"""
import argparse
from PIL import Image, ImageDraw, ImageFont

NAVY=(0,61,91); NAVY2=(0,82,122); GOLD=(249,172,0); WHITE=(255,255,255); MUTE=(203,226,239); TEAL=(42,125,143)
SB="/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SS="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SSB="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
W=H=1200

def wrap(draw, text, font, maxw):
    words=text.split(); lines=[]; cur=""
    for w in words:
        t=(cur+" "+w).strip()
        if draw.textlength(t, font=font)<=maxw: cur=t
        else: lines.append(cur); cur=w
    if cur: lines.append(cur)
    return lines

def maple(d, cx, cy, s, color):
    pts=[(0,-1.05),(0.12,-0.62),(0.30,-0.72),(0.24,-0.44),(0.60,-0.50),(0.40,-0.20),(0.92,-0.10),
         (0.52,0.10),(0.66,0.30),(0.30,0.24),(0.34,0.62),(0.12,0.42),(0.10,0.95),(-0.10,0.95),
         (-0.12,0.42),(-0.34,0.62),(-0.30,0.24),(-0.66,0.30),(-0.52,0.10),(-0.92,-0.10),
         (-0.40,-0.20),(-0.60,-0.50),(-0.24,-0.44),(-0.30,-0.72),(-0.12,-0.62)]
    d.polygon([(cx+x*s, cy+y*s) for x,y in pts], fill=color)
    d.rectangle([cx-3, cy+0.42*s, cx+3, cy+1.05*s], fill=color)

def doc_stack(d, x, y, w, h, outline, accent):
    for i,(dx,dy) in enumerate([(40,50),(20,25),(0,0)]):
        d.rounded_rectangle([x+dx,y+dy,x+dx+w,y+dy+h], radius=16, outline=outline, width=4,
                            fill=NAVY2 if i==2 else None)
    lx=x+24; ly=y+30
    d.rounded_rectangle([lx,ly,lx+w-140,ly+14], radius=6, fill=accent)
    for k in range(4):
        d.rounded_rectangle([lx,ly+42+k*30,lx+w-60,ly+52+k*30], radius=5, fill=MUTE)

def people(d, x, y, scale):
    # two tasteful flat business-figure silhouettes (head + shoulders), not photorealistic
    for i,(ox,tone) in enumerate([(0,TEAL),(int(120*scale),GOLD)]):
        hx=x+ox; hy=y
        d.ellipse([hx, hy, hx+70*scale, hy+70*scale], fill=tone)
        d.pieslice([hx-25*scale, hy+70*scale, hx+95*scale, hy+200*scale], 180, 360, fill=tone)

def make(theme, headline, sub, out):
    img=Image.new("RGB",(W,H),NAVY); d=ImageDraw.Draw(img)
    for yy in range(H):
        t=yy/H; d.line([(0,yy),(W,yy)],fill=(int(NAVY[0]+(NAVY2[0]-NAVY[0])*t),int(NAVY[1]+(NAVY2[1]-NAVY[1])*t),int(NAVY[2]+(NAVY2[2]-NAVY[2])*t)))
    # wordmark
    fbrand=ImageFont.truetype(SSB,34)
    d.text((80,70),"CRS", font=ImageFont.truetype(SB,44), fill=WHITE)
    d.text((205,80),"| CORPORATE REGISTRY SERVICES", font=ImageFont.truetype(SSB,22), fill=MUTE)
    # theme motif top-right
    if theme=="monday":
        d.ellipse([975,75,1145,245], outline=GOLD, width=7)
        fca=ImageFont.truetype(SSB,30); tw=d.textlength("CANADA",font=fca)
        d.text((1060-tw/2,145),"CANADA",font=fca,fill=GOLD)
        d.text((1060-d.textlength(chr(9733),font=ImageFont.truetype(SS,36))/2,100),chr(9733),font=ImageFont.truetype(SS,36),fill=GOLD)
    elif theme=="wednesday":
        d.rounded_rectangle([980,80,1140,220], radius=14, outline=GOLD, width=5)
        for k in range(4): d.rounded_rectangle([1000,110+k*26,1120,120+k*26], radius=4, fill=MUTE)
        d.rectangle([1000,110,1075,140], fill=GOLD)
    else:
        d.ellipse([1000,90,1140,230], outline=GOLD, width=6)
        d.ellipse([1028,118,1112,202], outline=GOLD, width=3)
        fseal=ImageFont.truetype(SSB,44); d.text((1070-d.textlength(chr(10003),font=fseal)/2,132),chr(10003),font=fseal,fill=GOLD)
    # category chip
    cat={"monday":"DOING BUSINESS IN CANADA","wednesday":"REGISTRY NEWS","friday":"SERVICE SPOTLIGHT"}[theme]
    fchip=ImageFont.truetype(SSB,26)
    cw=d.textlength(cat,font=fchip)
    d.rounded_rectangle([80,300,80+cw+56,352], radius=26, fill=GOLD)
    d.text((108,310),cat,font=fchip,fill=NAVY)
    # headline
    fh=ImageFont.truetype(SB,76)
    lines=wrap(d, headline, fh, 1000)
    y=400
    for ln in lines:
        d.text((80,y),ln,font=fh,fill=WHITE); y+=92
    d.rectangle([84,y+6,320,y+18], fill=GOLD); y+=50
    # sub
    fs=ImageFont.truetype(SS,40)
    for ln in wrap(d, sub, fs, 980):
        d.text((80,y),ln,font=fs,fill=MUTE); y+=54
    # bottom motif: document stack + people
    doc_stack(d, 80, 860, 300, 240, GOLD, GOLD)
    people(d, 620, 900, 1.3)
    # footer
    d.rectangle([0,1150,W,1200], fill=GOLD)
    d.text((80,1158),"corporateregistryservices.ca  ·  All 13 Canadian jurisdictions", font=ImageFont.truetype(SSB,26), fill=NAVY)
    img.save(out); return out

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--theme",required=True,choices=["monday","wednesday","friday"])
    ap.add_argument("--headline",required=True)
    ap.add_argument("--sub",default="")
    ap.add_argument("--out",required=True)
    a=ap.parse_args()
    print(make(a.theme,a.headline,a.sub,a.out))
