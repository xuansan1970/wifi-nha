import { raise } from "./notify.mts"
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
// Giờ dùng WiFi (thay "time limit" của eWeb): WiFi chỉ phát trong các khung giờ, các ngày đã chọn; ngày khác dùng tự do
export type Limit = { id: string; ssid: string; enabled: boolean; days: number[]; wins: [string, string][] }
type Ref = { gid: number; ssidIds: number[] }
export type Family = {
  on: boolean // trạng thái mong muốn gần nhất (dự phòng khi chưa có dữ liệu router)
  ghost: Ref[] // các WiFi gia đình đang bị ẩn do "giả lỗi" — phải hiện lại khi mở mạng
  grant?: Grant | null
  rules: NetRule[]
  timers: Timer[]
  limits: Limit[]
  lim?: string[] // WiFi do "Giờ dùng WiFi" tắt (gid:ssidId) — tới giờ dùng phải tự bật lại dù trễ cron hay lỗi mạng
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
    limits: f.limits ?? [],
    lim: f.lim ?? [],
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
  let on = 0, total = 0, rest = 0 // rest: WiFi tắt vì đang ngoài "giờ dùng" (hoặc do giờ dùng tắt, chờ tự bật lại)
  const now = Date.now()
  const lim = new Set(f.lim ?? [])
  for (const r of snap?.routers ?? [])
    for (const s of r.ssids ?? [])
      if (isFamilySsid(r.gid, s, g)) {
        total++
        if (s.enable) on++
        else if (!inLimit(f, s.name, now) || lim.has(gk(r.gid, s.id))) rest++
      }
  return { on, total, rest }
}
export function sceneOf(f: Family, live: { on: number; total: number; rest?: number }): Scene {
  // Mọi WiFi tắt đều do ngoài "giờ dùng" (không phải tắt tay) → vẫn tính là mở, tới giờ tự bật lại
  const on = live.total ? live.on > 0 || (f.on && !f.ghost.length && !!live.rest && live.rest === live.total) : f.on
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

// ======== BẢNG ƯU TIÊN (cao → thấp) — chỗ DUY NHẤT quyết định ai thắng khi các thứ chạm nhau ========
// 1. Bấm tay (Mở/Tắt/Giả lỗi): có hiệu lực ngay, huỷ "cho dùng thêm", và được GIỮ cho tới lần đổi kế tiếp theo lịch.
// 2. "Cho dùng thêm" (grant): mở mạng tới hết giờ; trong lúc này lịch và giờ dùng WiFi đứng yên. Hết giờ → về chế độ của lịch lúc đó.
// 3. Hẹn giờ một lần (timers): tới hạn thì áp dụng như bấm tay (nhiều cái cùng hạn: lấy cái muộn nhất).
// 4. Lịch hằng tuần (rules): mỗi lần đổi (vd 22:00 tắt, 06:30 mở) áp dụng như bấm tay. Nếu cron lỡ lần đổi, lần tick sau BÙ ngay
//    (trừ khi có người bấm tay SAU lần đổi đó) — xem lastFlip.
// 5. Giờ dùng WiFi (limits): chỉ chạy khi mạng đang "mở thường" (không giả lỗi, không dùng thêm); tự bật lại tới giờ dùng.
// Quy tắc chung: bấm tay sau lần đổi của lịch thì thắng; lịch lần đổi sau thì thắng lại.

// Trạng thái lịch yêu cầu lúc `now` và thời điểm bắt đầu (lần đổi gần nhất, tìm lùi tối đa 48h)
export function lastFlip(rules: NetRule[], now: number): { scene: Scene; since: number } | null {
  const active = rules.filter((r) => r.enabled)
  if (!active.length) return null
  const sceneAt = (ms: number): Scene => inOffWindow(active, ms)?.mode ?? "on"
  const minute = Math.floor(now / 60000) * 60000
  const scene = sceneAt(minute)
  const limit = minute - 48 * 3600_000
  let since = minute
  while (since > limit && sceneAt(since - 60000) === scene) since -= 60000
  return { scene, since }
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

// ---- Giờ dùng WiFi ----
const HM_END = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/
export function cleanLimit(b: any): Limit {
  const ssid = String(b.ssid || "").trim().slice(0, 40)
  if (!ssid) throw new Error("Chưa chọn WiFi")
  const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6))] as number[]
  if (!days.length) throw new Error("Chọn ít nhất 1 ngày")
  const wins = (Array.isArray(b.wins) ? b.wins : [])
    .map((w: any) => [String(w?.[0] || ""), String(w?.[1] || "")] as [string, string])
    .filter(([a, c]: [string, string]) => a || c)
  if (!wins.length) throw new Error("Thêm ít nhất 1 khung giờ được dùng")
  for (const [a, c] of wins) {
    if (!HM.test(a) || !HM_END.test(c)) throw new Error("Giờ không hợp lệ")
    if (a >= c) throw new Error(`Khung ${a}–${c}: giờ kết thúc phải sau giờ bắt đầu (trong cùng ngày)`)
  }
  wins.sort((x: [string, string], y: [string, string]) => (x[0] < y[0] ? -1 : 1))
  return { id: String(b.id || "").slice(0, 40) || Math.random().toString(36).slice(2, 10), ssid, enabled: b.enabled !== false, days: days.sort(), wins: wins.slice(0, 6) }
}
const limitOf = (f: Family, name: string) => f.limits.find((l) => l.enabled && l.ssid.toLowerCase() === String(name || "").trim().toLowerCase())
// WiFi `name` có đang trong giờ được dùng không (không đặt giờ / ngày không áp dụng = được dùng)
export function inLimit(f: Family, name: string, ms: number) {
  const l = limitOf(f, name)
  if (!l) return true
  const { hm, dow } = vn(ms)
  if (!l.days.includes(dow)) return true
  return l.wins.some(([a, c]) => hm >= a && hm < c)
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

async function apply(f: Family, scene: Scene, ignoreLimits = false) {
  const snap = await getSnapshot(5 * 60_000)
  const g = ghostSet(f)
  const enable = scene === "on"
  const now = Date.now()
  const pick = (want: boolean) => snap.routers
    .map((r: any) => ({ gid: r.gid, ssidIds: r.ssids.filter((x: any) => isFamilySsid(r.gid, x, g) && (!enable || ignoreLimits || inLimit(f, x.name, now) === want)).map((x: any) => x.id) }))
    .filter((t: Ref) => t.ssidIds.length)
  const fam: Ref[] = pick(true)
  // Mở mạng theo chế độ thường: WiFi đang ngoài "giờ dùng" thì giữ tắt
  const outRefs: Ref[] = enable && !ignoreLimits ? pick(false) : []
  if (!fam.length && !outRefs.length) throw new Error("không thấy WiFi gia đình nào trên router")
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
  const res2 = await Promise.allSettled(outRefs.map((t) => R.setSsids(t.gid, t.ssidIds, false)))
  const okOut = outRefs.filter((_, i) => res2[i].status === "fulfilled")
  failed += res2.length - okOut.length
  if (!okRefs.length && !okOut.length) throw new Error("router không nhận lệnh, thử lại sau")
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
            if (okOut.some((o) => o.gid === r.gid && o.ssidIds.includes(x.id))) x.enable = false
            if (un.has(gk(r.gid, x.id))) x.hidden = false
            if (hid.has(gk(r.gid, x.id))) x.hidden = true
          }
  })
  return { n: okRefs.reduce((a, t) => a + t.ssidIds.length, 0), out: okOut.reduce((a, t) => a + t.ssidIds.length, 0), failed }
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
    f.lim = []
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${SCENE_VI[scene]} (${r.n} WiFi${r.out ? `, ${r.out} WiFi ngoài giờ dùng giữ tắt` : ""})${r.failed ? ` · ${r.failed} thao tác lỗi` : ""}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi ${SCENE_VI[scene].toLowerCase()}: ${e.message}` }
  }
}
// Bật/tắt lẻ 1 WiFi bằng tay cũng là "bấm tay": lịch không được bù đè lên cho tới lần đổi kế tiếp
export async function markManual(by: string) {
  const f = await loadFamily()
  f.changedAt = Date.now()
  f.changedBy = by
  await saveFamily(f)
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
    const prev = f.grant ? f.grant.prev : await currentScene(f)
    await apply(f, "on", true) // cho dùng thêm: mở cả WiFi đang ngoài giờ dùng
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
    await apply(f, want) // về chế độ: kể cả tắt lại WiFi đang ngoài giờ dùng
    f.grant = null
    f.changedAt = t
    f.changedBy = by
    await saveFamily(f)
    return { t, ok: true, by, text: `${reason} · về chế độ: ${SCENE_VI[want].toLowerCase()}` }
  } catch (e: any) {
    return { t, ok: false, by, text: `Lỗi kết thúc giờ dùng thêm: ${e.message}` }
  }
}

// Bật lẻ 1 WiFi đang bị ẩn do "giả lỗi" → hiện tên lại và bỏ khỏi danh sách giả lỗi
export async function unghost(gid: number, ssidId: number) {
  const f = await loadFamily()
  if (!ghostSet(f).has(gk(gid, ssidId))) return
  await R.updateSsid(gid, ssidId, { hidden: false })
  f.ghost = byGid(f.ghost.map((t) => ({ gid: t.gid, ssidIds: t.ssidIds.filter((id) => !(t.gid === gid && id === ssidId)) })))
  await saveFamily(f)
  await patchSnapshot((sn) => { for (const r of sn.routers) if (r.gid === gid) for (const x of r.ssids) if (x.id === ssidId) x.hidden = false })
}

export async function saveLimits(fn: (l: Limit[]) => Limit[]) {
  const f = await loadFamily()
  f.limits = fn(f.limits).slice(0, 20)
  await saveFamily(f)
  return f.limits
}

// Mỗi lần cron: hết giờ dùng → tắt WiFi đó; tới giờ bắt đầu → bật lại (chỉ khi mạng đang mở thường, không giả lỗi / dùng thêm)
export async function tickLimits(f: Family, from: number, to: number, now: number): Promise<LogItem[]> {
  if (!f.limits.some((l) => l.enabled) || f.grant) return []
  const snap = await getSnapshot(5 * 60_000)
  if (sceneOf(f, liveOf(snap, f)) !== "on") return []
  const g = ghostSet(f)
  const starts = (name: string) => {
    const l = limitOf(f, name)
    if (!l) return false
    for (let m = from; m <= to; m += 60000) {
      const { hm, dow } = vn(m)
      if (l.days.includes(dow) && l.wins.some(([a]) => a === hm)) return true
    }
    return false
  }
  const offs = new Map<number, number[]>(), ons = new Map<number, number[]>(), names = { off: new Set<string>(), on: new Set<string>() }
  // lim: WiFi do chính "Giờ dùng" tắt → tới giờ dùng luôn tự bật lại (không phụ thuộc đúng phút bắt đầu, cron trễ hay lần trước lỗi)
  const lim = new Set(f.lim ?? [])
  let limChanged = false
  for (const r of snap.routers)
    for (const x of r.ssids) {
      if (!isFamilySsid(r.gid, x, g) || !limitOf(f, x.name)) continue
      const k = gk(r.gid, x.id)
      const ok = inLimit(f, x.name, now)
      if (x.enable && lim.delete(k)) limChanged = true // đã bật (tay hoặc đã mở) → bỏ theo dõi
      if (!ok && x.enable) (offs.set(r.gid, [...(offs.get(r.gid) ?? []), x.id]), names.off.add(x.name))
      else if (ok && !x.enable && (starts(x.name) || lim.has(k))) (ons.set(r.gid, [...(ons.get(r.gid) ?? []), x.id]), names.on.add(x.name))
    }
  const logs: LogItem[] = []
  for (const [want, map, ns] of [[false, offs, names.off], [true, ons, names.on]] as const) {
    if (!map.size) continue
    const res = await Promise.allSettled([...map].map(([gid, ids]) => R.setSsids(gid, ids, want)))
    ;[...map].forEach(([gid, ids], i) => {
      if (res[i].status !== "fulfilled") return
      for (const id of ids) {
        const k = gk(gid, id)
        if (want ? lim.delete(k) : !lim.has(k) && lim.add(k)) limChanged = true
      }
    })
    await patchSnapshot((sn) => {
      ;[...map].forEach(([gid, ids], i) => {
        if (res[i].status !== "fulfilled") return
        for (const r of sn.routers) if (r.gid === gid) for (const x of r.ssids) if (ids.includes(x.id)) x.enable = want
      })
    })
    const bad = res.filter((x) => x.status === "rejected").length
    logs.push({ t: now, ok: bad < res.length, by: "Giờ dùng WiFi", role: "system", text: `${want ? "Tới giờ dùng, bật" : "Hết giờ dùng, tắt"} ${[...ns].join(", ")}${bad ? ` · ${bad} router lỗi${want ? " (sẽ tự thử lại sau 5 phút)" : ""}` : ""}` })
  }
  if (limChanged) {
    const cur = await loadFamily()
    cur.lim = [...lim]
    await saveFamily(cur)
  }
  return logs
}

// Lịch MẶC ĐỊNH luôn tồn tại và luôn bật: bấm tay chỉ có tác dụng tạm tới lần đổi lịch kế tiếp, không bao giờ làm mất lịch tự động
export const DEFAULT_RULE_ID = "mac-dinh"
export const defaultRule = (): NetRule => ({ id: DEFAULT_RULE_ID, name: "Mặc định hằng ngày", days: [0, 1, 2, 3, 4, 5, 6], offAt: "22:00", onAt: "06:30", enabled: true, mode: "off" })
// Trả true nếu đã phải tạo/bật lại lịch mặc định (không có lịch nào đang bật)
export async function ensureDefaultRule(): Promise<boolean> {
  const f = await loadFamily()
  if (f.rules.some((r) => r.enabled)) return false
  const old = f.rules.find((r) => r.id === DEFAULT_RULE_ID)
  await saveRules((rs) => (old ? rs.map((r) => (r.id === DEFAULT_RULE_ID ? { ...r, enabled: true } : r)) : [...rs, defaultRule()].slice(-20)))
  return true
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
  if (await ensureDefaultRule().catch(() => false))
    logs.push({ t: now, ok: true, by: "Hệ thống", role: "system", text: "Không có lịch tự động nào đang bật → bật lại lịch mặc định (tắt 22:00, mở 06:30)" })
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
  if (!rules.length) return [...logs, ...(await tickLimits(f, from, to, now))]
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
  // Bù lần đổi bị lỡ (cron trễ >10′, router offline đúng giờ…): mạng đang khác lịch mà chưa ai bấm tay sau lần đổi gần nhất
  const f2 = await loadFamily()
  const want = f2.grant ? null : lastFlip(f2.rules, now)
  if (want && (f2.changedAt ?? 0) < want.since && cur !== want.scene) {
    const l = await setScene(want.scene, "Lịch (bù lần đổi bị lỡ)")
    logs.push({ ...l, role: "system" })
  }
  return [...logs, ...(await tickLimits(await loadFamily(), from, to, now))]
}

// Đối soát (chạy mỗi 5 phút): trạng thái thật có đúng lịch không, router có online không. Lệch quá 15 phút (đã được tự sửa ở tickFamily mà vẫn lệch) → báo email.
export async function driftCheck(now: number) {
  const f = await loadFamily()
  const snap = await getSnapshot(5 * 60_000)
  for (const r of snap.routers ?? [])
    if (r.device && !r.online) await raise(`router-off-${r.gid}`, `Router ${r.name} đang offline`, `Router "${r.name}" không phản hồi trên Ruijie cloud lúc ${vn(now).hm} (giờ VN). Lịch và lệnh cho router này sẽ không áp dụng được cho tới khi nó online lại. Kiểm tra nguồn điện và dây mạng.`, 6 * 3600e3)
  const want = f.grant ? null : lastFlip(f.rules, now)
  if (!want || (f.changedAt ?? 0) >= want.since || now - want.since < 15 * 60000) return
  const cur = await currentScene(f)
  if (cur !== want.scene)
    await raise("drift", "WiFi đang khác lịch", `Lịch yêu cầu WiFi "${want.scene === "on" ? "mở" : want.scene === "off" ? "tắt" : "giả lỗi"}" từ ${vn(want.since).hm}, nhưng thực tế đang "${cur}" và hệ thống tự sửa chưa được (đã thử mỗi 5 phút). Mở app bấm tay hoặc xem nhật ký.`, 3 * 3600e3)
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
    limits: f.limits,
    next: f.grant ? null : nextChange(f.rules, now),
    changedAt: f.changedAt ?? null,
    changedBy: f.changedBy ?? null,
  }
}
