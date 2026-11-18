import { addLog, vn } from "./state.mts"
import { envGet, getJSON, setJSON } from "./store.mts"

// Cảnh báo gửi qua email (Resend). Cần secret RESEND_API_KEY; tài khoản Resend đăng ký bằng chính email nhận.
export const ALERT_TO = "sanxuansan@gmail.com"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sendMail(subject: string, text: string, attachments?: { filename: string; content: string }[]): Promise<{ ok: boolean; error?: string }> {
  const key = envGet("RESEND_API_KEY")
  if (!key) return { ok: false, error: "chưa cài RESEND_API_KEY" }
  let last = ""
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "WiFi Nhà <onboarding@resend.dev>", to: [ALERT_TO], subject, text, ...(attachments ? { attachments } : {}) }),
      })
      if (r.ok) return { ok: true }
      last = `${r.status} ${(await r.text()).slice(0, 120)}`
      if (r.status < 500 && r.status !== 429) break
    } catch (e: any) {
      last = String(e?.message || e).slice(0, 120)
    }
    await sleep(1500)
  }
  return { ok: false, error: last }
}

// Sổ cảnh báo: mỗi sự cố (key) chỉ gửi 1 email trong cooldown, tự gửi "đã phục hồi" khi hết thấy lỗi
type Rec = { since: number; lastSent: number; lastSeen: number; subject: string; recover: boolean }
const KEY = "alerts"

export async function raise(key: string, subject: string, text: string, cooldownMs = 3 * 3600e3, noRecover = false) {
  const map = await getJSON<Record<string, Rec>>(KEY, {})
  const now = Date.now()
  const isNew = !map[key]
  const r = (map[key] ??= { since: now, lastSent: 0, lastSeen: now, subject, recover: !noRecover })
  r.lastSeen = now
  if (now - r.lastSent >= cooldownMs) {
    const v = vn(now)
    const res = await sendMail(`[WiFi Nhà] ${subject}`, `${text}\n\nLúc: ${v.date} ${v.hm} (giờ Việt Nam)`)
    if (res.ok) r.lastSent = now
    else if (isNew) await addLog([{ t: now, ok: false, by: "Hệ thống", text: `Chưa gửi được email cảnh báo "${subject}": ${res.error}` }])
  }
  if (isNew) await addLog([{ t: now, ok: false, by: "Hệ thống", text: subject }])
  await setJSON(KEY, map)
}

export async function sweep(now = Date.now(), quietMs = 15 * 60e3) {
  const map = await getJSON<Record<string, Rec>>(KEY, {})
  let changed = false
  for (const [k, r] of Object.entries(map)) {
    if (now - r.lastSeen < quietMs) continue
    delete map[k]
    changed = true
    if (!r.recover) continue
    await addLog([{ t: now, ok: true, by: "Hệ thống", text: `Đã phục hồi: ${r.subject}` }])
    await sendMail(`[WiFi Nhà] Đã phục hồi: ${r.subject}`, `Sự cố "${r.subject}" bắt đầu lúc ${vn(r.since).date} ${vn(r.since).hm} (giờ VN) và không còn xuất hiện.`)
  }
  if (changed) await setJSON(KEY, map)
}
