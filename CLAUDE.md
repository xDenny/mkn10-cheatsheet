# MKN-10: kontext projektu

Webová pomůcka pro **praktického lékaře**, kterou pro něj připravuje uživatel (Denis). Při zápisu z kontroly pacienta potřebuje rychle najít **kód diagnózy podle české MKN-10** a vložit ho do ambulantního programu. Dřív používal web Mediately, Word tabulku a ChatGPT. Komunikace s uživatelem probíhá **česky**.

- **Online:** https://xdenny.github.io/mkn10-cheatsheet/ (GitHub Pages z větve `main`, root, repozitář `xDenny/mkn10-cheatsheet`, veřejný)
- Celá aplikace je **jeden soubor `index.html`** (HTML + CSS + JS + data, ~1 MB). Žádný backend, funguje i offline otevřením souboru.

## Požadavky a rozhodnutí (dodržovat)

- **Bez AI a bez placených služeb.** Varianta s OpenAI API byla vyzkoušena a na přání odstraněna (doktor nechce platit za API zvlášť, přihlášení účtem ChatGPT do cizí aplikace nejde). Rozbor textu je čistě heuristický a offline.
- **Jen platné české kódy (MKN-10-CZ, ÚZIS).** Příklady „ideálních výsledků" od uživatele generoval ChatGPT a obsahují kódy z americké ICD-10-CM, které v ČR neexistují (R53.1, Z87.09, Z87.81, Z87.828, Z98.89, Z96.612, Z90.49, Z86.15, G40.89, M17.12, D18.03...). Neimplementovat je, nabízet nejbližší platný český kód a uživatele na to upozornit.
- Nic se nesmí odesílat mimo prohlížeč (rozbor textu s údaji pacienta běží lokálně).
- Vše na jedné stránce, **bez záložek** (uživatel si výslovně nepřál přepínat). Jedno pole: krátký dotaz = hledání, vložený delší text = rozbor.
- Kategorie častých diagnóz: rozbalovací, výchozí stav sbalené, **pastelové barvy v pevně promíchaném pořadí** (ne duha).
- Oblíbené: na širokém okně (od 1100 px) **pevný panel vlevo** jako seznam, na užším sbalitelný seznam nad obsahem (výchozí sbalený). Žádné tagy pod vyhledáváním. V panelu přepínač **seznam / štítky** (`mkn10.favView`, výchozí seznam), štítky roztáhnou panel do volného místa (max 480 px). Doktor zkouší, která varianta mu vyhovuje. **Export / Import** přes base64 kód (`MKN1:` + kódy), import oblíbené **nahradí**.
- „Naposledy použité": max **5** položek, nová nahoře, nejstarší vypadne.
- Název webu je jen **„MKN-10"** (bez „tahák").
- Světlý / tmavý režim s přepínačem (výchozí podle systému, volba se pamatuje).
- Výsledek rozboru ve dvou pohledech: „Nejlepší shody" (výchozí, kompaktní) a „Všechny možnosti".
- „st.p.", „stp.", „St. p.", „s/p" = **stav po**: nikdy se nevyhledává, jen označí část jako anamnézu a začne novou část.
- Globální pravidla uživatele (viz jeho ~/.claude/CLAUDE.md) platí, mimo jiné: **žádné dlouhé pomlčky (em dash, en dash)** v textech, jen obyčejný spojovník „-".

## Struktura

| Cesta | Co to je |
|---|---|
| `index.html` | **Vygenerovaný výstup**, needitovat ručně. Tohle se nasazuje. |
| `build.py` | Generátor: načte data, opravy kódů, lidové názvy, vloží vše do šablony → `index.html` |
| `src/template.html` | HTML, CSS a JS aplikace (vyhledávání, oblíbené, historie, kategorie, tmavý režim, UI rozboru). Zástupné značky `/*DATA*/`, `/*CHAPTERS*/`, `/*COMMON*/`, `/*ANALYSIS*/`, `{{COUNT}}`, `{{DATE}}` |
| `src/analysis.js` | **Rozbor volného textu** a **slovník zkratek/synonym** (vkládá se do šablony) |
| `data/mkn10-cz.csv` | Oficiální číselník MKN-10-CZ (NZIP / ÚZIS, CC BY 4.0). Zdroj: https://data.mzcr.cz/data/distribuce/463/Otevrena-data-OIS-12-03-ciselnik-mkn-10-cz.csv |
| `data/MKN-10_prakticky_lekar.docx` | Doktorův seznam častých diagnóz (tabulka kód / název, 393 unikátních kódů) → sekce „Časté v ambulanci PL" |
| `tests/run.js` | Regresní test rozboru a hledání proti `index.html` |
| `tests/examples/*.txt`, `tests/snapshot.txt` | **Jen lokálně** (v `.gitignore`): skutečné anonymizované zápisy pacientů, repozitář je veřejný |

