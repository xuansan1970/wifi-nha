import { raise } from "./notify.mts"
import * as R from "./ruijie.mts"
import { buildSnapshot, patchSnapshot } from "./snapshot.mts"
import { ensureOui } from "./smart.mts"
import { tickFamily } from "./family.mts"
import {
  addLog, blockMacs, labelOf, loadDevices, loadMeta, LogItem, macsOf, mutate, nextMidnightVN, loadState, rebootGroups,
  Rule, State, Target, unblockMacs, vn,
} from "./state.mts"
import { getJSON, isKvLimit, setJSON } from "./store.mts"

export type Action =
  | { kind: "reboot"; gids: number[]; label: string }
  | { kind: "wifi"; enable: boolean; targets: { gid: number; ssidIds: number[] }[]; label: string }
  | { kind: "block" | "unblock"; target: Target; label: string; until?: number; reason?: string }

const prevDay = (d: number) => (d + 6) % 7
const ALL = [0, 1, 2, 3, 4, 5, 6]

function dueAt(rules: Rule[], ms: number): Action[] {
  const { hm, dow } = vn(ms)
  const out: Action[] = []
  for (const r of rules) {
    if (!r.enabled) continue
    const days = r.days?.length ? r.days : ALL
    if (r.type === "reboot" && r.at === hm && days.includes(dow)) out.push({ kind: "reboot", gids: r.gids ?? [], label: r.name })
    if (r.type === "wifi" && r.offAt && r.onAt) {
      if (r.offAt === hm && days.includes(dow)) out.push({ kind: "wifi", enable: false, targets: r.targets ?? [], label: r.name })
      if (r.onAt === hm && days.includes(r.onAt <= r.offAt ? prevDay(dow) : dow))
        out.push({ kind: "wifi", enable: true, targets: r.targets ?? [], label: r.name })
    }
    if (r.type === "block" && r.from && r.to && r.target) {
      if (r.from === hm && days.includes(dow)) out.push({ kind: "block", target: r.target, label: r.name, reason: "theo lịch" })
      if (r.to === hm && days.includes(r.to <= r.from ? prevDay(dow) : dow))
        out.push({ kind: "unblock", target: r.target, label: r.name })
    }
  }
  return out
}

const allGids = async () => (await R.listProjects()).map((p: any) => p.gid)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Thử lại có giới hạn (1,5s rồi 6s) cho lệnh gửi router; hết lượt thì ném lỗi gốc
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i < tries - 1) await sleep(1500 * (i + 1) * (i + 1))
    }
  }
  throw last
}
const hashText = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)

export async function exec(a: Action, by: string): Promise<LogItem> {
  const t = Date.now()
  try {
    if (a.kind === "reboot") {
      const sns = await rebootGroups(a.gids)
      return { t, ok: true, by, text: `Khởi động lại ${sns.length} router · ${a.label}` }
    }
    if (a.kind === "wifi") {
      await retry(() => Promise.all(a.targets.map((tg) => R.setSsids(tg.gid, tg.ssidIds, a.enable))))
      // Đọc lại trạng thái thật trên router; lệch thì coi là lỗi (thử đọc lại 1 lần sau 4s vì router áp dụng chậm)
      for (const tg of a.targets) {
        for (let k = 0; k < 2; k++) {
          await sleep(k ? 4000 : 1200)
          const live = await R.listSsids(tg.gid).catch(() => null)
          if (!live) break
          const bad = live.filter((x: any) => tg.ssidIds.includes(x.id) && x.enable !== a.enable)
          if (!bad.length) break
          if (k) throw new Error(`router chưa áp dụng lệnh (${bad.map((x: any) => x.name).join(", ")})`)
        }
      }
      await patchSnapshot((sn) => {
        for (const tg of a.targets)
          for (const r of sn.routers) if (r.gid === tg.gid) for (const x of r.ssids) if (tg.ssidIds.includes(x.id)) x.enable = a.enable
      })
      return { t, ok: true, by, text: `${a.enable ? "Bật" : "Tắt"} WiFi · ${a.label}` }
    }
    const meta = await loadMeta()
    const macs = macsOf(a.target, meta)
    if (!macs.length) throw new Error("chưa gán thiết bị nào cho người này")
    const gids = await allGids()
    const key = `${a.target.kind}:${a.target.id}`
    if (a.kind === "block") {
      await retry(() => blockMacs(macs, gids))
      await patchSnapshot((sn) => {
        for (const r of sn.routers) r.blocked = [...new Set([...r.blocked, ...macs])]
      })
      await mutate((s) => {
        s.temps = s.temps.filter((x) => x.key !== key)
        if (a.until) s.temps.push({ key, label: a.label, macs, until: a.until, reason: a.reason ?? "" })
      })
      return { t, ok: true, by, text: `Chặn mạng ${a.label}${a.reason ? ` (${a.reason})` : ""}` }
    }
    await retry(() => unblockMacs(macs, gids))
    await patchSnapshot((sn) => {
      for (const r of sn.routers) r.blocked = r.blocked.filter((m: string) => !macs.includes(m))
    })
    await mutate((s) => {
      s.temps = s.temps.filter((x) => x.key !== key)
    })
    return { t, ok: true, by, text: `Mở mạng ${a.label}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi · ${a.label}: ${e.message}` }
  }
}

