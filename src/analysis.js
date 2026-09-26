// ---------- text analysis: offline matching of free-text diagnoses ----------
// Everything below is a heuristic: split the text into phrases, expand abbreviations,
// then score codes by how many (and how rare) words of the phrase they share.

// Makes Czech/Latin spelling variants compare equal: tonsilitida = tonzilitida,
// skoliosa = skolióza, cysta = kysta, fraktura = fractura.
const fold = s => norm(s)
  .replace(/ch/g, "#").replace(/ph/g, "f").replace(/th/g, "t").replace(/c/g, "k").replace(/#/g, "ch")
  .replace(/y/g, "i").replace(/z/g, "s").replace(/w/g, "v").replace(/x/g, "ks")
  .replace(/([a-z])\1/g, "$1");
const stem = w => w.length <= 3 ? w
  : w.length === 4 ? (/[aeiou]$/.test(w) ? w.slice(0, 3) : w)
  : w.slice(0, Math.max(4, w.length - 2));
const foldKeys = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [fold(k), v]));

// ===== Dictionary of abbreviations and expressions (extend freely) =====
// Each entry:  t = meaning (shown as the reason of a match), x = words used for matching (default: t),
//   code = the usual code, offered first; mod = only refines a match (location, laterality...);
//   only = (SYN) the original word itself is not matched; seq = code for an old fracture ("st.p. fr.").
// ABBR entries match whole words, SYN entries match the start of a word (all inflected forms).
const ABBR_RAW = {
  // circulation
  "HT": { t: "hypertenze", code: "I10" }, "AHT": { t: "arteriální hypertenze", code: "I10" },
  "HN": { t: "hypertenzní nemoc", x: "hypertenze", code: "I10" }, "AH": { t: "arteriální hypertenze", code: "I10" },
  "ICHS": { t: "ischemická choroba srdeční", code: "I25.9" }, "AIM": { t: "akutní infarkt myokardu", code: "I21.9" },
  "IM": { t: "infarkt myokardu" }, "IMA": { t: "infarkt myokardu" }, "AP": { t: "angina pectoris", code: "I20.9" },
  "FiS": { t: "fibrilace síní", code: "I48.9" }, "FS": { t: "fibrilace síní", code: "I48.9" }, "AF": { t: "fibrilace síní", code: "I48.9" },
  "CHSS": { t: "chronické srdeční selhání", x: "selhání srdce", code: "I50.9" }, "SS": { t: "srdeční selhání", x: "selhání srdce" },
  "ICHDK": { t: "ischemická choroba dolních končetin", x: "ateroskleróza tepen končetin" },
  "HŽT": { t: "hluboká žilní trombóza", x: "flebitida hlubokých cév" },
  "DVT": { t: "hluboká žilní trombóza", x: "flebitida hlubokých cév" }, "PE": { t: "plicní embolie", code: "I26.9" },
  "CMP": { t: "cévní mozková příhoda" }, "iCMP": { t: "ischemická cévní mozková příhoda", x: "mozkový infarkt", code: "I63.9" },
  "TIA": { t: "tranzitorní ischemická ataka" }, "CHVI": { t: "chronická žilní insuficience", x: "venózní insuficience", code: "I87.2" },
  "DKMP": { t: "dilatační kardiomyopatie", code: "I42.0" }, "PM": { t: "kardiostimulátor", code: "Z95.0" },
  "KS": { t: "kardiostimulátor", code: "Z95.0" }, "CABG": { t: "aortokoronární bypass", code: "Z95.1" },
  "PCI": { t: "koronární intervence (stent)", code: "Z95.5" }, "KV": { t: "kardiovaskulární", x: "", mod: 1 },
  // metabolism
  "DM": { t: "diabetes mellitus" }, "DM2": { t: "diabetes mellitus 2. typu", x: "diabetes mellitus", code: "E11.9" },
  "DM1": { t: "diabetes mellitus 1. typu", x: "diabetes mellitus", code: "E10.9" },
  "HLP": { t: "hyperlipoproteinemie", x: "hyperlipidemie" }, "DLP": { t: "dyslipidemie", x: "hyperlipidemie", code: "E78.5" },
  "HCH": { t: "hypercholesterolemie" }, "PAD": { t: "perorální antidiabetika", x: "" },
  // respiration
  "CHOPN": { t: "chronická obstrukční plicní nemoc" }, "AB": { t: "asthma bronchiale", x: "astma", code: "J45.9" },
  "BA": { t: "bronchiální astma", x: "astma", code: "J45.9" }, "IHCD": { t: "infekce horních cest dýchacích", code: "J06.9" },
  "ARI": { t: "akutní respirační infekce", x: "infekce horních dýchacích cest", code: "J06.9" },
  "OSA": { t: "obstrukční spánková apnoe", x: "apnoe spánku", code: "G47.3" }, "SAS": { t: "syndrom spánkové apnoe", x: "apnoe spánku", code: "G47.3" },
  "TBC": { t: "tuberkulóza" },
  // digestion
  "GERD": { t: "gastroezofageální refluxní choroba", x: "gastroezofageální refluxní" }, 
  "VCHGD": { t: "vředová choroba gastroduodena", x: "peptický vřed", code: "K27.9" }, "IBS": { t: "syndrom dráždivého tračníku", x: "dráždivého tračníku" },
  "UC": { t: "ulcerózní kolitida", code: "K51.9" }, "CN": { t: "Crohnova nemoc", code: "K50.9" },
  "APPE": { t: "appendektomie", x: "", code: "Z90.4" }, "CHE": { t: "cholecystektomie", x: "", code: "Z90.4" },
  "LSK": { t: "laparoskopie", x: "" },
  // kidneys, urology
  "ISK": { t: "infekce močových cest", x: "infekce močového ústrojí" }, "IMC": { t: "infekce močových cest", x: "infekce močového ústrojí" },
  "IUC": { t: "infekce močových cest", x: "infekce močového ústrojí" }, "CHRI": { t: "chronická renální insuficience", x: "chronické onemocnění ledvin", code: "N18.9" },
  "CHRO": { t: "chronické renální onemocnění", x: "chronické onemocnění ledvin", code: "N18.9" }, "CKD": { t: "chronické onemocnění ledvin", code: "N18.9" },
  "CHREN": { t: "chronické onemocnění ledvin", code: "N18.9" }, "BHP": { t: "benigní hyperplazie prostaty", x: "zbytnění prostaty", code: "N40" },
  "BPH": { t: "benigní hyperplazie prostaty", x: "zbytnění prostaty", code: "N40" }, "UL": { t: "urolitiáza", x: "močový kámen", code: "N20.9" },
  "NL": { t: "nefrolitiáza", x: "kámen ledviny", code: "N20.0" },
  // nervous system, psyche
  "EPI": { t: "epilepsie" }, "PNP": { t: "polyneuropatie" }, "RS": { t: "roztroušená skleróza", code: "G35" },
  "DMO": { t: "dětská mozková obrna" }, "ETS": { t: "esenciální třes", code: "G25.0" }, "ADHD": { t: "porucha aktivity a pozornosti" },
  "PTSD": { t: "posttraumatická stresová porucha", code: "F43.1" }, "OCD": { t: "obsedantně-nutkavá porucha", code: "F42.9" },
  // spine, joints
  "VAS": { t: "vertebrogenní algický syndrom", x: "dorzalgie" }, "LIS": { t: "lumboischiadický syndrom", x: "lumbago ischias", code: "M54.4" },
  "CB": { t: "cervikobrachiální syndrom", code: "M53.1" }, "CC": { t: "cervikokraniální syndrom", code: "M53.0" },
  "RA": { t: "revmatoidní artritida", x: "revmatická artritida", code: "M06.9" }, "OP": { t: "osteoporóza", code: "M81.9" },
  "TEP": { t: "totální endoprotéza", x: "", code: "Z96.6" }, "CKP": { t: "cervikokapitální protéza", x: "", code: "Z96.6" },
  "OS": { t: "osteosyntéza", x: "", code: "Z96.7" },
  // location, laterality (only refine a match)
  "PHK": { t: "pravá horní končetina", x: "horní končetina", mod: 1 }, "LHK": { t: "levá horní končetina", x: "horní končetina", mod: 1 },
  "HK": { t: "horní končetina", mod: 1 }, "HKK": { t: "horní končetiny", mod: 1 },
  "PDK": { t: "pravá dolní končetina", x: "dolní končetina", mod: 1 }, "LDK": { t: "levá dolní končetina", x: "dolní končetina", mod: 1 },
  "DK": { t: "dolní končetina", mod: 1 }, "DKK": { t: "dolní končetiny", mod: 1 },
  "Cp": { t: "krční páteř", x: "krční", mod: 1 },
  "Th": { t: "hrudní páteř", x: "hrudní", mod: 1 }, "Thp": { t: "hrudní páteř", x: "hrudní", mod: 1 },
  "Lp": { t: "bederní páteř", x: "bederní", mod: 1 },
  "LS": { t: "lumbosakrální", x: "bederní", mod: 1 }, "LSp": { t: "lumbosakrální páteř", x: "bederní", mod: 1 },
  "bilat": { t: "oboustranně", x: "oboustranná", mod: 1 }, "bil": { t: "oboustranně", x: "oboustranná", mod: 1 },
  "bill": { t: "oboustranně", x: "oboustranná", mod: 1 }, "dist": { t: "distální", mod: 1 },
  // other
  "recid": { t: "recidivující", mod: 1 }, "chron": { t: "chronický", mod: 1 }, "ak": { t: "akutní", mod: 1 },
  "fr": { t: "fraktura", x: "zlomenina" }, "fx": { t: "fraktura", x: "zlomenina" }, "frac": { t: "fraktura", x: "zlomenina" },
  "frakt": { t: "fraktura", x: "zlomenina" }, "perc": { t: "percepční" },
  "TU": { t: "tumor", x: "novotvar" },
  "MTS": { t: "metastázy", x: "sekundární zhoubný novotvar", code: "C79.9" },
};
const ABBR = Object.fromEntries(Object.entries(ABBR_RAW).map(([k, v]) => [norm(k), { ...v, x: v.x ?? v.t }]));

