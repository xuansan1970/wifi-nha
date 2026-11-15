// "Mạng gia đình": điều khiển mọi WiFi dùng chung (trừ WiFi IoT/ẩn và WiFi riêng của Xuân San).
// 3 kịch bản: "on" mở hết · "off" tắt hết · "ghost" giả lỗi (tắt + ẩn tên WiFi).
// Có lịch hằng tuần, hẹn giờ một lần, và "cho dùng thêm" 30′/1h/2h rồi tự về đúng chế độ.
import * as R from "./ruijie.mts"
import { getSnapshot, patchSnapshot } from "./snapshot.mts"
import { isPrivateSsid, LogItem, vn } from "./state.mts"
import { getJSON, setJSON } from "./store.mts"

export type Scene = "on" | "off" | "ghost"
export const SCENES: Scene[] = ["on", "off", "ghost"]
export const SCENE_VI: Record<Scene, string> = { on: "Mở toàn bộ mạng", off: "Tắt toàn bộ mạng", ghost: "Giả lỗi mạng (tắt + ẩn tên WiFi)" }

export type NetRule = { id: string; name: string; days: number[]; offAt: string; onAt: string; enabled: boolean; mode: "off" | "ghost" }
export type Grant = { until: number; minutes: number; by: string; prev: Scene }
export type Timer = { id: string; at: number; scene: Scene; by: string }
type Ref = { gid: number; ssidIds: number[] }
export type Family = {
  on: boolean // trạng thái mong muốn gần nhất (dự phòng khi chưa có dữ liệu router)
  ghost: Ref[] // các WiFi gia đình đang bị ẩn do "giả lỗi" — phải hiện lại khi mở mạng
  grant?: Grant | null
  rules: NetRule[]
  timers: Timer[]
  changedAt?: number
  changedBy?: string
}

const KEY = "family"
const asScene = (v: any, fb: Scene): Scene => (v === true ? "on" : v === false ? "off" : SCENES.includes(v) ? v : fb)
export const loadFamily = async (): Promise<Family> => {
  const f: any = await getJSON(KEY, {})
  return {
    on: f.on ?? true,
    ghost: f.ghost ?? [],
    grant: f.grant ? { ...f.grant, prev: asScene(f.grant.prev, "on") } : null,
    rules: (f.rules ?? []).map((r: any) => ({ ...r, mode: r.mode === "ghost" ? "ghost" : "off" })),
    timers: f.timers ?? [],
    changedAt: f.changedAt,
    changedBy: f.changedBy,
  }
}
const saveFamily = (f: Family) => setJSON(KEY, f)

// ---- WiFi nào thuộc "gia đình" ----
const gk = (gid: number, id: number) => `${gid}:${id}`
export const ghostSet = (f: Pick<Family, "ghost">) => new Set(f.ghost.flatMap((t) => t.ssidIds.map((id) => gk(t.gid, id))))
// WiFi gia đình = không phải WiFi riêng của Xuân San, không phải IoT (tên có "iot"), không ẩn — trừ khi chính app ẩn nó lúc giả lỗi
export function isFamilySsid(gid: number, s: { id: number; name?: string; hidden?: boolean }, ghost: Set<string>) {
  if (isPrivateSsid(s) || /iot/i.test(s.name || "")) return false
  return !s.hidden || ghost.has(gk(gid, s.id))
}

// Trạng thái thật trên router (để nút bấm luôn khớp thực tế, kể cả khi bật/tắt lẻ từng WiFi)
export function liveOf(snap: any, f: Family) {
  const g = ghostSet(f)
  let on = 0, total = 0
  for (const r of snap?.routers ?? []) for (const s of r.ssids ?? []) if (isFamilySsid(r.gid, s, g)) { total++; if (s.enable) on++ }
  return { on, total }
}
export function sceneOf(f: Family, live: { on: number; total: number }): Scene {
  const on = live.total ? live.on > 0 : f.on
  return on ? "on" : f.ghost.length ? "ghost" : "off"
}

// ---- Lịch hằng tuần ----
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
    mode: b.mode === "ghost" ? "ghost" : "off",
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

// ---- Áp dụng lên router ----
const byGid = (refs: Ref[]) => {
  const m = new Map<number, number[]>()
  for (const t of refs) m.set(t.gid, [...(m.get(t.gid) ?? []), ...t.ssidIds])
  return [...m].map(([gid, ssidIds]) => ({ gid, ssidIds: [...new Set(ssidIds)] })).filter((t) => t.ssidIds.length)
}

