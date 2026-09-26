"""Builds index.html (the whole app in one file) from src/ and data/.  Usage: python build.py"""
import csv, json, re, os, datetime, zipfile, html as html_mod

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "data", "mkn10-cz.csv")                   # official MKN-10-CZ code list (UZIS, CC BY 4.0)
DOCX = os.path.join(ROOT, "data", "MKN-10_prakticky_lekar.docx")   # the doctor's cheat sheet (Word table: code | name)
TPL = os.path.join(ROOT, "src", "template.html")
ANALYSIS = os.path.join(ROOT, "src", "analysis.js")
OUT = os.path.join(ROOT, "index.html")

rows = [r for r in csv.DictReader(open(SRC, encoding="utf-8")) if not r["platnost_do"]]  # currently valid codes only
rows = [r for r in rows if r["kod_kapitola_cislo"] != "XX."]  # external causes V01-Y98 (24k codes, not used by GPs)

chapters = []
chap_idx = {}
for r in rows:
    k = r["kod_kapitola_cislo"]
    if k not in chap_idx:
        chap_idx[k] = len(chapters)
        chapters.append([k.rstrip("."), r["kod_kapitola_rozsah"], r["nazev_kapitola"]])

def clean(s):
    return s.replace("‚", ",").strip()  # the CSV uses U+201A instead of commas

codes = [r["kod_tecka"] for r in rows]
rows_by_code = {r["kod_tecka"]: r for r in rows}
code_set = set(codes)
has_children = set()
for c in codes:
    # parent of A00.0 is A00, parent of S82.20 is S82.2
    if "." in c:
        p = c[:-1].rstrip(".")
        if p in code_set:
            has_children.add(p)

data = [[r["kod_tecka"], clean(r["nazev"]), chap_idx[r["kod_kapitola_cislo"]], 1 if r["kod_tecka"] in has_children else 0] for r in rows]
for ch in chapters:
    ch[2] = clean(ch[2])

# typos in the cheat sheet: invalid code, or the name clearly belongs to another code
FIX = {
    "C23.9": "C32.9", "E61.22": "E61.2", "J04.9": "J04.0", "K58.9": "K58.8",
    "G47": "G47.0", "K90": "K90.0", "K14.9": "K14.6", "H43.9": "H43.3",
}
xml = zipfile.ZipFile(DOCX).read("word/document.xml").decode("utf-8")
common, alias = [], {}
for tr in re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S):
    cells = [html_mod.unescape("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", tc))).strip()
             for tc in re.findall(r"<w:tc>.*?</w:tc>", tr, re.S)]
    if len(cells) != 2 or not re.fullmatch(r"[A-Z]\d{2}(\.\d{1,2})?", cells[0]):
        continue
    code = FIX.get(cells[0], cells[0])
    if code not in common:
        common.append(code)
    alias[code] = (alias.get(code, "") + " " + cells[1]).strip()  # doctor's wording is searchable
missing = [c for c in common if c not in code_set]
assert not missing, f"codes in the cheat sheet that are not in MKN-10-CZ (add them to FIX): {missing}"

def roman(r):
    v = {"I": 1, "V": 5, "X": 10}
    r = r.rstrip(".")
    return sum(-v[ch] if i + 1 < len(r) and v[ch] < v[r[i + 1]] else v[ch] for i, ch in enumerate(r))
common.sort(key=lambda c: (roman(rows_by_code[c]["kod_kapitola_cislo"]), c))

# extra colloquial search words
for c, extra in {
    "E11.9": "cukrovka", "E11": "cukrovka", "E10": "cukrovka", "E10.9": "cukrovka",
    "I10": "vysoký tlak", "J11.1": "chřipka", "E66.9": "nadváha", "K59.0": "obstipace",
    "R42": "vertigo", "N30.0": "zánět močového měchýře", "J03.9": "angína",
    "A69.2": "borelióza", "A46": "růže", "B00.1": "opar rtu", "M77.1": "tenisový loket",
}.items():
    alias[c] = (alias.get(c, "") + " " + extra).strip()
for d in data:
    d.append(alias.get(d[0], ""))

html = open(TPL, encoding="utf-8").read()
html = (html
    .replace("/*ANALYSIS*/", open(ANALYSIS, encoding="utf-8").read())
    .replace("/*DATA*/", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    .replace("/*CHAPTERS*/", json.dumps(chapters, ensure_ascii=False, separators=(",", ":")))
    .replace("/*COMMON*/", json.dumps(common))
    .replace("{{COUNT}}", f"{len(data):,}".replace(",", " "))
    .replace("{{DATE}}", datetime.date.today().strftime("%d. %m. %Y")))
open(OUT, "w", encoding="utf-8", newline="\n").write(html)
print("codes", len(data), "common", len(common), "size", len(html.encode()) // 1024, "KB")