## Práce s projektem

```bash
python build.py            # po každé změně v src/ nebo data/ (vypíše počet kódů a velikost)
node tests/run.js          # porovná rozbor příkladů se snapshotem, exit 1 při rozdílu
node tests/run.js --show   # jen vypíše aktuální výsledky
node tests/run.js --update # přijme aktuální výstup jako nový snapshot (po záměrné změně)
```

Nasazení: `git add -A && git commit && git push` do `main`, GitHub Pages se aktualizuje do ~1 min (doktor případně Ctrl+F5). Push jen na pokyn uživatele.

Vizuální kontrola: Edge headless (`"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --screenshot=... --window-size=1000,1300 file:///.../index.html`). Pro testovací stav stačí do kopie `index.html` před `<script>\nconst DATA` vložit skript nastavující `localStorage`, případně na konec (`$q.focus();\nsetTimeout` ...) vložit `$q.value = "..."; autosize(); render();`.

## Data

- Z číselníku se berou jen **platné** kódy (`platnost_do` prázdné) a **bez kapitoly XX** (vnější příčiny V01-Y98, 24 tis. kódů, praktik je nepoužívá). Výsledek: 14 454 kódů, z toho 1 999 „skupin" (kód má podkódy, v UI štítek „skupina").
- Názvy v CSV používají znak U+201A místo čárky, `build.py` ho nahrazuje.
- **Opravy v doktorově seznamu** (`FIX` v `build.py`): neexistující kódy C23.9→C32.9 (hrtan), E61.22→E61.2, J04.9→J04.0, K58.9→K58.8 (K58.9 zrušen 31. 12. 2020), a kódy, jejichž název ve Wordu patří jinému kódu: G47→G47.0, K90→K90.0, K14.9→K14.6, H43.9→H43.3. Uživatel o nich ví, Word samotný se neměnil.
- Názvy z Wordu a lidové názvy (cukrovka, borelióza, růže...) jsou **skrytá synonyma pro hledání** (5. pole v DATA).
- Nový Word od doktora: nahradit `data/MKN-10_prakticky_lekar.docx`, spustit `build.py`. Když assert nahlásí neexistující kód, přidat opravu do `FIX` a uživatele informovat.

## Jak funguje vyhledávání (`src/template.html`)

- Normalizace: malá písmena, bez diakritiky; hledá se podle kódu (s tečkou i bez) a slov názvu + synonym.
- Řazení: přesný kód > začátek kódu > začátek slova > podřetězec; bonus pro časté (doktorův seznam) a oblíbené.
- Když nic nenajde (překlep, skloňování), zobrazí se „nejpodobnější kódy" z rozboru textu.
- Oblíbené, historie, stav přepínačů: `localStorage` (klíče `mkn10.*`), jen v daném prohlížeči. Starší verze ukládala `mkn10.openai.key`, aplikace ho při startu maže.

## Jak funguje rozbor textu (`src/analysis.js`)

