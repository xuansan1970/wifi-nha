import type { Config } from "@netlify/functions"
import { tick } from "./lib/engine.mts"
import { loadBeat, saveBeat, selfChecks } from "./lib/health.mts"
import { runBackup, runDigest } from "./lib/backup.mts"
import { raise } from "./lib/notify.mts"
import { driftCheck } from "./lib/family.mts"

// Chạy mỗi 5 phút (UTC) — lịch tự quy đổi sang giờ Việt Nam bên trong
export default async () => {
  const now = Date.now()
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
  await driftCheck(now).catch((e) => console.error("drift", e))
  await selfChecks(now, prev).catch((e) => console.error("selfChecks", e))
}

export const config: Config = { schedule: "*/5 * * * *" }