// Words that official names don't use (prefix match, the longest key wins).
const SYN = foldKeys({
  plochonoh: "plochá noha", plochonož: "plochá noha", astenie: "nevolnost únava", astenick: "nevolnost únava",
  fraktur: "zlomenina", varix: "žilní městky", varik: "žilní městky", cefale: "bolest hlavy",
  pyróz: "pálení žáhy", cukrovk: "diabetes mellitus", nadváh: "obezita", lumbalg: "bolesti dolní části zad",
  zápal: "pneumonie", prolaps: "meziobratlové ploténky", angín: "tonzilitida",
  šedý: "katarakta", zelený: "glaukom", vertig: "závrať", palpitac: "palpitace", dyspnoe: "dušnost",
  dorsalg: "dorzalgie", dorzalg: "dorzalgie", kotník: { x: "hlezno", seq: "T93.2" },
  prst: { x: "ruka", mod: 1, seq: "T92.2" }, kolen: { x: "bérec", mod: 1 },
  brýl: "porucha refrakce", hyperechogen: "steatóza ztučnění", jatr: "jater", hepat: { x: "jater", mod: 1, only: 1 },
  hepatopat: { x: "nemoc jater", only: 1 }, sludg: "nemoci žlučníku", felle: { x: "žlučník", only: 1 },
  vesica: { x: "", only: 1 }, vessica: { x: "", only: 1 }, cholecystolit: "kámen žlučníku", nefrolit: "kámen ledviny",
  urolit: "kámen ledviny", koxartros: "koxartróza", ekzem: "ekzém dermatitida",
  hypakus: { x: "ztráta sluchu", only: 1 }, hypacus: { x: "ztráta sluchu", only: 1 },
  scheuerman: { x: "juvenilní osteochondróza páteře", only: 1, code: "M42.0" }, scheurman: { x: "juvenilní osteochondróza páteře", only: 1, code: "M42.0" },
  pervitin: { x: "stimulancií", only: 1 }, metamfetamin: { x: "stimulancií", only: 1 },
  fumator: { x: "užívání tabáku", only: 1 }, kuřák: { x: "užívání tabáku", only: 1 },
  uratic: { x: "dna", only: 1 }, paroxysm: "záchvat", epilept: "epilepsie",
  kontus: { x: "zhmoždění", only: 1 }, contus: { x: "zhmoždění", only: 1 },
  hemithorac: { x: "hrudníku", only: 1 }, thorac: { x: "hrudníku", only: 1 }, thorak: { x: "hrudníku", only: 1 },
  deviati: { x: "deviace nosní přepážky", only: 1 },
  // operations: "st.p. appendektomii" -> acquired absence of an organ / post-operative state
  appendektom: { x: "", only: 1, code: "Z90.4" }, cholecystektom: { x: "", only: 1, code: "Z90.4" },
  gastrektom: { x: "", only: 1, code: "Z90.3" }, hysterektom: { x: "", only: 1, code: "Z90.7" },
  mastektom: { x: "", only: 1, code: "Z90.1" }, nefrektom: { x: "", only: 1, code: "Z90.5" },
  tonzilektom: { x: "", only: 1, code: "Z90.8" }, tonsilektom: { x: "", only: 1, code: "Z90.8" },
  adenektom: { x: "", only: 1, code: "Z90.8" }, adenotom: { x: "", only: 1, code: "Z90.8" },
  strumektom: { x: "", only: 1, code: "Z90.8" }, tyreoidektom: { x: "", only: 1, code: "Z90.8" },
  splenektom: { x: "", only: 1, code: "Z90.8" }, aloplastik: { x: "", only: 1, code: "Z96.6" },
  endoprotéz: { x: "", only: 1, code: "Z96.6" }, osteosynt: { x: "", only: 1, code: "Z96.7" },
  operac: { x: "", only: 1, code: "Z98.8" }, operov: { x: "", only: 1, code: "Z98.8" },
  // Latin bones -> the words used in official fracture names
  radius: { x: "vřetenní kosti", only: 1, seq: "T92.1" }, radia: { x: "vřetenní kosti", only: 1, seq: "T92.1" },
  ulna: { x: "loketní kosti", only: 1, seq: "T92.1" }, humer: { x: "pažní kosti", only: 1, seq: "T92.1" },
  clavicul: { x: "klíční kosti", only: 1, seq: "T92.1" }, klavikul: { x: "klíční kosti", only: 1, seq: "T92.1" },
  femur: { x: "stehenní kosti", only: 1, seq: "T93.1" }, tibi: { x: "holenní kosti", only: 1, seq: "T93.2" },
  fibul: { x: "lýtkové kosti", only: 1, seq: "T93.2" }, patell: { x: "čéšky", only: 1, seq: "T93.2" },
  calcane: { x: "patní kosti", only: 1, seq: "T93.2" }, malleol: { x: "kotníku", only: 1, seq: "T93.2" },
  costa: { x: "žebra", only: 1, seq: "T91.2" }, vertebr: { x: "obratle", only: 1, seq: "T91.1" },
  zygomatic: { x: "lícní kosti", only: 1, seq: "T90.2" },
});
const MIN_SCORE = 0;
const SYN_KEYS = Object.keys(SYN).sort((a, b) => b.length - a.length);