// Ẩn/hiện tên WiFi: tuần tự trong cùng router (tránh ghi đè cấu hình), song song giữa các router
async function setHidden(refs: Ref[], hidden: boolean) {
  const ok: Ref[] = []
  let failed = 0
  await Promise.all(
    byGid(refs).map(async (t) => {
      const done: number[] = []
      for (const id of t.ssidIds)
        try {
          await R.updateSsid(t.gid, id, { hidden })
          done.push(id)
        } catch {
          failed++
        }
      if (done.length) ok.push({ gid: t.gid, ssidIds: done })
    }),
  )
  return { ok, failed }
}

async function apply(f: Family, scene: Scene) {
  const snap = await getSnapshot(5 * 60_000)
  const g = ghostSet(f)
  const fam: Ref[] = snap.routers
    .map((r: any) => ({ gid: r.gid, ssidIds: r.ssids.filter((x: any) => isFamilySsid(r.gid, x, g)).map((x: any) => x.id) }))
    .filter((t: Ref) => t.ssidIds.length)
  if (!fam.length) throw new Error("không thấy WiFi gia đình nào trên router")
  const enable = scene === "on"
  let failed = 0
  let unhidden: Ref[] = []
  let hiddenNow: Ref[] = []

  // Mở mạng: hiện lại tên WiFi đã ẩn trước, rồi mới bật phát
  if (enable && f.ghost.length) {
    const r = await setHidden(f.ghost, false)
    unhidden = r.ok
    failed += r.failed
  }
  const res = await Promise.allSettled(fam.map((t) => R.setSsids(t.gid, t.ssidIds, enable)))
  const okRefs = fam.filter((_, i) => res[i].status === "fulfilled")
  failed += res.length - okRefs.length
  if (!okRefs.length) throw new Error("router không nhận lệnh, thử lại sau")
  // Tắt thường (không giả lỗi): tắt phát xong thì hiện lại tên WiFi đã ẩn
  if (scene === "off" && f.ghost.length) {
    const r = await setHidden(f.ghost, false)
    unhidden = r.ok
    failed += r.failed
  }
  // Giả lỗi: đã tắt phát thì ẩn luôn tên WiFi (những WiFi chưa ẩn)
  if (scene === "ghost") {
    const toHide = okRefs.map((t) => ({ gid: t.gid, ssidIds: t.ssidIds.filter((id) => !g.has(gk(t.gid, id))) }))
    const r = await setHidden(toHide, true)
    hiddenNow = r.ok
    failed += r.failed
  }

  const un = ghostSet({ ghost: unhidden })
  f.ghost = byGid([...f.ghost.map((t) => ({ gid: t.gid, ssidIds: t.ssidIds.filter((id) => !un.has(gk(t.gid, id))) })), ...hiddenNow])
  f.on = enable
  const hid = ghostSet({ ghost: hiddenNow })
  await patchSnapshot((sn) => {
    for (const t of okRefs)
      for (const r of sn.routers)
        if (r.gid === t.gid)
          for (const x of r.ssids) {
            if (t.ssidIds.includes(x.id)) x.enable = enable
            if (un.has(gk(r.gid, x.id))) x.hidden = false
            if (hid.has(gk(r.gid, x.id))) x.hidden = true
          }
  })
  return { n: okRefs.reduce((a, t) => a + t.ssidIds.length, 0), failed }
}

const hhmm = (ms: number) => vn(ms).hm
const minsVi = (m: number) => (m >= 60 ? `${+(m / 60).toFixed(1)} tiếng` : `${m} phút`)

// Chuyển sang 1 kịch bản (bấm tay, hẹn giờ, lịch) — huỷ "cho dùng thêm" đang chạy
export async function setScene(scene: Scene, by: string): Promise<LogItem> {
  const t = Date.now()
  const f = await loadFamily()
  try {
    const r = await apply(f, scene)
    f.grant = null
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${SCENE_VI[scene]} (${r.n} WiFi)${r.failed ? ` · ${r.failed} thao tác lỗi` : ""}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi ${SCENE_VI[scene].toLowerCase()}: ${e.message}` }
  }
}
export const setNet = (on: boolean, by: string) => setScene(on ? "on" : "off", by)

async function currentScene(f: Family) {
  return sceneOf(f, liveOf(await getSnapshot(10 * 60_000).catch(() => null), f))
}

// Cho dùng thêm tạm thời: mở mạng ngay, hết giờ quay về chế độ (lịch hoặc trạng thái trước đó)
export async function grant(minutes: number, by: string): Promise<LogItem> {
  const t = Date.now()
  const f = await loadFamily()
  try {
    const cur = await currentScene(f)
    const prev = f.grant ? f.grant.prev : cur
    if (cur !== "on") await apply(f, "on")
    f.grant = { until: t + minutes * 60000, minutes, by, prev }
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `Cho dùng mạng thêm ${minsVi(minutes)} (đến ${hhmm(f.grant.until)})` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi cho dùng thêm: ${e.message}` }
  }
}

