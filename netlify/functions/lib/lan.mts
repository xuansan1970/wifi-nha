// Thông tin máy do "máy quét trong mạng nhà" tìm ra (bin/lan-scan.py chạy trên một máy đang ở nhà):
// tên thật, đời máy, hệ điều hành của những máy mà Ruijie không biết (máy giấu tên, tên rác kiểu "*", "localhost", "wlan0").
// Chỉ ĐIỀN CHỖ TRỐNG: tên anh San tự đặt và tên Ruijie có sẵn luôn được giữ.
import { macKey } from "./ruijie.mts"
import { getJSON, setJSON } from "./store.mts"

export type LanInfo = { name?: string; model?: string; os?: string; ip?: string; via?: string; at: number }
export const loadLan = () => getJSON<Record<string, LanInfo>>("lan", {})
const clean = (v: any, max: number) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max)
const JUNK_NAME = /^(\*|localhost|wlan\d*|lwip\d*|unknown|android|espressif)$/i

export async function saveLan(list: any) {
  const cur = await loadLan()
  const now = Date.now()
  let saved = 0
  for (const d of Array.isArray(list) ? list.slice(0, 300) : []) {
    const mac = macKey(String(d?.mac ?? ""))
    if (mac.length !== 12) continue
    const name = clean(d.name, 60), model = clean(d.model, 60), os = clean(d.os, 30)
    if (!name && !model && !os) continue
    cur[mac] = { ...cur[mac], ...(name ? { name } : {}), ...(model ? { model } : {}), ...(os ? { os } : {}), ip: clean(d.ip, 40), via: clean(d.via, 80), at: now }
    saved++
  }
  // Giữ tối đa 600 máy mới nhất
  const keep = Object.entries(cur).sort((a, b) => b[1].at - a[1].at).slice(0, 600)
  await setJSON("lan", Object.fromEntries(keep))
  return { ok: true, saved, total: keep.length }
}
// Ghép vào thông tin Ruijie trước khi nhận diện máy
export function withLan<T extends { rawName?: string; model?: string; os?: string }>(c: T, info?: LanInfo): T {
  if (!info) return c
  const raw = String(c.rawName ?? "").trim()
  return { ...c, rawName: info.name && (!raw || JUNK_NAME.test(raw)) ? info.name : c.rawName, model: c.model || info.model || "", os: c.os || info.os || "" }
}
