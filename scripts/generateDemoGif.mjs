import { spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import gifenc from 'gifenc'
import { PNG } from 'pngjs'

const { GIFEncoder, applyPalette, quantize } = gifenc

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const frameDir = path.join(rootDir, 'test-results', 'demo-frames')
const outputPath = path.join(rootDir, 'docs', 'demo.gif')
const defaultFrameDelay = 1200
const finalFrameDelay = 1800
const paletteFormat = 'rgb565'

/**
 * One palette for every frame, so a pixel keeps its exact colour from one frame to the next. Each
 * frame after the first then only colours the pixels whose index changed, and leaves the rest
 * transparent: a frame that only changes a dialog costs the GIF the dialog, not the whole tiled
 * map again. The last slot is kept for transparency, and added only after the frames are indexed,
 * so no changed pixel can land on it.
 */
function encodeFrames(frames) {
  const allPixels = new Uint8Array(frames.reduce((total, frame) => total + frame.data.length, 0))
  let offset = 0
  for (const frame of frames) {
    allPixels.set(frame.data, offset)
    offset += frame.data.length
  }
  const palette = quantize(allPixels, 255, { format: paletteFormat })
  const indexedFrames = frames.map((frame) => applyPalette(frame.data, palette, paletteFormat))
  const transparentIndex = palette.length
  palette.push([0, 0, 0])

  const changedOnly = indexedFrames.map((indexedFrame, index) => {
    const previous = indexedFrames[index - 1]
    if (!previous) return indexedFrame
    return indexedFrame.map((paletteIndex, pixel) =>
      paletteIndex === previous[pixel] ? transparentIndex : paletteIndex,
    )
  })

  return { palette, transparentIndex, indexedFrames: changedOnly }
}

async function main() {
  await rm(frameDir, { force: true, recursive: true })

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const result = spawnSync(command, ['playwright', 'test', 'e2e/demo.spec.ts', '--project=demo'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PLAYWRIGHT_DEMO_FRAME_DIR: frameDir,
    },
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const frameNames = (await readdir(frameDir))
    .filter((fileName) => fileName.endsWith('.png'))
    .sort((left, right) => left.localeCompare(right))

  if (frameNames.length === 0) {
    throw new Error(`No demo frames were generated in ${frameDir}`)
  }

  const frames = []
  for (const frameName of frameNames) {
    frames.push(PNG.sync.read(await readFile(path.join(frameDir, frameName))))
  }
  const { width, height } = frames[0]
  const gif = GIFEncoder()

  const { palette, transparentIndex, indexedFrames } = encodeFrames(frames)

  for (const [index, indexedFrame] of indexedFrames.entries()) {
    gif.writeFrame(indexedFrame, width, height, {
      delay: index === frames.length - 1 ? finalFrameDelay : defaultFrameDelay,
      // The first frame carries the palette as the GIF's global one; the others reuse it.
      ...(index === 0
        ? { palette, repeat: 0 }
        : { dispose: 1, transparent: true, transparentIndex }),
    })
  }

  gif.finish()

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.from(gif.bytes()))
}

main().catch((error) => {
  console.error('Failed to generate the demo GIF:', error)
  process.exit(1)
})