// qualifiers that only refine a match (never enough on their own)
const MODS = new Set(["akutní", "chronický", "recidivující", "pravá", "levá", "horní", "dolní", "končetina",
  "oboustranný", "hrudní", "bederní", "krční", "krajina", "arteriální", "břicho", "břicha", "kost", "kosti",
  "distální", "těžká", "těžký", "ruka", "ruky", "noha", "nohy", "hlava", "hlavy", "krk", "páteř", "páteře",
  "kloub", "kloubu"].map(w => stem(fold(w))));
// codes with these words are suggested only when the text mentions them too
// (plochonoží is not "vrozená plochá noha", "esovitá" is not a colon tumour)
const QUAL = ["vrozený", "zhoubný", "novotvar", "nezhoubný"].map(w => stem(fold(w)));

// words that never identify a diagnosis (also never start a new phrase)
const STOP = new Set(["v", "ve", "na", "s", "se", "z", "ze", "a", "i", "o", "u", "k", "ke", "do", "po", "pro", "při",
  "dle", "podle", "od", "let", "letech", "roku", "rok", "r", "mírná", "mírné", "mírný", "mírně", "lehká", "lehké", "lehký",
  "bez", "nálezu", "jiné", "jiná", "jiný", "jiných", "ns", "neurčená", "neurčený", "neurčené",
  "nezařazené", "nezařazená", "jinde", "typu", "stav", "stavy", "nebo", "jako", "dítě", "dětství", "věku",
  "péče", "péči", "ortopeda", "sledování", "sledován", "sledována", "kontrola", "kontroly", "jen", "susp", "suspektní",
  "hraniční", "korekce", "dálku", "blízko", "vpravo", "vlevo", "komp", "nález", "nálezem", "známky",
  "došetřován", "došetřována", "došetřování", "cestou", "objednán", "objednána", "konzultaci", "konzultace",
  "abstinuje", "již", "dispenzu", "dispenzarizace", "doby", "té", "klidné", "klidná", "dlouhodobě", "opakovaně",
  "řešení", "konzervativnímu", "konzervativní", "dietě", "dieta", "pac", "pacient", "pacienta", "rizikem", "riziko",
  "nízkým", "léčba", "léčbou", "odvykací", "poslední", "dok", "dokumentaci", "nemám", "cum", "arcus", "collum",
  "chirurgicum", "etiologie", "etiologií", "toxometabol", "toxometabolické", "txm", "terén", "sin", "dx", "re",
  "chir", "fno", "vs", "sp", "cca", "pracovním", "úraze", "úrazu", "ledna", "února", "března", "dubna", "května",
  "června", "července", "srpna", "září", "října", "listopadu", "prosince", "hlavice", "cum", "normální", "normálním",
  "neurol", "neurologický", "neurologické", "doby", "abusu", "abúzu"].map(fold));
