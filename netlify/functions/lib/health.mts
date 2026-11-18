import { getJSON, setJSON } from "./store.mts"
import { raise, sweep } from "./notify.mts"
import { vn } from "./state.mts"

// Nhịp tim của bộ chạy lịch (cron 5 phút). /api/health đọc lại để watchdog bên ngoài (GitHub Actions) kiểm tra.
export type Beat = { at: number; ok: boolean; ran: number; err?: string }
export const loadBeat = () => getJSON<Beat | null>("beat", null)
export const saveBeat = (b: Beat) => setJSON("beat", b)
export const pingWatchdog = () => setJSON("watchdog", { at: Date.now() })

const STALE_MS = 15 * 60000
export async function healthStatus(now = Date.now()) {
  const [b, w] = await Promise.all([loadBeat(), getJSON<{ at: number } | null>("watchdog", null)])
  return {
    ok: !!b && b.ok && now - b.at <= STALE_MS,
    tickAgeMin: b ? Math.round((now - b.at) / 60000) : null,
    lastTickOk: b?.ok ?? null,
    lastError: b?.err ?? null,
    watchdogAgeMin: w ? Math.round((now - w.at) / 60000) : null,
  }
}

// Chạy sau mỗi nhịp: phát hiện gián đoạn, watchdog bị tắt, rồi dọn cảnh báo đã hết
export async function selfChecks(now: number, prev: Beat | null) {
  if (prev && now - prev.at > 12 * 60000) {
    const mins = Math.round((now - prev.at) / 60000)
    await raise(
      `gap-${Math.floor(now / 3600e3)}`,
      "Lịch bị gián đoạn",
      `Bộ chạy lịch ngừng khoảng ${mins} phút (từ ${vn(prev.at).hm} đến ${vn(now).hm} giờ VN). Hệ thống chỉ tự bù tối đa 10 phút, phần còn lại có thể đã bị bỏ sót. Hãy mở app kiểm tra các lịch trong khoảng này.`,
      24 * 3600e3,
      true,
    )
  }
  const w = await getJSON<{ at: number } | null>("watchdog", null)
  if (w && now - w.at > 45 * 60000)
    await raise("watchdog", "Watchdog GitHub không còn ping", `Đã ${Math.round((now - w.at) / 60000)} phút không có lần kiểm tra nào từ GitHub Actions (có thể workflow bị GitHub tự tắt sau 60 ngày repo không hoạt động). Vào GitHub > Actions > watchdog để bật lại.`, 6 * 3600e3)
  await sweep(now)
}
