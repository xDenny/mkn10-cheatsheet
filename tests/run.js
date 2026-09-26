// Regression test of the text analysis and search, run against the built index.html.
//   node tests/run.js            compare with tests/snapshot.txt (exit code 1 on a difference)
//   node tests/run.js --update   accept the current output as the new snapshot
//   node tests/run.js --show     just print the current output
// Examples live in tests/examples/*.txt (one pasted record per file).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = html.split("<script>").pop().split("</script>")[0];

// minimal browser stubs: the app script only needs these to load
const el = () => ({ dataset: {}, value: "", hidden: false, style: {}, classList: { toggle() {}, add() {}, remove() {} },
  addEventListener() {}, focus() {}, select() {}, set innerHTML(v) {}, querySelectorAll: () => [] });
global.document = { documentElement: { dataset: {}, classList: { toggle() {} } }, getElementById: el, querySelectorAll: () => [],
  addEventListener() {}, createElement: el, body: { appendChild() {} } };
global.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.setTimeout = () => 0;

const api = new Function(js + "; buildIndex(); return { segment, analyzeSegment, search };")();

const lines = [];
const exDir = path.join(__dirname, "examples");
for (const f of fs.readdirSync(exDir).filter(f => f.endsWith(".txt")).sort()) {
  lines.push(`=== ${f}`);
  for (const a of api.segment(fs.readFileSync(path.join(exDir, f), "utf8")).map(api.analyzeSegment)) {
    if (a.empty) continue;
    const r = a.results && a.results[0];
    const best = a.skip ? "(přeskočeno)" : r ? `${r.it.code}  ${r.it.name}` : "(nic)";
    lines.push(`${a.text.slice(0, 50).padEnd(51)}${a.hist ? "A " : "  "}${best}`);
  }
}
lines.push("=== search");
for (const q of ["tin", "tinnitus", "usni", "I10", "m545", "bolest zad", "cukrovka", "boreli", "hypertneze", "gonartorza"]) {
  const segs = api.segment(q);
  const res = api.search(q);
  const out = res.length ? res.slice(0, 3).map(x => x.code) : api.analyzeSegment(segs[0]).results.map(x => x.it.code);
  lines.push(`${q.padEnd(14)}${res.length ? "" : "~ "}${out.join(", ")}`);
}
const output = lines.join("\n") + "\n";

const snap = path.join(__dirname, "snapshot.txt");
if (process.argv.includes("--show")) { process.stdout.write(output); process.exit(0); }
if (process.argv.includes("--update") || !fs.existsSync(snap)) {
  fs.writeFileSync(snap, output);
  console.log("snapshot updated:", snap);
  process.exit(0);
}
const old = fs.readFileSync(snap, "utf8");
if (old === output) { console.log("OK, výstup odpovídá snapshotu"); process.exit(0); }
const a = old.split("\n"), b = output.split("\n");
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) console.log(`- ${a[i] ?? ""}\n+ ${b[i] ?? ""}`);
}
console.log("\nROZDÍL oproti snapshotu. Pokud je změna záměrná: node tests/run.js --update");
process.exit(1);
