import type { AppSettings, EngineStatus } from '@/types'
import { asBlob } from '@/lib/utils'

function root() {
  return import.meta.env.DEV ? '' : 'http://127.0.0.1:47232'
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { error?: string }
    if (parsed.error) return parsed.error
  } catch {
    /* 响应不是 JSON */
  }
  return text || `请求失败（${response.status}）`
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(root() + path, init)
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as T
}

export async function apiBytes(path: string, init?: RequestInit): Promise<{ data: Uint8Array; filename?: string }> {
  const response = await fetch(root() + path, init)
  if (!response.ok) throw new Error(await errorMessage(response))
  const encoded = response.headers.get('X-Filename')
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    filename: encoded ? decodeURIComponent(encoded) : undefined,
  }
}

export function getEngines() {
  return apiJson<EngineStatus>('/api/engines')
}

export function getSettings() {
  return apiJson<AppSettings>('/api/settings')
}

export function putSettings(settings: AppSettings) {
  return apiJson<AppSettings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

export async function fetchFixture(name: string) {
  const result = await apiBytes(`/api/fixtures/${encodeURIComponent(name)}`)
  return result.data
}

export async function listFixtures() {
  return apiJson<{ files: { name: string; size: number }[] }>('/api/fixtures')
}

export async function exportDocx(html: string) {
  const result = await apiBytes('/api/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  })
  return result.data
}

export async function convertOnServer(filename: string, data: Uint8Array, target: string) {
  const result = await apiBytes(`/api/convert?target=${encodeURIComponent(target)}&filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    body: asBlob(data),
  })
  return { filename: result.filename || `转换.${target}`, data: result.data }
}

let fontBytes: Promise<Uint8Array> | null = null
export function loadFont() {
  fontBytes ??= apiBytes('/api/font').then((result) => result.data)
  return fontBytes
}

export async function registerOnlyOffice(filename: string, fileType: string, data: Uint8Array) {
  return apiJson<{ id: string; revision: number }>(
    `/api/onlyoffice/register?filename=${encodeURIComponent(filename)}&fileType=${encodeURIComponent(fileType)}`,
    { method: 'POST', body: asBlob(data) },
  )
}

export function onlyOfficeConfig(id: string) {
  return apiJson<Record<string, unknown>>(`/api/onlyoffice/config/${id}`)
}

export function forceSaveOnlyOffice(id: string) {
  return apiJson<{ ok: boolean; error: number | null; revision: number }>(`/api/onlyoffice/forcesave/${id}`, { method: 'POST' })
}

export function onlyOfficeStatus(id: string) {
  return apiJson<{ revision: number; lastStatus: number | null; error: string | null }>(`/api/onlyoffice/docs/${id}`)
}

export async function onlyOfficeBytes(id: string) {
  const result = await apiBytes(`/api/onlyoffice/file/${id}`)
  return result.data
}
