import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function pngDimensions(bytes: Buffer) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

test('manifest has installable Tretmax branding and correctly sized PNG icons', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
  assert.equal(manifest.name, 'Tretmax Games')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.theme_color, '#11120f')
  assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ['192x192', '512x512'])

  const icons: Array<[string, number]> = [['tretmax-192.png', 192], ['tretmax-512.png', 512]]
  for (const [file, size] of icons) {
    const dimensions = pngDimensions(await readFile(resolve(root, 'public/icons', file)))
    assert.deepEqual(dimensions, { width: size, height: size })
  }
})

test('service worker keeps SPA fallback but only caches public static assets', async () => {
  const serviceWorker = await readFile(resolve(root, 'public/sw.js'), 'utf8')
  assert.match(serviceWorker, /request\.mode === 'navigate'/)
  assert.match(serviceWorker, /fetch\(request\)\.catch\(\(\) => caches\.match\(APP_SHELL\)/)
  assert.match(serviceWorker, /url\.search/)
  assert.match(serviceWorker, /SUPABASE_PATHS/)
  assert.match(serviceWorker, /url\.pathname\.startsWith\('\/assets\/'\)/)
  assert.doesNotMatch(serviceWorker, /caches\.put\(request, response\.clone\(\)\).*rest\/v1/i)
})