const EXAM = new Set(["usg", "rtg", "ct", "mr", "mri", "ekg", "echo", "ko", "crp", "spirometrie", "kolonoskopie",
  "gastroskopie", "denzitometrie", "mamografie", "holter", "lab", "biochemie", "gfs", "gastrofibroskopie",
  "koloskopie", "ergometrie", "scintigrafie", "emg", "eeg"].map(fold));
// capitalised words that do not start a new diagnosis ("abstinuje od Ledna 2024", "Normální EEG")
const NOSPLIT = new Set(["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října",
  "listopadu", "prosince", "normální", "normálním"].map(fold));
const CONTEXT = new Set(["při", "kvůli", "během"].map(fold));
const PREP = new Set(["dle", "podle", "na", "v", "ve", "při", "po", "z", "ze", "s", "se", "a", "i"].map(fold));
const HISTORY_LABELS = new Set(["operace", "úrazy", "oa", "anamnéza", "anamnesa"].map(fold));
// personal-history (Z86/Z87) code for a disease from each ICD chapter
const HISTORY_CODE = { "I": "Z86.1", "III": "Z86.2", "IV": "Z86.3", "V": "Z86.5", "VI": "Z86.6", "VII": "Z86.6",
  "VIII": "Z86.6", "IX": "Z86.7", "X": "Z87.0", "XI": "Z87.1", "XII": "Z87.2", "XIII": "Z87.3", "XIV": "Z87.4",
  "XV": "Z87.5", "XVI": "Z87.6", "XVII": "Z87.7" };

