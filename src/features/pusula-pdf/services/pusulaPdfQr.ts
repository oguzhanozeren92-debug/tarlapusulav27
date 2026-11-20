// Dependency-free QR Code generator (byte mode, error correction level M).
// Based on the public reference algorithm by Project Nayuki (MIT licence).
// Used so the PDF never depends on an external QR web service.

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const FORMAT_BITS_M = 0;

function rawDataModules(ver: number) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(ver: number) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];
}

function gfMul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Returns a square boolean matrix (true = dark module), or null if too long. */
export function encodeQr(textValue: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(textValue));
  let ver = 1;
  for (; ver <= 40; ver += 1) {
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) return null;

  // --- data bit stream
  const bits: number[] = [];
  const push = (value: number, len: number) => { for (let i = len - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0x4, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j];
    data.push(v);
  }

  // --- error correction + interleave
  const numBlocks = NUM_BLOCKS_M[ver];
  const eccLen = ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(block[i]);
    });
  }

  // --- matrix
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunc = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunc = (x: number, y: number, dark: boolean) => { modules[y][x] = dark; isFunc[y][x] = true; };

  for (let i = 0; i < size; i += 1) { setFunc(6, i, i % 2 === 0); setFunc(i, 6, i % 2 === 0); }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunc(xx, yy, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  const alignPos: number[] = [];
  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    alignPos.push(6);
    for (let pos = size - 7; alignPos.length < numAlign; pos -= step) alignPos.splice(1, 0, pos);
  }
  alignPos.forEach((ay, i) => alignPos.forEach((ax, j) => {
    const last = alignPos.length - 1;
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      setFunc(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }));

  const drawFormat = (mask: number) => {
    const d = (FORMAT_BITS_M << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setFunc(8, i, bit(b, i));
    setFunc(8, 7, bit(b, 6)); setFunc(8, 8, bit(b, 7)); setFunc(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i += 1) setFunc(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i += 1) setFunc(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i += 1) setFunc(8, size - 15 + i, bit(b, i));
    setFunc(8, size - 8, true);
  };
  drawFormat(0); // reserve the area

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      setFunc(a, c, bit(b, i)); setFunc(c, a, bit(b, i));
    }
  }

  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunc[y][x] && idx < codewords.length * 8) {
          modules[y][x] = bit(codewords[idx >>> 3], 7 - (idx & 7));
          idx += 1;
        }
      }
    }
  }

  const maskFn = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      if (!isFunc[y][x] && maskFn[m](x, y)) modules[y][x] = !modules[y][x];
    }
  };
  // Simplified penalty (runs, 2×2 blocks, balance) to pick a readable mask.
  const penalty = () => {
    let score = 0, dark = 0;
    for (let y = 0; y < size; y += 1) {
      for (const horizontal of [true, false]) {
        let run = 1;
        for (let i = 1; i <= size; i += 1) {
          const prev = horizontal ? modules[y][i - 1] : modules[i - 1][y];
          const cur = i < size ? (horizontal ? modules[y][i] : modules[i][y]) : !prev;
          if (cur === prev) run += 1;
          else { if (run >= 5) score += run - 2; run = 1; }
        }
      }
    }
    for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
    modules.forEach((row) => row.forEach((m) => { if (m) dark += 1; }));
    const total = size * size;
    score += Math.ceil(Math.abs(dark * 20 - total * 10) / total - 1) * 10;
    return score;
  };
  let bestMask = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m += 1) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestScore) { bestScore = p; bestMask = m; }
    applyMask(m); // undo (XOR)
  }
  applyMask(bestMask); drawFormat(bestMask);
  return modules;
}
