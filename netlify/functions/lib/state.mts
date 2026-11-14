import { getJSON, setJSON } from "./store.mts"
import * as R from "./ruijie.mts"

export type Target = { kind: "device" | "person"; id: string }
export type Rule = {
  id: string
  type: "reboot" | "wifi" | "block" | "quota"
  name: string
  enabled: boolean
  days: number[] // 0=CN..6=T7, giờ VN
  at?: string
  gids?: number[]
  offAt?: string
  onAt?: string
  targets?: { gid: number; ssidIds: number[] }[]
  from?: string
  to?: string
  target?: Target
  minutes?: number // quota: số phút online/ngày
}
export type Temp = { key: string; label: string; macs: string[]; until: number; reason: string }
export type Person = { id: string; name: string; color: number }
export type State = { rules: Rule[]; temps: Temp[]; people: Person[]; lastTick?: number; lastSnap?: number }
export type Dev = {
  mac: string
  custom?: string
  owner?: string
  firstSeen: number
  lastSeen: number
  gid?: number
  floor?: string
  ssid?: string
  band?: string
  ip?: string
  alias?: string
  rawName?: string
  label?: string
  os?: string
  name?: string
  kind?: string
  vendor?: string
}
export type LogItem = { t: number; text: string; ok: boolean; by: string }

export const loadState = async (): Promise<State> => {
  const s: any = await getJSON("state", {})
  return { rules: s.rules ?? [], temps: s.temps ?? [], people: s.people ?? [], lastTick: s.lastTick, lastSnap: s.lastSnap }
}
export const saveState = (s: State) => setJSON("state", s)

// Sửa state an toàn: luôn đọc bản mới nhất ngay trước khi ghi
export async function mutate<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const s = await loadState()
  const r = await fn(s)
  await saveState(s)
  return r
}

export const loadDevices = () => getJSON<Record<string, Dev>>("devices", {})
// Tên tự đặt + chủ sở hữu: lưu riêng để không bị ghi đè bởi lần quét nền
export type Meta = Record<string, { custom?: string; owner?: string }>
export const loadMeta = () => getJSON<Meta>("meta", {})
export const saveMeta = (m: Meta) => setJSON("meta", m)
export const saveDevices = (d: Record<string, Dev>) => setJSON("devices", d)

export async function addLog(items: LogItem[]) {
  if (!items.length) return
  const cur = await getJSON<LogItem[]>("log", [])
  await setJSON("log", [...items, ...cur].slice(0, 300))
}
export const getLog = () => getJSON<LogItem[]>("log", [])

// ---- Giờ Việt Nam (UTC+7, không DST) ----
export function vn(ms: number) {
  const d = new Date(ms + 7 * 3600_000)
  return {
    hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    dow: d.getUTCDay(),
    date: d.toISOString().slice(0, 10),
  }
}
// 00:00 ngày mai giờ VN, dạng epoch ms
export function nextMidnightVN(ms = Date.now()) {
  const d = new Date(ms + 7 * 3600_000)
  d.setUTCHours(24, 0, 0, 0)
  return d.getTime() - 7 * 3600_000
}

export function floorOf(name: string) {
  const n = name.toLowerCase()
  if (/tret|trệt|gf|ground/.test(n)) return { floor: "Tầng trệt", order: 0 }
  const m = n.match(/t(?:ầng|ang)?\s*(\d)/)
  if (m) return { floor: `Tầng ${m[1]}`, order: Number(m[1]) }
  return { floor: name, order: 9 }
}

// Danh sách MAC của 1 mục tiêu (thiết bị hoặc 1 người)
export function macsOf(t: Target, meta: Meta) {
  if (t.kind === "device") return [R.macKey(t.id)]
  return Object.entries(meta)
    .filter(([, m]) => m.owner === t.id)
    .map(([mac]) => mac)
}
export function labelOf(t: Target, s: State, devices: Record<string, Dev>, meta: Meta) {
  if (t.kind === "person") return s.people.find((p) => p.id === t.id)?.name ?? "Người dùng"
  const k = R.macKey(t.id)
  return meta[k]?.custom || devices[k]?.name || t.id
}

export async function blockMacs(macs: string[], gids: number[]) {
  const errs: string[] = []
  await Promise.all(
    gids.map(async (gid) => {
      for (const mac of macs)
        try {
          await R.blockMac(gid, mac)
        } catch (e: any) {
          errs.push(e.message)
        }
    }),
  )
  if (macs.length && errs.length === macs.length * gids.length) throw new Error(errs[0])
  return errs
}
export async function unblockMacs(macs: string[], gids: number[]) {
  const errs: string[] = []
  await Promise.all(
    gids.map(async (gid) => {
      let blocked: string[] = []
      try {
        blocked = await R.listBlocked(gid)
      } catch (e: any) {
        errs.push(e.message)
        return
      }
      for (const mac of macs)
        if (blocked.includes(R.macKey(mac)))
          try {
            await R.call(`/enet/conf/group/${gid}/mac_filter`, "DELETE", {
              querys: { group_id: gid, mac: R.macDot(mac), type: "global" },
            })
          } catch (e: any) {
            errs.push(e.message)
          }
    }),
  )
  if (errs.length && errs.length >= gids.length) throw new Error(errs[0])
  return errs
}

export async function rebootGroups(gids: number[]) {
  const lists = await Promise.all(gids.map((g) => R.listDevices(g)))
  const sns = lists.flat().map((d: any) => d.sn)
  if (sns.length) await R.reboot(sns)
  return sns
}