let IDX = null;
function buildIndex() {
  const post = new Map();
  items.forEach((it, i) => {
    it.fw = [...new Set(it.text.split(" ").filter(Boolean).map(fold).filter(w => !STOP.has(w)))];
    it.nasl = it.fw.some(w => w.startsWith("nasledk")); // "Následky ..." codes (T90-T98, I69, ...)
    it.qual = it.fw.some(w => QUAL.some(q => w.startsWith(q)));
    it.ns = /(^| )(ns|neurcen)/.test(it.text); // unspecified codes are the safer default
    for (const w of new Set([...it.fw, ...it.alt.split(" ").filter(Boolean).map(fold)])) {
      if (!post.has(w)) post.set(w, []);
      post.get(w).push(i);
    }
  });
  const words = [...post.keys()].sort();
  IDX = { words, post, cache: new Map() };
}

// all items having a word that starts with the stem
function lookup(st) {
  if (IDX.cache.has(st)) return IDX.cache.get(st);
  const { words, post } = IDX;
  let lo = 0, hi = words.length;
  while (lo < hi) { const m = (lo + hi) >> 1; words[m] < st ? lo = m + 1 : hi = m; }
  const hits = new Set();
  for (let k = lo; k < words.length && words[k].startsWith(st); k++) for (const i of post.get(words[k])) hits.add(i);
  IDX.cache.set(st, hits);
  return hits;
}

// optimal string alignment distance: substitutions, insertions, deletions and swapped neighbours
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// typo tolerance ("hypertneze" -> hypertenze): only used when a word has no exact match.
// Index words starting with the same two letters are compared on the typed length (inflection may follow).
function fuzzyLookup(f) {
  const key = "~" + f;
  if (IDX.cache.has(key)) return IDX.cache.get(key);
  const { words, post } = IDX;
  const max = f.length >= 8 ? 2 : 1;
  const pre = f.slice(0, 2);
  let lo = 0, hi = words.length;
  while (lo < hi) { const m = (lo + hi) >> 1; words[m] < pre ? lo = m + 1 : hi = m; }
  const hits = new Set();
  for (let k = lo; k < words.length && words[k].startsWith(pre); k++) {
    const w = words[k];
    if (w.length < f.length - 1) continue;
    const dist = Math.min(...[-1, 0, 1].map(o => editDistance(f, w.slice(0, f.length + o))));
    if (dist <= max) for (const i of post.get(w)) hits.add(i);
  }
  IDX.cache.set(key, hits);
  return hits;
}

