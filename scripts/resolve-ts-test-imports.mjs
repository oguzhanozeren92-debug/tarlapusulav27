import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const RELATIVE_OR_ABSOLUTE = /^(?:\.{1,2}\/|\/)/;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/i;
const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFileCandidate(basePath) {
  if (HAS_EXTENSION.test(basePath) && await exists(basePath)) return basePath;

  for (const extension of CANDIDATE_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (await exists(candidate)) return candidate;
  }

  for (const extension of CANDIDATE_EXTENSIONS) {
    const candidate = path.join(basePath, `index${extension}`);
    if (await exists(candidate)) return candidate;
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!RELATIVE_OR_ABSOLUTE.test(specifier) || specifier.startsWith('node:')) {
      throw error;
    }

    const parentUrl = context.parentURL ?? pathToFileURL(`${process.cwd()}/`).href;
    const parentPath = fileURLToPath(parentUrl);
    const baseDir = path.dirname(parentPath);
    const rawPath = specifier.startsWith('/')
      ? specifier
      : path.resolve(baseDir, specifier);
    const candidate = await resolveFileCandidate(rawPath);

    if (!candidate) throw error;

    return {
      shortCircuit: true,
      url: pathToFileURL(candidate).href,
    };
  }
}