// ---- Giới hạn thời gian online mỗi ngày (đếm theo phút thiết bị đang kết nối) ----
export type Usage = { date: string; m: Record<string, number>; hit: Record<string, boolean> }

async function quotas(s: State, online: Set<string>, minutes: number, now: number, logs: LogItem[]) {
  const { date, dow } = vn(now)
  let u = await getJSON<Usage>("usage", { date, m: {}, hit: {} })
  if (u.date !== date) u = { date, m: {}, hit: {} }
  for (const mac of online) u.m[mac] = (u.m[mac] ?? 0) + minutes
  const qs = s.rules.filter((r) => r.enabled && r.type === "quota" && r.target && r.minutes)
  if (qs.length) {
    const [meta, devices] = await Promise.all([loadMeta(), loadDevices()])
    for (const r of qs) {
      if (!(r.days?.length ? r.days : ALL).includes(dow) || u.hit[r.id]) continue
      const macs = macsOf(r.target!, meta)
      const used = macs.reduce((a, m) => Math.max(a, u.m[m] ?? 0), 0)
      if (used >= r.minutes!) {
        u.hit[r.id] = true
        const label = labelOf(r.target!, s, devices, meta)
        logs.push(
          await exec({ kind: "block", target: r.target!, label, until: nextMidnightVN(now), reason: `hết ${r.minutes}′ hôm nay` }, "Giới hạn giờ"),
        )
      }
    }
  }
  if (online.size === 0 && u.date === date && !qs.length) return
  await setJSON("usage", u)
}

// Mỗi 5 phút: lịch đến hạn (bù tối đa 10′), mở chặn hết hạn, đếm giờ online, làm mới dữ liệu nền
export async function tick(now = Date.now()) {
  const s = await loadState()
  const minute = Math.floor(now / 60000) * 60000
  if (s.lastTick && s.lastTick >= minute) return { ran: 0 }
  const start = s.lastTick ? Math.max(s.lastTick + 60000, minute - 10 * 60000) : minute
  const actions: Action[] = []
  for (let m = start; m <= minute; m += 60000) actions.push(...dueAt(s.rules, m))

  const logs: LogItem[] = []
  for (const a of actions) logs.push(await exec(a, "Hẹn giờ"))
  try {
    logs.push(...(await tickFamily(start, minute, now)))
  } catch (e: any) {
    console.error("family", e.message)
  }

  for (const x of s.temps.filter((t) => t.until <= now)) {
    const i = x.key.indexOf(":")
    const target = { kind: x.key.slice(0, i), id: x.key.slice(i + 1) } as Target
    const r = await exec({ kind: "unblock", target, label: x.label }, "Hết giờ chặn")
    if (r.ok || Math.floor((now - x.until) / 60000) % 10 === 0) logs.push(r)
  }

  const hasQuota = s.rules.some((r) => r.enabled && r.type === "quota")
  const hasActiveSchedules = s.rules.some((r) => r.enabled) || s.temps.length > 0
  const gap = s.lastSnap ? now - s.lastSnap : Infinity
  let nextLastSnap: number | undefined
  if (gap >= (hasQuota ? 290_000 : 590_000)) {
    try {
      const snap = await buildSnapshot()
      nextLastSnap = snap.at
      const online = new Set<string>()
      for (const r of snap.routers) for (const c of r.clients) online.add(c.mac)
      const mins = Math.min(10, Math.max(1, Math.round((gap === Infinity ? 60000 : gap) / 60000)))
      await quotas(s, online, mins, now, logs)
    } catch (e: any) {
      console.error("snapshot", e.message)
    }
  } else {
    try {
      await ensureOui()
    } catch (e: any) {
      console.error("oui", e.message)
    }
  }

  // Chỉ ghi KV "state" một lần nếu có lịch đang bật hoặc vừa cập nhật snapshot (tránh đốt quota KV free)
  if (hasActiveSchedules || nextLastSnap !== undefined) {
    try {
      await mutate((x) => {
        x.lastTick = minute
        if (nextLastSnap !== undefined) x.lastSnap = nextLastSnap
      })
    } catch (e: any) {
      if (!isKvLimit(e)) throw e
      console.warn("KV 429 skipped for state tick")
    }
  }
  for (const l of logs.filter((x) => !x.ok))
    await raise(`fail-${hashText(l.text)}`, "Lệnh tự động bị lỗi", `${l.by}: ${l.text}\nHệ thống đã tự thử lại nhưng router vẫn lỗi hoặc không áp dụng lệnh.`, 3 * 3600e3).catch(() => {})
  await addLog(logs)
  return { ran: logs.length }
}
