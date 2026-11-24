// Chặn game & chat (Liên Quân, Roblox, Discord) cho cả nhà bằng bộ lọc DNS Cloudflare Gateway.
// Router chỉ trỏ DNS về Cloudflare (172.64.36.1 / 172.64.36.2); app bật/tắt từng luật chặn qua API và báo IP nhà cho Cloudflare.
// Cần 2 secret: CF_API_TOKEN (quyền Zero Trust: Edit) và CF_ACCOUNT_ID. Chưa có thì chức năng ở trạng thái "chưa kết nối".
import { envGet, getJSON, setJSON } from "./store.mts"
import { getSnapshot } from "./snapshot.mts"

import { LISTS } from "./blocklists.mts"

// Nhóm chặn. Tên miền nằm trong blocklists.mts (tự sinh từ nguồn cộng đồng, xem bin/build-blocklists.py).
// "games" = các game/nền tảng game khác (Free Fire, PUBG, Liên Minh, Genshin, Minecraft, Steam, game web…).
// "bypass" = đường lách: VPN, 1.1.1.1/WARP, DNS mã hoá (DoH/DoT), iCloud Private Relay, Tor.
export const APPS = {
  lienquan: { name: "Liên Quân", game: true },
  roblox: { name: "Roblox", game: true },
  discord: { name: "Discord", game: true },
  games: { name: "Tất cả game khác", game: true, cat: /^(gaming|online games?|video games?)$/i },
  bypass: { name: "VPN, 1.1.1.1 và đổi DNS", game: false, cat: /^(anonymizers?|vpns?|dns tunneling)$/i },
} as const
export type AppId = keyof typeof APPS
export const APP_IDS = Object.keys(APPS) as AppId[]
export type Sched = { enabled: boolean; days: number[]; from: string; to: string }
export type AppState = { on: Record<string, boolean>; sched: Sched; applied: Record<string, boolean>; lists?: Record<string, string>; ip?: string; err?: string; at?: number }

const KEY = "appblock"
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const RULE = (id: string) => `wifi-nha: chan ${id}`
const LOC = "Nha (wifi-nha)"
const fresh = (): AppState => ({ on: {}, sched: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], from: "19:00", to: "21:00" }, applied: {} })
export const loadApps = async (): Promise<AppState> => ({ ...fresh(), ...(await getJSON<Partial<AppState>>(KEY, {})) })
export const configured = () => !!envGet("CF_API_TOKEN") && !!envGet("CF_ACCOUNT_ID")

// Đang trong giờ chặn? Giờ Việt Nam; hỗ trợ khung qua đêm (vd 21:00 → 06:00 tính theo ngày bắt đầu)
export function inWindow(s: Sched, now: number) {
  if (!s.enabled || !s.days.length || s.from === s.to) return false
  const d = new Date(now + 7 * 3600_000)
  const dow = d.getUTCDay()
  const hm = d.toISOString().slice(11, 16)
  if (s.from < s.to) return s.days.includes(dow) && hm >= s.from && hm < s.to
  return (s.days.includes(dow) && hm >= s.from) || (s.days.includes((dow + 6) % 7) && hm < s.to)
}
// Nhóm nào cần chặn lúc này: đang gạt chặn tay, hoặc (với game/chat) đang trong giờ chặn.
// Hễ đang chặn bất kỳ game nào thì tự chặn luôn đường lách (VPN, 1.1.1.1, đổi DNS).
export function desired(st: AppState, now: number) {
  const win = inWindow(st.sched, now)
  const d = Object.fromEntries(APP_IDS.map((id) => [id, !!st.on[id] || (APPS[id].game && win)])) as Record<AppId, boolean>
  d.bypass = d.bypass || APP_IDS.some((id) => APPS[id].game && d[id])
  return d
}
export const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
export const listsExpr = (ids: string[]) => ids.map((id) => `any(dns.domains[*] in $${id.replace(/-/g, "")})`).join(" or ")
const hash = (a: string[]) => { let h = 5381; for (const s of a) for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return `${a.length}:${h}` }
export const isPublicIp = (ip: any) => typeof ip === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)

async function cf(path: string, method = "GET", body?: any): Promise<any> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${envGet("CF_ACCOUNT_ID")}/gateway${path}`, {
    method,
    headers: { Authorization: `Bearer ${envGet("CF_API_TOKEN")}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  })
  const j: any = await res.json().catch(() => null)
  if (!j?.success) throw new Error(`Cloudflare: ${j?.errors?.[0]?.message || "HTTP " + res.status}`)
  return j.result
}

