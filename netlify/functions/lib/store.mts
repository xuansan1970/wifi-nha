import { getStore } from "@netlify/blobs"

export const envGet = (name: string): string | undefined =>
  (globalThis as any).__CF_ENV?.[name] ??
  (globalThis as any).Netlify?.env?.get?.(name) ??
  (typeof process !== "undefined" ? process.env?.[name] : undefined)

// Key phụ: hết quota KV thì bỏ qua (app vẫn chạy), không làm sập request
const SOFT_CACHE_KEYS = new Set(["snapshot", "session", "oui", "usage", "devices", "log"])
const isSoft = (k: string) => SOFT_CACHE_KEYS.has(k) || k.startsWith("seen-")
// KV báo vượt giới hạn theo 2 kiểu: "429 Too Many Requests" (ghi 1 key quá nhanh) và "limit exceeded for the day" (hết quota ngày gói Free)
export const isKvLimit = (e: any) => /429|limit exceeded/i.test(String(e?.message || e))

// Ghi KV; nếu hết quota ngày (gói Free 1.000 lần ghi) → lưu tạm sang Cache API để app vẫn chạy
async function safeKvPut(kv: any, key: string, val: string, opts?: any) {
  try {
    await kv.put(key, val, opts)
    if (!isSoft(key)) await cacheDel(FB(key)) // KV ghi lại được → bỏ bản tạm
  } catch (e: any) {
    if (!isKvLimit(e)) throw e
    if (isSoft(key)) return console.warn(`KV hết quota, bỏ qua key phụ "${key}"`)
    console.warn(`KV hết quota, lưu tạm "${key}" vào Cache API`)
    await cachePutRaw(FB(key), val, 2 * 86400)
  }
}
const FB = (k: string) => `kvfb:${k}`

export const store = () => {
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    return {
      get: async (key: string, opts?: { type?: string }) => {
        if (!isSoft(key)) {
          const t = await cacheGet<any>(FB(key))
          if (t !== null) return opts?.type === "json" ? t : JSON.stringify(t)
        }
        return kv.get(key, opts?.type === "json" ? "json" : "text")
      },
      setJSON: (key: string, v: any, opts?: { metadata?: any }) =>
        safeKvPut(kv, key, JSON.stringify(v), opts?.metadata ? { metadata: opts.metadata } : undefined),
      getMetadata: async (key: string) => {
        const r = await kv.getWithMetadata(key, "text")
        return r?.metadata != null ? { metadata: r.metadata } : null
      },
    } as any
  }
  return getStore({ name: "wifi-admin", consistency: "strong" })
}

// ---- Nơi lưu chính: Durable Object (1 bản duy nhất cho mọi thiết bị, gói Free 100.000 lần ghi/ngày) ----
// Trước 16/11/2026 dữ liệu nằm ở KV (gói Free chỉ 1.000 lần ghi/ngày, hết thì lưu tạm từng data center → mỗi máy thấy 1 kiểu).
// Lần đầu đọc 1 key chưa có trong Durable Object: lấy bản mới nhất từ KV/bản tạm rồi chép sang.
const DO = () => (globalThis as any).__CF_DO as { get(k: string): Promise<any>; put(k: string, v: any): Promise<void> } | undefined
async function legacyGet<T>(key: string): Promise<T | null> {
  const kv = (globalThis as any).__CF_KV
  if (!kv) return null
  if (!isSoft(key)) {
    const t = await cacheGet<T>(FB(key))
    if (t !== null) return t
  }
  return ((await kv.get(key, "json")) as T) ?? null
}

export async function getJSON<T>(key: string, fb: T): Promise<T> {
  const d = DO()
  if (d) {
    const v = await d.get(key)
    if (v !== undefined && v !== null) return v as T
    const old = await legacyGet<T>(key).catch(() => null)
    if (old !== null) {
      await d.put(key, old)
      return old
    }
    return fb
  }
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    if (!isSoft(key)) {
      const t = await cacheGet<T>(FB(key))
      if (t !== null) return t
    }
    return (((await kv.get(key, "json")) as T) ?? fb) as T
  }
  return (((await store().get(key, { type: "json" })) as T) ?? fb) as T
}

export async function setJSON(key: string, v: any) {
  const d = DO()
  if (d) return d.put(key, v)
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    await safeKvPut(kv, key, JSON.stringify(v))
    return
  }
  await store().setJSON(key, v)
}

// ---- Cache API của Cloudflare: lưu tạm miễn phí, không tính quota KV (mỗi data center 1 bản) ----
const CACHE_URL = (key: string) => `https://wifi-nha.cache/${encodeURIComponent(key)}`
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const c = (globalThis as any).caches?.default
    if (!c) return null
    const r = await c.match(CACHE_URL(key))
    return r ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}
export async function cachePut(key: string, v: any, ttlSec = 900) {
  try {
    const c = (globalThis as any).caches?.default
    if (!c) return
    await c.put(CACHE_URL(key), new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSec}` } }))
  } catch {}
}
async function cachePutRaw(key: string, body: string, ttlSec: number) {
  try {
    const c = (globalThis as any).caches?.default
    if (c) await c.put(CACHE_URL(key), new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSec}` } }))
  } catch {}
}
async function cacheDel(key: string) {
  try {
    const c = (globalThis as any).caches?.default
    if (c) await c.delete(CACHE_URL(key))
  } catch {}
}
