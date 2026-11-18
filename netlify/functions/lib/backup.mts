import { addLog, vn } from "./state.mts"
import { auditList, delKey, getJSON, setJSON } from "./store.mts"
import { raise, sendMail } from "./notify.mts"

// Backup: gửi bản sao lịch/cài đặt (không có PIN, không có khoá) về email, mỗi ngày 1 lần (khoảng 03:00 giờ VN).
// Khi quay lại phiên bản cũ chỉ trả phần cấu hình, giữ nguyên trạng thái đang chạy (on/ghost/lim/lastTick…)
export const CONFIG_FIELDS: Record<string, string[] | null> = { family: ["rules", "limits", "timers"], state: ["rules", "temps", "people"], meta: null }
export const BACKUP_KEYS = ["family", "state", "meta"] as const
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

export async function makeBackup() {
  const data: Record<string, any> = {}
  for (const k of BACKUP_KEYS) data[k] = await getJSON<any>(k, null)
  return { at: Date.now(), data }
}

export async function runBackup(now = Date.now(), force = false) {
  const last = await getJSON<{ at: number }>("backup", { at: 0 })
  const v = vn(now)
  if (!force && (now - last.at < 20 * 3600e3 || !v.hm.startsWith("03:"))) return false
  const bk = await makeBackup()
  const res = await sendMail(`[WiFi Nhà] Backup ${v.date}`, "Bản sao lịch và cài đặt WiFi Nhà (file đính kèm, JSON). Khôi phục: app > admin > /api/restore.", [
    { filename: `wifi-nha-backup-${v.date}.json`, content: b64(JSON.stringify(bk)) },
  ])
  if (!res.ok) {
    await raise("backup-fail", "Backup hằng ngày không gửi được", res.error || "")
    return false
  }
  await setJSON("backup", { at: now })
  await addLog([{ t: now, ok: true, by: "Hệ thống", role: "system", text: `Đã gửi backup ${v.date} về email` }])
  return true
}

// Thử khôi phục thật: ghi bản backup vào khoá tạm bằng ĐÚNG đường đi của khôi phục, đọc lại, so khớp từng byte, rồi xoá khoá tạm.
export async function restoreTest() {
  const bk = await makeBackup()
  const wire = JSON.parse(JSON.stringify(bk))
  const out: Record<string, boolean> = {}
  for (const k of BACKUP_KEYS) {
    await setJSON(`__restoretest_${k}`, wire.data[k])
    const back = await getJSON<any>(`__restoretest_${k}`, undefined)
    out[k] = JSON.stringify(back) === JSON.stringify(bk.data[k])
    await delKey(`__restoretest_${k}`)
  }
  return { ok: Object.values(out).every(Boolean), keys: out }
}

// Tóm tắt thao tác của Ba Mẹ trong 24h qua, gửi cho San mỗi tối (khoảng 21:00 giờ VN), chỉ gửi khi có thao tác.
export async function runDigest(now = Date.now(), force = false) {
  const last = await getJSON<{ at: number }>("digest", { at: 0 })
  if (!force && (now - last.at < 20 * 3600e3 || !vn(now).hm.startsWith("21:"))) return false
  const rows = (await auditList(500)).filter((r: any) => r.role === "parent" && r.t >= now - 24 * 3600e3)
  await setJSON("digest", { at: now })
  if (!rows.length) return false
  const lines = rows.reverse().map((r: any) => `${vn(r.t).hm} · ${r.by}: ${r.text}`)
  const res = await sendMail(`[WiFi Nhà] Ba Mẹ đã thao tác ${rows.length} lần hôm nay`, lines.join("\n"))
  return res.ok
}
