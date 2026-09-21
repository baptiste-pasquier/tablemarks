// Regenerates every raster icon from the two SVG sources. Run with `npm run icons`.
//
// Two sources, not one: three overlapping pins cannot resolve at 16 or 32 px, so small targets
// take the single-pin reduction instead of a muddy shrink of the full mark. Both read as the
// same icon because the front pin dominates the full version.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** target file -> [source svg, pixel size]. The favicon is written as PNG bytes in an .ico container. */
const TARGETS = [
  ['pwa-512x512.png', 'logo.svg', 512],
  ['maskable-icon-512x512.png', 'logo.svg', 512],
  ['pwa-192x192.png', 'logo.svg', 192],
  ['apple-touch-icon-180x180.png', 'logo.svg', 180],
  ['pwa-64x64.png', 'logo-mark.svg', 64],
]

async function render(source, size) {
  const svg = await readFile(path.join(PUBLIC, source))
  return sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
}

/** Minimal single-image .ico container around a 32x32 PNG — enough for every current browser. */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)
  return Buffer.concat([header, entry, png])
}

for (const [target, source, size] of TARGETS) {
  await writeFile(path.join(PUBLIC, target), await render(source, size))
  console.log(`${target.padEnd(30)} <- ${source} @ ${size}px`)
}

const favicon = await render('logo-mark.svg', 32)
await writeFile(path.join(PUBLIC, 'favicon.ico'), icoFromPng(favicon, 32))
console.log(`${'favicon.ico'.padEnd(30)} <- logo-mark.svg @ 32px`)
