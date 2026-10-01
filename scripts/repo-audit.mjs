import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

const files = (await walk(SRC)).filter((file) => CODE_EXTENSIONS.has(path.extname(file)));
const rows = [];
let totalLines = 0;
let important = 0;
let fontFamily = 0;
let hardcodedHex = 0;
let rgb = 0;
let embeddedStyleTags = 0;
let inlineReactStyle = 0;
let localStorageRefs = 0;
let fetchRefs = 0;
let eventListenerRefs = 0;
let timeoutRefs = 0;

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lines = text.split(/\r?\n/).length;
  totalLines += lines;
  important += count(text, /!important\b/g);
  fontFamily += count(text, /font-family\s*:/gi);
  hardcodedHex += count(text, /#[0-9a-fA-F]{3,8}\b/g);
  rgb += count(text, /rgba?\s*\(/gi);
  embeddedStyleTags += count(text, /<style\b/g);
  inlineReactStyle += count(text, /style\s*=\s*\{\{/g);
  localStorageRefs += count(text, /\blocalStorage\b/g);
  fetchRefs += count(text, /\bfetch\s*\(/g);
  eventListenerRefs += count(text, /\baddEventListener\s*\(/g);
  timeoutRefs += count(text, /\bsetTimeout\s*\(/g);

  if (TS_EXTENSIONS.has(path.extname(file))) {
    rows.push({ file: path.relative(ROOT, file).replaceAll('\\', '/'), lines });
  }
}

rows.sort((a, b) => b.lines - a.lines);

const result = {
  generatedAt: new Date().toISOString(),
  sourceFiles: files.length,
  tsTsxFiles: rows.length,
  totalLines,
  debtSignals: {
    important,
    fontFamily,
    hardcodedHex,
    rgb,
    embeddedStyleTags,
    inlineReactStyle,
    localStorageRefs,
    fetchRefs,
    eventListenerRefs,
    timeoutRefs,
  },
  largestTsTsxFiles: rows.slice(0, 20),
};

console.log(JSON.stringify(result, null, 2));