// "j029", "J02.9 " -> "J02.9"
function normCode(c) {
  c = String(c).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length > 3 ? c.slice(0, 3) + "." + c.slice(3) : c;
}

const bare = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const isTitle = w => /^\p{Lu}\p{Ll}/u.test(bare(w));

// split free text into phrases: at line breaks, commas, semicolons, "Label:" and before a word
// starting with a capital letter ("Astenie Plochonoží Stp. ...") or an examination ("USG ...")
function segment(text) {
  const segs = [];
  let cur = null;
  const start = (hist = false) => { cur = { words: [], hist, open: false }; segs.push(cur); };
  start();
  for (const line of text.split("\n")) {
    if (cur.words.length) start(); // a new line ends an "Úrazy:" / "Operace:" block
    for (const chunk of line.split(/[;,]+/)) {
      const first = norm(bare(chunk.trim().split(/\s+/)[0] || ""));
      // "VAS C, Th páteře": a part starting with a location abbreviation continues the phrase
      if (cur.words.length && !(ABBR[first] && ABBR[first].mod)) start(cur.hist);
      for (const raw of chunk.split(/\s+/).filter(Boolean)) {
        const b = bare(raw), f = fold(b);
        if (raw.endsWith(":")) { start(HISTORY_LABELS.has(f)); continue; }
        // "st.p." / "stp." / "St. p." / "s/p" (stav po) opens a past-history phrase and is never searched for
        if (/^(st\.?\s?p|s\/p|st)$/.test(norm(b))) {
          if (cur.words.length && !cur.open) start(cur.hist);
          cur.stp = true; cur.open = true; cur.words.push(raw);
          continue;
        }
        if (norm(b) === "cum" || raw === "+") { if (cur.words.length) start(cur.hist); continue; } // "Myopie cum astigmatismo"
        const prev = cur.words.length ? fold(bare(cur.words[cur.words.length - 1])) : "";
        const ab = ABBR[norm(b)];
        // an upper-case diagnosis abbreviation ("... v dok. VAS C") starts a phrase; procedure ones ("aloplastice CKP") do not
        const newPhrase = isTitle(raw) || EXAM.has(f) || (ab && !ab.mod && ab.x && b.length > 1 && b === b.toUpperCase());
        // right after "St.p." the next word belongs to it ("Stp. Fr. collum ..."), as do locations ("Thp")
        if (cur.words.length && !cur.open && !PREP.has(prev) && !NOSPLIT.has(f) && !(ab && ab.mod) && newPhrase) start(cur.hist);
        cur.words.push(raw);
        if (cur.open && /\p{L}{3,}/u.test(b)) cur.open = false;
      }
    }
  }
  return segs.filter(s => s.words.some(w => /\p{L}{2,}/u.test(w) || /^[A-Za-z]\d{2}/.test(w)));
}

