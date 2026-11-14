import { getStore } from "@netlify/blobs"
import * as R from "./ruijie.mts"

export const store = () => getStore({ name: "wifi-admin", consistency: "strong" })

export type Rule = {
  id: string
  type: "reboot" | "wifi" | "block"
  name: string
  enabled: boolean
  days: number[] // 0=CN .. 6=T7 (giờ VN)
  // reboot
  at?: string // "HH:MM"
  gids?: number[]
  // wifi: tắt lúc offAt, bật lại lúc onAt
  offAt?: string
  onAt?: string
  targets?: { gid: number; ssidIds: number[] }[]
  // block: chặn lúc from, mở lúc to
  from?: string
  to?: string
  mac?: string
  macName?: string
}
export type TempBlock = { mac: string; name: string; gids: number[]; until: number }
export type LogItem = { t: number; text: string; ok: boolean; by: string }
export type State = { rules: Rule[]; temps: TempBlock[]; names: Record<string, string>; lastTick?: number }

export async function loadState(): Promise<State> {
  const s: any = (await store().get("state", { type: "json" })) ?? {}
  return { rules: s.rules ?? [], temps: s.temps ?? [], names: s.names ?? {}, lastTick: s.lastTick }
}
export async function saveState(s: State) {
  await store().setJSON("state", s)
}

export async function addLog(items: LogItem[]) {
  if (!items.length) return
  const cur: LogItem[] = ((await store().get("log", { type: "json" })) as any) ?? []
  await store().setJSON("log", [...items, ...cur].slice(0, 150))
}
export async function getLog(): Promise<LogItem[]> {
  return ((await store().get("log", { type: "json" })) as any) ?? []
}

// Cache danh sách router để thao tác nhanh
export async function projects() {
  return R.listProjects()
}

export async function rebootGroups(gids: number[]) {
  const done: string[] = []
  for (const gid of gids) {
    const devs = await R.listDevices(gid)
    const sns = devs.map((d: any) => d.sn)
    if (sns.length) {
      await R.reboot(sns)
      done.push(...sns)
    }
  }
  return done
}

export async function blockEverywhere(mac: string, gids: number[]) {
  const errs: string[] = []
  for (const gid of gids) {
    try {
      await R.blockMac(gid, mac)
    } catch (e: any) {
      errs.push(`${gid}: ${e.message}`)
    }
  }
  if (errs.length === gids.length) throw new Error(errs.join("; "))
  return errs
}
export async function unblockEverywhere(mac: string, gids: number[]) {
  const errs: string[] = []
  for (const gid of gids) {
    try {
      await R.unblockMac(gid, mac)
    } catch (e: any) {
      errs.push(`${gid}: ${e.message}`)
    }
  }
  if (errs.length === gids.length && gids.length) throw new Error(errs.join("; "))
  return errs
}

// ---- Giờ Việt Nam (UTC+7, không DST) ----
export function vn(ms: number) {
  const d = new Date(ms + 7 * 3600_000)
  return {
    hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    dow: d.getUTCDay(),
    date: d.toISOString().slice(0, 10),
  }
}
