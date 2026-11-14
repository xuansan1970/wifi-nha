// "Mạng gia đình": 1 công tắc bật/tắt mọi WiFi dùng chung (trừ WiFi IoT/ẩn và WiFi riêng của Xuân San),
// lịch tắt/mở theo giờ + ngày trong tuần, và "cho dùng thêm" tạm 30′/1h/2h rồi tự quay về đúng chế độ.
import * as R from "./ruijie.mts"
import { getSnapshot, patchSnapshot } from "./snapshot.mts"
import { isParentHiddenSsid, LogItem, vn } from "./state.mts"
import { getJSON, setJSON } from "./store.mts"

export type NetRule = { id: string; name: string; days: number[]; offAt: string; onAt: string; enabled: boolean }
export type Grant = { until: number; minutes: number; by: string; prev: boolean }
export type Family = {
  on: boolean // trạng thái mong muốn hiện tại
  set: { gid: number; ssidIds: number[] }[] // các WiFi đã tắt lần gần nhất — bật lại đúng những cái này
  grant?: Grant | null
  rules: NetRule[]
  changedAt?: number
  changedBy?: string
}

const KEY = "family"
export const loadFamily = async (): Promise<Family> => {
  const f: any = await getJSON(KEY, {})
  return { on: f.on ?? true, set: f.set ?? [], grant: f.grant ?? null, rules: f.rules ?? [], changedAt: f.changedAt, changedBy: f.changedBy }
}
const saveFamily = (f: Family) => setJSON(KEY, f)

const ALL = [0, 1, 2, 3, 4, 5, 6]
const prevDay = (d: number) => (d + 6) % 7
const HM = /^([01]\d|2[0-3]):[0-5]\d$/

export function cleanRule(b: any): NetRule {
  const offAt = String(b.offAt || ""), onAt = String(b.onAt || "")
  if (!HM.test(offAt) || !HM.test(onAt)) throw new Error("Giờ không hợp lệ")
  if (offAt === onAt) throw new Error("Giờ tắt và giờ mở phải khác nhau")
  const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6))] as number[]
  if (!days.length) throw new Error("Chọn ít nhất 1 ngày")
  return {
    id: String(b.id || "").slice(0, 40) || Math.random().toString(36).slice(2, 10),
    name: String(b.name || "").trim().slice(0, 40) || "Giờ nghỉ",
    days: days.sort(),
    offAt,
    onAt,
    enabled: b.enabled !== false,
  }
}

// Phút `ms` có nằm trong khung "tắt mạng" của lịch nào không (khung qua đêm tính theo ngày bắt đầu)
export function inOffWindow(rules: NetRule[], ms: number): NetRule | null {
  const { hm, dow } = vn(ms)
  for (const r of rules) {
    if (!r.enabled) continue
    const d = r.days?.length ? r.days : ALL
    if (r.offAt < r.onAt) {
      if (d.includes(dow) && hm >= r.offAt && hm < r.onAt) return r
    } else if ((d.includes(dow) && hm >= r.offAt) || (d.includes(prevDay(dow)) && hm < r.onAt)) return r
  }
  return null
}

// Lần đổi trạng thái kế tiếp theo lịch (để hiện "Tự tắt lúc 22:00")
export function nextChange(rules: NetRule[], now = Date.now()) {
  const start = Math.ceil(now / 60000) * 60000
  const cur = !inOffWindow(rules, now)
  for (let m = start; m < start + 8 * 86400_000; m += 60000) {
    const on = !inOffWindow(rules, m)
    if (on !== cur) return { at: m, on }
  }
  return null
}

async function familySsids() {
  const snap = await getSnapshot(5 * 60_000)
  return snap.routers.map((r: any) => ({ gid: r.gid, ssids: r.ssids.filter((x: any) => !isParentHiddenSsid(x)) }))
}