function analyzeSegment(seg) {
  const text = seg.words.join(" ");
  const n = " " + norm(text) + " ";
  const hist = seg.hist || seg.stp || /[^a-z]st\s?\.?\s?p[^a-z]|[^a-z]s\s?\/\s?p[^a-z]|stav po|v detstvi|anamn|v minulosti|prodelal/.test(n);
  if (/[^a-z]b\s?\.?\s?p\s?\.?\s?n[^a-z]|bez patolog|bez nalezu|v norme|bez abus|bez abuz/.test(n)) return { text, hist, skip: "bez patologického nálezu" };

  // a code written directly in the text wins
  const direct = (text.toUpperCase().match(/\b[A-Z]\d{2}(\.\d{1,2})?\b/g) || []).map(normCode).filter(c => byCode.has(c));

  const hinted = [], sequels = [];
  const tokens = new Map();
  let context = false; // after "při", "kvůli", "během" the words only describe circumstances
  const add = (word, src, mod) => {
    const f = fold(word);
    if (!f || STOP.has(f) || EXAM.has(f) || /^\d+$/.test(f) || f.length < 3) return;
    const st = stem(f);
    mod = mod || context || MODS.has(st);
    if (!tokens.has(st) || (tokens.get(st).mod && !mod)) tokens.set(st, { st, f, src, mod: !!mod });
  };
  const cleaned = n.replace(/[^a-z]st\s?\.?\s?p\.?|[^a-z]s\s?\/\s?p/g, " ");
  for (const w of cleaned.split(/[^a-z0-9]+/).filter(Boolean)) {
    const f = fold(w);
    if (CONTEXT.has(f)) { context = true; continue; }
    if (ABBR[w]) {
      const a = ABBR[w];
      if (a.code && byCode.has(a.code)) hinted.push({ code: a.code, why: `${w.toUpperCase()} = ${a.t}` });
      for (const x of norm(a.x).split(/[^a-z0-9]+/)) add(x, `${w.toUpperCase()} (${a.t})`, a.mod);
      continue;
    }
    const syn = SYN_KEYS.find(k => f.startsWith(k));
    const a = syn && (typeof SYN[syn] === "string" ? { x: SYN[syn] } : SYN[syn]);
    if (!a || !a.only) add(w, w, false);
    if (a) for (const x of norm(a.x).split(/[^a-z0-9]+/)) add(x, w, a.mod);
    if (a && a.seq) sequels.push(a.seq);
    if (a && a.code && byCode.has(a.code)) hinted.push({ code: a.code, why: `podle slova „${w}“` });
  }
  // old fracture of a named bone ("st.p. fr. radia") -> its "Následky zlomeniny" code
  if (hist && [...tokens.keys()].some(k => k.startsWith("slomen")))
    hinted.unshift(...sequels.filter(c => byCode.has(c)).map(code => ({ code, why: "stav po zlomenině" })));
  // nothing left to look up ("stav", "došetřován cestou", ...) -> the phrase is not shown at all
  // (a phrase with only locations / qualifiers, e.g. "objednán na konzultaci chir. ruky", counts as empty too)
  if (![...tokens.values()].some(t => !t.mod) && !hinted.length && !direct.length) return { text, hist, results: [], empty: true };
  // "horní končetina" in the text rules out codes about the lower limb and vice versa
  const conflict = [["horn", "doln"], ["doln", "horn"]].filter(([has, other]) => tokens.has(has) && !tokens.has(other)).map(x => x[1]);
  const textQual = [...tokens.keys()].some(st => QUAL.some(q => q.startsWith(st) || st.startsWith(q)));

  const cand = new Map();
  for (const t of tokens.values()) {
    let hits = lookup(t.st), typo = false;
    if (!hits.size && t.f.length >= 5) { hits = fuzzyLookup(t.f); typo = true; }
    if (!hits.size) continue;
    if (typo) t.src = t.src.replace(/( \(překlep\?\))?$/, " (překlep?)");
    const w = Math.log(items.length / hits.size) * (t.mod ? 0.5 : 1) * (typo ? 0.9 : 1);
    for (const i of hits) {
      let c = cand.get(i);
      if (!c) cand.set(i, c = { score: 0, toks: [], content: false });
      c.score += w;
      c.toks.push(t);
      if (!t.mod) c.content = true;
    }
  }
  const scored = [];
  for (const [i, c] of cand) {
    if (!c.content) continue;
    const it = items[i];
    const cover = it.fw.length ? it.fw.filter(w => c.toks.some(t => w.startsWith(t.st))).length / it.fw.length : 0;
    const whole = c.toks.filter(t => !t.mod && t.f.length >= 5 && it.fw.some(w => w.startsWith(t.f))).length;
    let s = c.score + 4 * cover + 2 * whole;
    // the doctor's cheat sheet: the code itself, or its parent (M25.56 -> M25.5)
    if (commonSet.has(it.code)) s += 2.5;
    else if (commonSet.has(it.code.slice(0, -1).replace(/\.$/, ""))) s += 1.5;
    if (isFav(it.code)) s += 1;
    if (it.group) s -= 0.8;
    if (it.nasl) s += hist ? 5 : -2;
    if (hist && it.code[0] === "S") s -= 2; // "st.p. fr." is an old injury, not a fresh one
    if (it.qual && !textQual) s -= 3;
    if (it.ns) s += 0.5;
    if (conflict.length && it.fw.some(w => conflict.some(c => w.startsWith(c)))) s -= 4;
    scored.push({ it, s, why: [...new Set(c.toks.map(t => t.src))].join(", ") });
  }
  scored.sort((a, b) => b.s - a.s || a.it.code.localeCompare(b.it.code));

  // a weak match (one common word) is noise, not a diagnosis
  let results = scored.filter(x => x.s >= MIN_SCORE).slice(0, 3).map(x => ({ it: x.it, why: "shoda: " + x.why, s: x.s }));
  // past disease ("st.p.", "v dětství") -> personal-history code for its chapter
  if (hist && results.length) {
    const top = results[0].it;
    const hc = /^F1\d/.test(top.code) ? "Z86.4" : HISTORY_CODE[CHAPTERS[top.ch][0]];
    if (hc && byCode.has(hc)) results.unshift({ it: byCode.get(hc), why: `osobní anamnéza, podle ${top.code} ${top.name}` });
  }
  results = [...direct.map(c => ({ it: byCode.get(c), why: "kód uvedený v textu" })),
    ...hinted.map(h => ({ it: byCode.get(h.code), why: h.why })), ...results]
    .filter((r, k, all) => all.findIndex(x => x.it.code === r.it.code) === k).slice(0, 4);
  return { text, hist, results };
}

