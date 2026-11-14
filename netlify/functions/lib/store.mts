import { getStore } from "@netlify/blobs"

export const envGet = (name: string): string | undefined =>
  (globalThis as any).__CF_ENV?.[name] ??
  (globalThis as any).Netlify?.env?.get?.(name) ??
  (typeof process !== "undefined" ? process.env?.[name] : undefined)

export const store = () => {
  const kv = (globalThis as any).__CF_KV
  if (kv) {
    return {
      get: (key: string, opts?: { type?: string }) => kv.get(key, opts?.type === "json" ? "json" : "text"),
      setJSON: (key: string, v: any, opts?: { metadata?: any }) =>
        kv.put(key, JSON.stringify(v), opts?.metadata ? { metadata: opts.metadata } : undefined),
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
    await kv.put(key, JSON.stringify(v))
    return
  }
  await store().setJSON(key, v)
}
