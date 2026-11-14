import * as R from "./ruijie.mts"
import { addLog, blockEverywhere, loadState, LogItem, rebootGroups, Rule, saveState, unblockEverywhere, vn } from "./state.mts"

type Action =
  | { kind: "reboot"; gids: number[]; label: string }
  | { kind: "wifi"; enable: boolean; targets: { gid: number; ssidIds: number[] }[]; label: string }
  | { kind: "block" | "unblock"; mac: string; gids: number[]; label: string }

const prevDay = (d: number) => (d + 6) % 7

// Các hành động đến hạn đúng phút `ms` (giờ VN)
function dueAt(rules: Rule[], ms: number): Action[] {
  const { hm, dow } = vn(ms)
  const out: Action[] = []
  for (const r of rules) {
    if (!r.enabled) continue
    const days = r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6]
    if (r.type === "reboot" && r.at === hm && days.includes(dow))
      out.push({ kind: "reboot", gids: r.gids ?? [], label: r.name })
    if (r.type === "wifi" && r.offAt && r.onAt) {
      if (r.offAt === hm && days.includes(dow))
        out.push({ kind: "wifi", enable: false, targets: r.targets ?? [], label: r.name })
      const overnight = r.onAt <= r.offAt
      if (r.onAt === hm && days.includes(overnight ? prevDay(dow) : dow))
        out.push({ kind: "wifi", enable: true, targets: r.targets ?? [], label: r.name })
    }
    if (r.type === "block" && r.from && r.to && r.mac) {
      if (r.from === hm && days.includes(dow)) out.push({ kind: "block", mac: r.mac, gids: r.gids ?? [], label: r.name })
      const overnight = r.to <= r.from
      if (r.to === hm && days.includes(overnight ? prevDay(dow) : dow))
        out.push({ kind: "unblock", mac: r.mac, gids: r.gids ?? [], label: r.name })
    }
  }
  return out
}

export async function exec(a: Action, by: string): Promise<LogItem> {
  const t = Date.now()
  try {
    if (a.kind === "reboot") {
      const sns = await rebootGroups(a.gids)
      return { t, ok: true, by, text: `Khởi động lại ${sns.length} router — ${a.label}` }
    }
    if (a.kind === "wifi") {
      for (const tg of a.targets) await R.setSsids(tg.gid, tg.ssidIds, a.enable)
      return { t, ok: true, by, text: `${a.enable ? "Bật" : "Tắt"} WiFi — ${a.label}` }
    }
    if (a.kind === "block") {
      await blockEverywhere(a.mac, a.gids)
      return { t, ok: true, by, text: `Chặn mạng — ${a.label}` }
    }
    await unblockEverywhere(a.mac, a.gids)
    return { t, ok: true, by, text: `Mở chặn — ${a.label}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi: ${a.label} — ${e.message}` }
  }
}

// Gọi mỗi phút: chạy lịch đến hạn (bù tối đa 10 phút nếu lỡ nhịp) + mở chặn tạm thời hết hạn
export async function tick(now = Date.now()) {
  const s = await loadState()
  const minute = Math.floor(now / 60000) * 60000
  const last = s.lastTick ? Math.max(s.lastTick, minute - 10 * 60000) : minute - 60000
  const actions: Action[] = []
  for (let m = last + 60000; m <= minute; m += 60000) actions.push(...dueAt(s.rules, m))

  const expired = s.temps.filter((x) => x.until <= now)
  if (!actions.length && !expired.length && s.lastTick === minute) return { ran: 0 }

  const logs: LogItem[] = []
  for (const a of actions) logs.push(await exec(a, "Hẹn giờ"))
  const cleared: typeof expired = []
  for (const x of expired) {
    const r = await exec({ kind: "unblock", mac: x.mac, gids: x.gids, label: `${x.name} (hết giờ chặn tạm)` }, "Hẹn giờ")
    // lỗi thì giữ lại để phút sau thử tiếp, chỉ ghi log lần đầu lỗi mỗi 10 phút
    if (r.ok) cleared.push(x)
    if (r.ok || (now - x.until) % 600000 < 60000) logs.push(r)
  }

  // reload để không ghi đè thay đổi người dùng làm trong lúc chạy
  const s2 = await loadState()
  s2.temps = s2.temps.filter((x) => !cleared.some((e) => e.mac === x.mac && e.until === x.until))
  s2.lastTick = minute
  await saveState(s2)
  await addLog(logs)
  return { ran: actions.length + expired.length }
}
