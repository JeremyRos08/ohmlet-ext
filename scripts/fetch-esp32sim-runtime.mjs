import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BASE = process.env.ESP32SIM_RUNTIME_URL ?? 'https://joakimeriksson.github.io/esp32sim'
const OUT = join(process.cwd(), 'public', 'esp32sim')
const REFRESH = process.env.ESP32SIM_REFRESH === '1'

const assets = [
  ['wasm/esp32sim.wasm', 'esp32sim.wasm', 500_000],
  ['wasm/worker.js', 'worker.js', 1_000],
  ['wasm/jit.mjs', 'jit.mjs', 500],
  ['wasm/pacing.mjs', 'pacing.mjs', 500],
  ['wasm/fw/esp32s3_rev0_rom.elf', 'esp32s3_rev0_rom.elf', 100_000],
]

async function usable(path, minBytes) {
  try {
    const s = await stat(path)
    return s.isFile() && s.size >= minBytes
  } catch {
    return false
  }
}

async function download(remote, local, minBytes) {
  if (!REFRESH && await usable(local, minBytes)) return
  const url = `${BASE.replace(/\/$/, '')}/${remote}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`ESP32 runtime download failed: ${res.status} ${url}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength < minBytes) {
    throw new Error(`ESP32 runtime asset too small (${bytes.byteLength} bytes): ${url}`)
  }
  await mkdir(dirname(local), { recursive: true })
  await writeFile(local, bytes)
  console.log(`ESP32 runtime: ${remote} -> ${local} (${bytes.byteLength} bytes)`)
}

await mkdir(OUT, { recursive: true })
for (const [remote, name, minBytes] of assets) {
  await download(remote, join(OUT, name), minBytes)
}
