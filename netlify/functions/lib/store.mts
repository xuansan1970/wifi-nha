import { getStore } from "@netlify/blobs"
export const store = () => getStore({ name: "wifi-admin", consistency: "strong" })
export async function getJSON<T>(key: string, fb: T): Promise<T> {
  return (((await store().get(key, { type: "json" })) as T) ?? fb) as T
}
export async function setJSON(key: string, v: any) {
  await store().setJSON(key, v)
}
