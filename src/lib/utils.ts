import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function asBlob(data: Uint8Array, type?: string) {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return new Blob([copy.buffer], type ? { type } : undefined)
}
