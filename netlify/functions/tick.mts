import type { Config } from "@netlify/functions"
import { tick } from "./lib/engine.mts"

// Chạy mỗi phút (UTC) — lịch tự quy đổi sang giờ Việt Nam bên trong
export default async () => {
  try {
    const r = await tick()
    if (r.ran) console.log("tick ran", r.ran)
  } catch (e) {
    console.error("tick error", e)
  }
}

export const config: Config = { schedule: "* * * * *" }
