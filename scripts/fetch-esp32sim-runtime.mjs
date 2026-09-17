import { mkdir, stat, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

// The runtime branch is produced by .github/workflows/esp32-runtime.yml from a
// pinned esp32sim revision plus Ohmlet's GPIO/display bridge patches. Using the
// upstream demo site here silently dropped those patches, so firmware could run
// while its GPIO never reached the solved breadboard circuit.
const RUNTIME_REVISION = '150ca548a9abdf8f6c45e88e9e2a61db57e6dca1'
const BASE =
  process.env.ESP32SIM_RUNTIME_URL ??
  `https://raw.githubusercontent.com/JeremyRos08/ohmlet-ext/${RUNTIME_REVISION}`
const OUT = join(process.cwd(), 'public', 'esp32sim')
const marker = join(OUT, 'runtime-version.txt')
const installed = await readFile(marker, 'utf8').catch(() => '')
const REFRESH = process.env.ESP32SIM_REFRESH === '1' || installed !== BASE

// Runtime-branch assets are intentionally flat. ESP32SIM_RUNTIME_URL can point
// at a mirror with the same layout for offline/private deployments.
const assets = [
  ['esp32sim.wasm', 'esp32sim.wasm', 500_000],
  ['worker.js', 'worker.js', 1_000],
  ['jit.mjs', 'jit.mjs', 500],
  ['pacing.mjs', 'pacing.mjs', 500],
  ['esp32s3_rev0_rom.elf', 'esp32s3_rev0_rom.elf', 100_000],
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

// Record the version only after every asset has downloaded successfully.
await writeFile(marker, BASE)