// Kịch bản đúng theo chế độ lúc `ms` (khi không có "cho dùng thêm")
const modeAt = (f: Family, ms: number, fallback: Scene): Scene => {
  const r = inOffWindow(f.rules, ms)
  return r ? r.mode : fallback
}

export async function endGrant(by: string, reason: string): Promise<LogItem | null> {
  const t = Date.now()
  const f = await loadFamily()
  if (!f.grant) return null
  const want = modeAt(f, t, f.grant.prev)
  try {
    if (want !== (await currentScene(f))) await apply(f, want)
    f.grant = null
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${reason} · về chế độ: ${SCENE_VI[want].toLowerCase()}` }
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

// ---- Hẹn giờ một lần ("tắt sau 1 tiếng", "mở lúc 17:00") ----
export function cleanTimer(b: any, by: string, now = Date.now()): Timer {
  if (!SCENES.includes(b.scene)) throw new Error("Chọn việc cần làm")
  let at: number
  if (b.minutes !== undefined && b.minutes !== null && b.minutes !== "") {
    const m = Math.round(Number(b.minutes))
    if (!(m >= 1 && m <= 24 * 60)) throw new Error("Hẹn từ 1 phút đến 24 tiếng")
    at = now + m * 60000
  } else {
    const hm = String(b.at || "")
    if (!HM.test(hm)) throw new Error("Giờ không hợp lệ")
    // Giờ VN hôm nay; đã qua thì là ngày mai
    const d = new Date(now + 7 * 3600_000)
    const [h, mi] = hm.split(":").map(Number)
    d.setUTCHours(h, mi, 0, 0)
    at = d.getTime() - 7 * 3600_000
    if (at <= now) at += 86400_000
  }
  return { id: Math.random().toString(36).slice(2, 10), at, scene: b.scene, by }
}
export async function saveTimers(fn: (t: Timer[]) => Timer[]) {
  const f = await loadFamily()
  f.timers = fn(f.timers).sort((a, b) => a.at - b.at).slice(0, 10)
  await saveFamily(f)
  return f.timers
}

// Gọi mỗi lần cron: hẹn giờ một lần → hết giờ dùng thêm → lịch hằng tuần
export async function tickFamily(from: number, to: number, now: number): Promise<LogItem[]> {
  const logs: LogItem[] = []
  let f = await loadFamily()
  const due = f.timers.filter((t) => t.at <= now)
  if (due.length) {
    const last = due[due.length - 1] // nhiều hẹn giờ cùng đến hạn: lấy cái muộn nhất
    const l = await setScene(last.scene, `Hẹn giờ của ${last.by}`)
    logs.push({ ...l, role: "system" })
    if (l.ok) await saveTimers((ts) => ts.filter((t) => t.at > now))
    f = await loadFamily()
  }
  if (f.grant && f.grant.until <= now) {
    const l = await endGrant("Hết giờ dùng thêm", "Hết giờ dùng thêm")
    if (l) logs.push(l)
    f = await loadFamily()
    if (f.grant) return logs // lỗi → thử lại lần sau
  }
  if (f.grant) return logs
  const rules = f.rules.filter((r) => r.enabled)
  if (!rules.length) return logs
  let cur = await currentScene(f)
  for (let m = from; m <= to; m += 60000) {
    const { hm, dow } = vn(m)
    for (const r of rules) {
      const d = r.days?.length ? r.days : ALL
      const off = r.offAt === hm && d.includes(dow)
      const on = r.onAt === hm && d.includes(r.onAt <= r.offAt ? prevDay(dow) : dow)
      if (!off && !on) continue
      const want: Scene = off ? r.mode : "on"
      if (want === cur) continue
      const l = await setScene(want, `Lịch “${r.name}”`)
      logs.push({ ...l, role: "system" })
      if (l.ok) cur = want
    }
  }
  return logs
}

export async function familyView(snap?: any, now = Date.now()) {
  const f = await loadFamily()
  const live = liveOf(snap ?? (await getSnapshot(10 * 60_000).catch(() => null)), f)
  const scene = sceneOf(f, live)
  return {
    on: scene === "on",
    scene,
    live,
    grant: f.grant && f.grant.until > now ? f.grant : null,
    rules: f.rules,
    timers: f.timers.filter((t) => t.at > now - 10 * 60_000),
    next: f.grant ? null : nextChange(f.rules, now),
    changedAt: f.changedAt ?? null,
    changedBy: f.changedBy ?? null,
  }
}
