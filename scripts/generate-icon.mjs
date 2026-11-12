import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    rgba[i] = r
    rgba[i + 1] = g
    rgba[i + 2] = b
    rgba[i + 3] = a
  }
  const cx = size / 2
  const cy = size / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = size * 0.42
      if (dist < radius) {
        const ink = dist > radius - size * 0.035
        if (ink) set(x, y, 243, 210, 200)
        else {
          const t = (y - (cy - radius)) / (radius * 2)
          set(x, y, 168 - t * 40, 56 - t * 10, 46)
        }
      } else set(x, y, 36, 31, 28, 255)
      const pageX = cx - size * 0.12
      const pageY = cy - size * 0.16
      const pageW = size * 0.26
      const pageH = size * 0.32
      if (x > pageX && x < pageX + pageW && y > pageY && y < pageY + pageH) set(x, y, 251, 247, 240)
      if (y > pageY + size * 0.08 && y < pageY + size * 0.1 && x > pageX + size * 0.04 && x < pageX + pageW - size * 0.04) {
        set(x, y, 156, 59, 46)
      }
      if (y > pageY + size * 0.15 && y < pageY + size * 0.165 && x > pageX + size * 0.04 && x < pageX + pageW - size * 0.07) {
        set(x, y, 110, 100, 92)
      }
      if (y > pageY + size * 0.2 && y < pageY + size * 0.215 && x > pageX + size * 0.04 && x < pageX + pageW - size * 0.1) {
        set(x, y, 110, 100, 92)
      }
    }
  }
  return png(size, size, rgba)
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
mkdirSync(path.join(root, 'build'), { recursive: true })
mkdirSync(path.join(root, 'public'), { recursive: true })
const image = draw(512)
writeFileSync(path.join(root, 'build', 'icon.png'), image)
writeFileSync(path.join(root, 'public', 'favicon.png'), image)
console.log('icon written')