// Áp dụng bật/tắt thật lên router
async function apply(f: Family, on: boolean) {
  const fam = await familySsids()
  let targets: { gid: number; ssidIds: number[] }[]
  if (!on) {
    targets = fam.map((r) => ({ gid: r.gid, ssidIds: r.ssids.filter((x: any) => x.enable).map((x: any) => x.id) })).filter((t) => t.ssidIds.length)
    if (targets.length) f.set = targets // nhớ đúng các WiFi đang bật để mở lại sau
  } else {
    // chỉ bật lại các WiFi do hệ thống tắt; nếu chưa có thì bật mọi WiFi gia đình
    const allowed = new Map(fam.map((r) => [r.gid, new Set(r.ssids.map((x: any) => x.id))]))
    targets = (f.set.length ? f.set : fam.map((r) => ({ gid: r.gid, ssidIds: r.ssids.map((x: any) => x.id) })))
      .map((t) => ({ gid: t.gid, ssidIds: t.ssidIds.filter((id: number) => allowed.get(t.gid)?.has(id)) }))
      .filter((t) => t.ssidIds.length)
  }
  const res = await Promise.allSettled(targets.map((t) => R.setSsids(t.gid, t.ssidIds, on)))
  const failed = res.filter((r) => r.status === "rejected").length
  await patchSnapshot((sn) => {
    for (const t of targets)
      if (res[targets.indexOf(t)].status === "fulfilled")
        for (const r of sn.routers) if (r.gid === t.gid) for (const x of r.ssids) if (t.ssidIds.includes(x.id)) x.enable = on
  })
  if (failed && failed === targets.length) throw new Error("router không nhận lệnh, thử lại sau")
  f.on = on
  return { n: targets.reduce((a, t) => a + t.ssidIds.length, 0), failed }
}

const hhmm = (ms: number) => vn(ms).hm

// Bật/tắt bằng tay — huỷ "cho dùng thêm" đang chạy
export async function setNet(on: boolean, by: string): Promise<LogItem> {
  const t = Date.now()
  const f = await loadFamily()
  try {
    const r = await apply(f, on)
    f.grant = null
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${on ? "Bật" : "Tắt"} mạng gia đình (${r.n} WiFi)${r.failed ? ` · ${r.failed} router lỗi` : ""}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi ${on ? "bật" : "tắt"} mạng gia đình: ${e.message}` }
  }
}

// Cho dùng thêm tạm thời: bật mạng ngay, hết giờ quay về chế độ (lịch hoặc trạng thái trước đó)
export async function grant(minutes: number, by: string): Promise<LogItem> {
  const t = Date.now()
  const f = await loadFamily()
  try {
    const prev = f.grant ? f.grant.prev : f.on
    if (!f.on) await apply(f, true)
    f.grant = { until: t + minutes * 60000, minutes, by, prev }
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `Cho dùng mạng thêm ${minutes >= 60 ? minutes / 60 + " tiếng" : minutes + " phút"} (đến ${hhmm(f.grant.until)})` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi cho dùng thêm: ${e.message}` }
  }
}

// Trạng thái đúng theo chế độ lúc `ms` (khi không có "cho dùng thêm")
const modeAt = (f: Family, ms: number, fallback: boolean) => (inOffWindow(f.rules, ms) ? false : fallback)

export async function endGrant(by: string, reason: string): Promise<LogItem | null> {
  const t = Date.now()
  const f = await loadFamily()
  if (!f.grant) return null
  const want = modeAt(f, t, f.grant.prev)
  try {
    if (want !== f.on) await apply(f, want)
    f.grant = null
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${reason} · mạng gia đình ${want ? "vẫn bật" : "đã tắt"} theo chế độ` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi kết thúc giờ dùng thêm: ${e.message}` }
  }
}

export async function saveRules(fn: (rules: NetRule[]) => NetRule[]) {
  const f = await loadFamily()
  f.rules = fn(f.rules)
  await saveFamily(f)
  return f.rules
}

// Gọi mỗi phút: chạy lịch (bỏ qua khi đang "cho dùng thêm"), hết giờ dùng thêm thì về chế độ
export async function tickFamily(from: number, to: number, now: number): Promise<LogItem[]> {
  const logs: LogItem[] = []
  let f = await loadFamily()
  if (f.grant && f.grant.until <= now) {
    const l = await endGrant("Hết giờ dùng thêm", "Hết giờ dùng thêm")
    if (l) logs.push(l)
    f = await loadFamily()
    if (f.grant) return logs // lỗi → thử lại phút sau
  }
  if (f.grant) return logs
  for (let m = from; m <= to; m += 60000) {
    const { hm, dow } = vn(m)
    for (const r of f.rules) {
      if (!r.enabled) continue
      const d = r.days?.length ? r.days : ALL
      const off = r.offAt === hm && d.includes(dow)
      const on = r.onAt === hm && d.includes(r.onAt <= r.offAt ? prevDay(dow) : dow)
      if (!off && !on) continue
      const want = !off
      if (want === f.on) continue
      const l = await setNet(want, `Lịch “${r.name}”`)
      logs.push({ ...l, role: "system" })
      f = await loadFamily()
    }
  }
  return logs
}

export async function familyView(now = Date.now()) {
  const f = await loadFamily()
  return {
    on: f.on,
    grant: f.grant && f.grant.until > now ? f.grant : null,
    rules: f.rules,
    next: f.grant ? null : nextChange(f.rules, now),
    changedAt: f.changedAt ?? null,
    changedBy: f.changedBy ?? null,
  }
}
