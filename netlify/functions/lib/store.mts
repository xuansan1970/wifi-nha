import { getStore } from "@netlify/blobs"

export const envGet = (name: string): string | undefined =>
  (globalThis as any).__CF_ENV?.[name] ??
  (globalThis as any).Netlify?.env?.get?.(name) ??
  (typeof process !== "undefined" ? process.env?.[name] : undefined)

const SOFT_CACHE_KEYS = new Set(["snapshot", "session", "oui", "usage"])
// KV báo vượt giới hạn theo 2 kiểu: "429 Too Many Requests" (ghi 1 key quá nhanh) và "limit exceeded for the day" (hết quota ngày gói Free)
export const isKvLimit = (e: any) => /429|limit exceeded/i.test(String(e?.message || e))

async function safeKvPut(kv: any, key: string, val: string, opts?: any) {
  try {
    await kv.put(key, val, opts)
  } catch (e: any) {
    if (SOFT_CACHE_KEYS.has(key) && isKvLimit(e)) {
      console.warn(`KV 429 skipped for cache key "${key}"`)
      return
    }
    throw e
  }
}

export const store = () => {
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    return {
      get: (key: string, opts?: { type?: string }) => kv.get(key, opts?.type === "json" ? "json" : "text"),
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

export async function getJSON<T>(key: string, fb: T): Promise<T> {
  const kv = (globalThis as any).__CF_KV
  if (kv) return (((await kv.get(key, "json")) as T) ?? fb) as T
  return (((await store().get(key, { type: "json" })) as T) ?? fb) as T
}

export async function setJSON(key: string, v: any) {
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    await safeKvPut(kv, key, JSON.stringify(v))
    return
  }
  await store().setJSON(key, v)
}