let analysis = [];
let analysisView = cfg.get("mkn10.view") === "all" ? "all" : "best";

// several diagnoses pasted at once (or nothing found by plain search) -> suggestions per phrase
function renderAnalysis(segs, fallback = false) {
  if (!IDX) buildIndex();
  analysis = segs.map(analyzeSegment).filter(a => !a.empty);
  const found = analysis.filter(a => a.results && a.results.length);
  if (fallback && !found.length) {
    $main.innerHTML = `<div class="list"><div class="empty">Nic nenalezeno pro „${esc($q.value.trim())}“</div></div>`;
    return;
  }
  let html = fallback
    ? `<div class="sec-head"><h2>Přesná shoda nenalezena, nejpodobnější kódy</h2></div>`
    : `<div class="sec-head"><h2>Rozpoznané diagnózy (${found.length})</h2>${found.length ? `<span class="links">
        <button class="link" id="copyBest">Kopírovat kódy</button><button class="link" id="copyBestFull">Kopírovat s názvy</button></span>` : ""}</div>
       <div class="view-tabs">
         <button class="view-tab${analysisView === "best" ? " on" : ""}" data-view="best">Nejlepší shody</button>
         <button class="view-tab${analysisView === "all" ? " on" : ""}" data-view="all">Všechny možnosti</button>
       </div>`;

  // compact view: one row per phrase with just the best match
  if (!fallback && analysisView === "best") {
    const skipped = analysis.filter(a => a.skip).length;
    html += `<div class="list">${analysis.filter(a => !a.skip).map(a => a.results.length
      ? rowHtml(a.results[0].it, "", false, a.hist ? '<span class="badge">anamnéza</span>' : "", `<span class="reason">„${esc(a.text)}“</span>`)
      : `<div class="empty-row">„${esc(a.text)}“ &nbsp;·&nbsp; nic nenalezeno <button class="link" data-manual="${esc(a.text)}">hledat jen tuto část</button></div>`).join("")}</div>`;
    if (skipped) html += `<p class="seg-skip" style="margin-top:8px">Přeskočeno ${skipped} ${skipped === 1 ? "část" : skipped < 5 ? "části" : "částí"} s normálním nálezem.</p>`;
    $main.innerHTML = html;
    setActive(active);
    return;
  }

  html += fallback ? "" : `<p class="hint">Text byl rozdělen na části a ke každé jsou nejpodobnější kódy podle shody slov. Návrhy vždy zkontrolujte.</p>`;
  analysis = analysis.filter(a => !a.empty);
  for (const a of analysis) {
    const badge = a.hist ? ' <span class="badge">anamnéza</span>' : "";
    if (a.skip) { html += `<p class="seg-skip">„${esc(a.text)}“ &nbsp;·&nbsp; přeskočeno (${a.skip})</p>`; continue; }
    html += `<div class="seg">${fallback ? "" : `<div class="seg-src">„${esc(a.text)}“${badge}</div>`}`;
    html += a.results.length
      ? `<div class="list">${a.results.map((r, k) => rowHtml(r.it, "", false,
          k === 0 && !fallback ? '<span class="conf vysoka">nejlepší shoda</span>' : "", `<span class="reason">${esc(r.why)}</span>`)).join("")}</div>`
      : `<div class="list"><div class="empty">Nic nenalezeno. <button class="link" data-manual="${esc(a.text)}">Hledat jen tuto část</button></div></div>`;
    html += `</div>`;
  }
  $main.innerHTML = html;
  setActive(active);
}

function copyBest(full) {
  const best = analysis.filter(a => a.results && a.results.length).map(a => a.results[0].it);
  const text = full ? best.map(it => `${it.code} ${it.name}`).join("\n") : best.map(it => it.code).join(", ");
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  });
  toast(`Zkopírováno ${best.length} kódů`);
}