1. **Rozdělení na části** (`segment`): nový řádek, `,`, `;`, `Štítek:` (Operace:, Úrazy:, OA: → části označené jako anamnéza), slovo s velkým počátečním písmenem, vyšetření (USG, RTG, EEG...), velkými písmeny psaná diagnostická zkratka (VAS, PNP), „cum". Nedělí se po předložce, po „st.p." (další slovo patří k němu), před lokalizací (Thp, LSp), před měsícem nebo „Normální".
2. **Přeskočení**: „bpn", „bez patologie", „bez nálezu", „v normě", „bez abusu".
3. **Slova → tokeny**: `fold` sjednotí pravopis (c/k, s/z, y/i, th, ph, zdvojená písmena: tonsilitida = tonzilitida), `stem` usekne koncovku (skloňování). Stop slova (`STOP`), zkratky (`ABBR`, celé slovo), synonyma (`SYN`, začátek slova, vyhrává nejdelší klíč). Za „při / kvůli / během" jsou slova jen okolnost. `MODS` = jen upřesnění (lokalizace, akutní, ruka...), samy kód nevyvolají.
4. **Skóre kódu**: součet vzácnosti shodných slov (IDF), pokrytí názvu, bonus za celé slovo, za doktorův seznam (i nadřazený kód), za „NS"; postih za vrozené / zhoubné / novotvar bez zmínky v textu, za rozpor horní/dolní končetina, za „Následky" bez anamnézy. Překlepy: pokud slovo nic nenajde, zkusí se editační vzdálenost 1-2 (`fuzzyLookup`).
5. **Anamnéza** (st.p., v dětství, anamn., štítky): před nejlepší shodu se přidá kód osobní anamnézy dle kapitoly (`HISTORY_CODE`, návykové látky F1x → Z86.4). Stav po zlomenině pojmenované kosti → kód následků (`seq`, např. radius → T92.1, femur → T93.1). Stav po úrazu penalizuje čerstvá poranění (S).
6. **Nápovědy**: zkratky/synonyma s `code` (HT → I10, APPE → Z90.4, TEP/CKP → Z96.6...) se nabídnou první. Kód napsaný přímo v textu vyhrává vždy.
7. Části bez obsahu (jen šum nebo jen upřesnění) se nezobrazují.

**Slovník zkratek** (`ABBR_RAW`, 107 položek) se v aplikaci nezobrazuje (seznam dole na stránce uživatel nechtěl), zkratka se jen vysvětlí u výsledku („ICHS = ischemická choroba srdeční"). Při přidávání: `t` = význam (zobrazí se), `x` = slova pro hledání (výchozí `t`), `code` = obvyklý kód (ověřit v `data/mkn10-cz.csv`!), `mod` = jen upřesnění. Pozor na kolize: ABBR klíče se porovnávají jen bez diakritiky (ne přes `fold`, jinak CKP = Cp, CC = předložka „k"); vyhnout se zkratkám shodným s běžnými slovy (TEN, Ca, Tu, RE, C, L byly odstraněny).

**Postup ladění nového příkladu od uživatele:** uložit text do `tests/examples/exN.txt`, `node tests/run.js --show`, projít chybné řádky, upravit `src/analysis.js` (nejčastěji slovník), `python build.py`, `node tests/run.js` (zkontrolovat, že se nerozbily starší příklady), `--update`. Kódy z „ideálního výsledku" vždy ověřit v CSV (bývají americké).

## Známé slabiny / otevřené body

- „hyperkinetická cirkulace" → F90.9 (špatně, jde o ADHD kód), „EEG * poslední záchvat" → F41.0. Čeká na informaci, jaký kód doktor chce.
- Hemangiom jater → D18.09/D18.08 (správně je spíš D18.08), sludge → K82 (skupina).
- „st.p. amputaci palce" → T93.6 (šlo by Z89.4).
- Rozbor je porovnání slov, ne porozumění; nesmyslné části mohou dostat nesmyslný kód.

## Historie

- Původně Word dokument se ~115 častými kódy (moje verze, názvy nebyly oficiální); doktor ho rozšířil na 257 řádků, v září 2026 na 394 řádků (přibyly hlavně kapitoly L, M, N, O, R, T, U, Z; ubyly Z09.8 a Z76.0) (`data/MKN-10_prakticky_lekar.docx`).
- Webová aplikace: vyhledávání → oblíbené/historie → AI režim přes OpenAI API (odstraněn) → offline rozbor textu sloučený do hlavního pole → pastelové kategorie, přepínač pohledů, slovník zkratek, tmavý režim → GitHub Pages → přejmenování na „MKN-10", zobrazený slovník zkratek odstraněn.
