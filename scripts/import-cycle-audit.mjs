import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const SOURCE_SET = new Set(SOURCE_EXTENSIONS);
const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else if (entry.isFile() && SOURCE_SET.has(path.extname(entry.name))) output.push(full);
  }
  return output;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  if (SOURCE_SET.has(path.extname(base)) && await exists(base)) return base;
  for (const extension of SOURCE_EXTENSIONS) {
    const direct = `${base}${extension}`;
    if (await exists(direct)) return direct;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const index = path.join(base, `index${extension}`);
    if (await exists(index)) return index;
  }
  return null;
}

const files = await walk(SRC);
const graph = new Map(files.map((file) => [file, []]));

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const specs = [];
  for (const match of text.matchAll(IMPORT_RE)) specs.push(match[1]);
  for (const specifier of specs) {
    const resolved = await resolveLocalImport(file, specifier);
    if (resolved && graph.has(resolved)) graph.get(file).push(resolved);
  }
}

const state = new Map();
const stack = [];
const cycles = [];
const cycleKeys = new Set();

function canonicalCycle(nodes) {
  const compact = nodes.slice(0, -1).map((file) => path.relative(ROOT, file).replaceAll('\\', '/'));
  const rotations = compact.map((_, index) => [...compact.slice(index), ...compact.slice(0, index)]);
  rotations.sort((a, b) => a.join('>').localeCompare(b.join('>')));
  return rotations[0].join('>');
}

function visit(file) {
  state.set(file, 1);
  stack.push(file);

  for (const next of graph.get(file) ?? []) {
    const nextState = state.get(next) ?? 0;
    if (nextState === 0) visit(next);
    else if (nextState === 1) {
      const index = stack.lastIndexOf(next);
      const cycle = [...stack.slice(index), next];
      const key = canonicalCycle(cycle);
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cycle);
      }
    }
  }

  stack.pop();
  state.set(file, 2);
}

for (const file of files) if ((state.get(file) ?? 0) === 0) visit(file);

if (!cycles.length) {
  console.log(`Import cycle check OK — ${files.length} source file scanned.`);
  process.exit(0);
}

console.error(`Import cycle check FAILED — ${cycles.length} cycle(s) found:`);
for (const cycle of cycles) {
  console.error('');
  for (const file of cycle) console.error(`  -> ${path.relative(ROOT, file).replaceAll('\\', '/')}`);
}
process.exit(1);
