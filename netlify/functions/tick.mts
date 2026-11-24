import type { Config } from "@netlify/functions"
import { tick } from "./lib/engine.mts"
import { loadBeat, saveBeat, selfChecks } from "./lib/health.mts"
import { runBackup, runDigest } from "./lib/backup.mts"
import { raise } from "./lib/notify.mts"
import { driftCheck } from "./lib/family.mts"
import { applyApps, configured } from "./lib/appblock.mts"
import { auditDue, auditOnce, expStep } from "./lib/audit.mts"
import { blockWatch } from "./lib/blockwatch.mts"

// Chạy mỗi 5 phút (UTC) — lịch tự quy đổi sang giờ Việt Nam bên trong
export default async () => {
  const now = Date.now()
  // Lượt kiểm toán (1 lần mỗi AUDIT_ID) chạy riêng 1 nhịp để đủ lượt gọi mạng; lịch bị lỡ 5 phút sẽ được bù ở nhịp sau
  // Nhịp dành cho bước thử nghiệm: vẫn ghi "nhịp tim" để hệ thống giám sát không báo động giả
  if (await expStep().catch((e) => (console.error("exp", e), false))) return void (await saveBeat({ at: now, ok: true, ran: 0 }).catch(() => {}))
  if (await auditDue().catch(() => false)) return void (await auditOnce().catch((e) => console.error("audit", e)))
  const prev = await loadBeat().catch(() => null)
  try {
    const r = await tick()
    if (r.ran) console.log("tick ran", r.ran)
    await saveBeat({ at: now, ok: true, ran: r.ran })
  } catch (e: any) {
    console.error("tick error", e)
    const err = String(e?.message || e).slice(0, 160)
    await saveBeat({ at: now, ok: false, ran: 0, err }).catch(() => {})
    await raise("tick-error", "Bộ chạy lịch bị lỗi", `Lần chạy lịch lúc này thất bại: ${err}`, 3 * 3600e3).catch(() => {})
  }
  await runBackup(now).catch((e) => console.error("backup", e))
  await runDigest(now).catch((e) => console.error("digest", e))
  // Chặn game: bộ lọc không còn nhận ra mạng nhà (IP nhà đổi) hoặc không ghi được lên NextDNS thì phải báo, vì lúc đó KHÔNG chặn được gì
  const ap = await applyApps(now).catch((e) => void console.error("appblock", e))
  if (ap && configured() && ap.ip && ap.linked !== ap.ip)
    await raise("appblock-ip", "Chặn game đang không hoạt động: IP nhà đã đổi", `Bộ lọc chỉ nhận ra nhà mình theo IP. IP nhà hiện là ${ap.ip}, bộ lọc đang giữ ${ap.linked || "(trống)"}. Mở app WiFi Nhà bằng WiFi nhà một lần để app tự cập nhật.`, 3 * 3600e3).catch(() => {})
  if (ap?.err) await raise("appblock-err", "Chặn game: chưa áp dụng được thay đổi", `Lỗi khi ghi lên bộ lọc: ${ap.err}`, 3 * 3600e3).catch(() => {})
  await driftCheck(now).catch((e) => console.error("drift", e))
  await blockWatch(now).catch((e) => console.error("blockwatch", e))
  await selfChecks(now, prev).catch((e) => console.error("selfChecks", e))
}

export const config: Config = { schedule: "*/5 * * * *" }