// Danh sách tên miền trên Cloudflare (tối đa 1.000 dòng/list nên chia khúc). Chỉ ghi lại khi nội dung đổi.
async function syncLists(id: AppId, st: AppState, all: any[]): Promise<string[]> {
  const parts = chunk(LISTS[id] ?? [], 1000)
  const h = hash(LISTS[id] ?? [])
  const ids: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const name = `wifi-nha:${id}:${i}`
    const items = parts[i].map((value) => ({ value }))
    const cur = all.find((x) => x.name === name)
    if (!cur) ids.push((await cf("/lists", "POST", { name, type: "DOMAIN", description: "Do app WiFi Nhà quản lý", items })).id)
    else {
      if (st.lists?.[id] !== h) await cf(`/lists/${cur.id}`, "PUT", { name, description: "Do app WiFi Nhà quản lý", items })
      ids.push(cur.id)
    }
  }
  st.lists = { ...(st.lists ?? {}), [id]: h }
  return ids
}
// Thêm nhóm phân loại sẵn của Cloudflare (Gaming, Anonymizer, VPN…) nếu tìm thấy theo tên; không thấy thì thôi
function catExpr(re: RegExp | undefined, cats: any[]) {
  if (!re) return ""
  const content: number[] = [], security: number[] = []
  for (const top of cats) for (const c of [top, ...(top.subcategories ?? [])]) if (re.test(c.name ?? "")) (/security/i.test(top.name ?? "") ? security : content).push(c.id)
  return [content.length ? `any(dns.content_category[*] in {${content.join(" ")}})` : "", security.length ? `any(dns.security_category[*] in {${security.join(" ")}})` : ""].filter(Boolean).join(" or ")
}

// Đưa Cloudflare về đúng trạng thái mong muốn (luật chặn + IP nhà). Gọi khi bấm nút và mỗi lần tick.
export async function applyApps(now = Date.now()): Promise<AppState> {
  const st = await loadApps()
  if (!configured()) return st
  const want = desired(st, now)
  try {
    const [rules, lists, cats]: any[][] = await Promise.all([cf("/rules"), cf("/lists"), cf("/categories").catch(() => [])])
    for (const id of APP_IDS) {
      const ids = await syncLists(id, st, lists ?? [])
      const byList = listsExpr(ids)
      const byCat = catExpr((APPS[id] as any).cat, cats ?? [])
      const base = { name: RULE(id), description: `Chặn ${APPS[id].name} (do app WiFi Nhà quản lý)`, action: "block", filters: ["dns"], traffic: [byList, byCat].filter(Boolean).join(" or "), identity: "", enabled: want[id] }
      const r = (rules ?? []).find((x) => x.name === base.name)
      const save = (b: typeof base) => (r ? cf(`/rules/${r.id}`, "PUT", { ...b, precedence: r.precedence }) : cf("/rules", "POST", b))
      // Cloudflare từ chối phần phân loại (gói Free có thể không có) thì chỉ dùng danh sách tên miền
      if (!r || r.enabled !== base.enabled || r.traffic !== base.traffic) await save(base).catch(() => save({ ...base, traffic: byList }))
      st.applied[id] = want[id]
    }
    const snap = await getSnapshot(10 * 60_000).catch(() => null)
    const ip = [...(snap?.routers ?? [])].sort((a: any, b: any) => a.order - b.order).map((r: any) => r.device?.wanIp).find(isPublicIp)
    if (ip) {
      const net = `${ip}/32`
      const locs: any[] = (await cf("/locations")) ?? []
      const loc = locs.find((x) => x.name === LOC)
      if (!loc) await cf("/locations", "POST", { name: LOC, client_default: false, ecs_support: false, networks: [{ network: net }] })
      else if (!(loc.networks ?? []).some((n: any) => n.network === net)) await cf(`/locations/${loc.id}`, "PUT", { name: LOC, client_default: !!loc.client_default, ecs_support: !!loc.ecs_support, networks: [{ network: net }] })
      st.ip = ip
    }
    delete st.err
  } catch (e: any) {
    st.err = String(e?.message || e).slice(0, 160)
  }
  st.at = now
  await setJSON(KEY, st)
  return st
}

export async function toggleApp(id: string, on: boolean) {
  if (!APP_IDS.includes(id as AppId)) throw new Error("Không có ứng dụng này")
  const st = await loadApps()
  st.on[id] = !!on
  await setJSON(KEY, st)
  return applyApps()
}
export async function saveSched(b: any) {
  const days = [...new Set((Array.isArray(b?.days) ? b.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6))].sort() as number[]
  if (!HM.test(b?.from) || !HM.test(b?.to)) throw new Error("Giờ không hợp lệ")
  if (b.from === b.to) throw new Error("Giờ bắt đầu và kết thúc phải khác nhau")
  if (b.enabled && !days.length) throw new Error("Chọn ít nhất 1 ngày")
  const st = await loadApps()
  st.sched = { enabled: !!b.enabled, days, from: b.from, to: b.to }
  await setJSON(KEY, st)
  return applyApps()
}
// Dữ liệu cho giao diện. Ba Mẹ không cần thấy IP nhà.
export function appView(st: AppState, now: number, parent: boolean) {
  const want = desired(st, now)
  return {
    configured: configured(),
    apps: APP_IDS.map((id) => ({ id, name: APPS[id].name, on: !!st.on[id], active: want[id], applied: st.applied[id] === want[id] })),
    sched: st.sched,
    inWindow: inWindow(st.sched, now),
    err: st.err ?? null,
    ...(parent ? {} : { ip: st.ip ?? null, at: st.at ?? null }),
  }
}
