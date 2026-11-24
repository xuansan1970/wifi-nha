// Chặn game & chat cho cả nhà bằng bộ lọc DNS NextDNS (gói miễn phí, không cần thẻ; trần 300.000 lượt/tháng, quá trần thì hết lọc).
// Router trỏ DNS về NextDNS (45.90.28.68 / 45.90.30.68); app bật/tắt dịch vụ, nhóm và danh sách chặn qua API.
// Cần 2 secret: NEXTDNS_API_KEY và NEXTDNS_PROFILE. Chưa có thì chức năng ở trạng thái "chưa kết nối".
// NextDNS nhận ra nhà mình theo IP ("Linked IP"); IP chỉ cập nhật được từ trong mạng nhà nên trình duyệt của người đang ở nhà sẽ gọi link cập nhật.
import { envGet, getJSON, setJSON } from "./store.mts"
import { getSnapshot } from "./snapshot.mts"
import { LISTS } from "./blocklists.mts"

// Nhóm chặn. svc/cat = dịch vụ và nhóm có sẵn của NextDNS; tên miền bổ sung nằm trong blocklists.mts (tự sinh, xem bin/build-blocklists.py).
// "games" = game và nền tảng game khác (Free Fire, PUBG, Liên Minh, Genshin, Minecraft, Steam, game web…).
// "bypass" = đường lách: VPN, 1.1.1.1/WARP, DNS mã hoá, iCloud Private Relay, Tor.
export const APPS = {
  lienquan: { name: "Liên Quân", game: true, svc: [], cat: [] },
  roblox: { name: "Roblox", game: true, svc: ["roblox"], cat: [] },
  discord: { name: "Discord", game: true, svc: ["discord"], cat: [] },
  games: { name: "Tất cả game khác", game: true, svc: ["fortnite", "leagueoflegends", "minecraft", "xboxlive", "steam", "blizzard", "playstation-network"], cat: ["gaming"] },
  bypass: { name: "VPN, 1.1.1.1 và đổi DNS", game: false, svc: [], cat: [] },
} as const
export type AppId = keyof typeof APPS
export const APP_IDS = Object.keys(APPS) as AppId[]
export type Sched = { enabled: boolean; days: number[]; from: string; to: string }
export type AppState = { on: Record<string, boolean>; sched: Sched; applied: Record<string, boolean>; sig?: string; ip?: string; linked?: string; token?: string; err?: string; at?: number }

const KEY = "appblock"
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const fresh = (): AppState => ({ on: {}, sched: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], from: "19:00", to: "21:00" }, applied: {} })
export const loadApps = async (): Promise<AppState> => ({ ...fresh(), ...(await getJSON<Partial<AppState>>(KEY, {})) })
export const configured = () => !!envGet("NEXTDNS_API_KEY") && !!envGet("NEXTDNS_PROFILE")

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
export const isPublicIp = (ip: any) => typeof ip === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)

// Ghép danh sách đang có trên NextDNS với phần app quản lý: mục app không quản lý (anh San tự thêm) giữ nguyên
export function mergeItems(cur: any[], managed: Map<string, boolean>) {
  const keep = (cur ?? []).filter((x) => !managed.has(x.id))
  const seen = new Map((cur ?? []).map((x) => [x.id, x]))
  return [...keep, ...[...managed].map(([id, active]) => ({ ...(seen.get(id) ?? {}), id, active }))]
}
// Tên miền chặn thêm: bật theo nhóm đang chặn
export function denyMap(want: Record<string, boolean>) {
  const m = new Map<string, boolean>()
  for (const id of APP_IDS) for (const d of LISTS[id] ?? []) m.set(d, !!want[id] || m.get(d) === true)
  return m
}
const sigOf = (want: Record<string, boolean>) => APP_IDS.map((id) => `${id}:${want[id] ? 1 : 0}:${(LISTS[id] ?? []).length}`).join("|")

async function nx(path: string, method = "GET", body?: any): Promise<any> {
  const res = await fetch(`https://api.nextdns.io/profiles/${envGet("NEXTDNS_PROFILE")}${path}`, {
    method,
    headers: { "X-Api-Key": envGet("NEXTDNS_API_KEY")!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || j?.errors) throw new Error(`NextDNS: ${j?.errors?.[0]?.code || "HTTP " + res.status}`)
  return j?.data
}

// Đưa NextDNS về đúng trạng thái mong muốn. Gọi khi bấm nút và mỗi lần tick; không có gì đổi thì chỉ đọc IP đang liên kết.
export async function applyApps(now = Date.now()): Promise<AppState> {
  const st = await loadApps()
  if (!configured()) return st
  const want = desired(st, now)
  try {
    const sig = sigOf(want)
    if (st.sig !== sig || st.err) {
      const svc = new Map<string, boolean>(), cat = new Map<string, boolean>()
      for (const id of APP_IDS) {
        for (const s of APPS[id].svc) svc.set(s, want[id])
        for (const c of APPS[id].cat) cat.set(c, want[id])
      }
      const [pc, deny] = await Promise.all([nx("/parentalControl"), nx("/denylist")])
      await nx("/parentalControl/services", "PUT", mergeItems(pc?.services, svc))
      await nx("/parentalControl/categories", "PUT", mergeItems(pc?.categories, cat))
      if (!!pc?.blockBypass !== want.bypass) await nx("/parentalControl", "PATCH", { blockBypass: want.bypass })
      await nx("/denylist", "PUT", mergeItems(deny, denyMap(want)))
      st.sig = sig
    }
    for (const id of APP_IDS) st.applied[id] = want[id]
    const setup = await nx("/setup")
    st.linked = setup?.linkedIp?.ip || ""
    st.token = setup?.linkedIp?.updateToken || ""
    const snap = await getSnapshot(10 * 60_000).catch(() => null)
    const ip = [...(snap?.routers ?? [])].sort((a: any, b: any) => a.order - b.order).map((r: any) => r.device?.wanIp).find(isPublicIp)
    if (ip) st.ip = ip
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
// Dữ liệu cho giao diện. clientIp = IP của người đang mở app: nếu họ đang ở nhà mà NextDNS chưa biết IP nhà thì trả link để trình duyệt tự cập nhật.
export function appView(st: AppState, now: number, parent: boolean, clientIp = "") {
  const want = desired(st, now)
  const linkedOk = !!st.ip && st.linked === st.ip
  const atHome = !!st.ip && clientIp === st.ip
  return {
    configured: configured(),
    apps: APP_IDS.map((id) => ({ id, name: APPS[id].name, on: !!st.on[id], active: want[id], applied: st.applied[id] === want[id] })),
    sched: st.sched,
    inWindow: inWindow(st.sched, now),
    err: st.err ?? null,
    linkedOk,
    relink: configured() && atHome && !linkedOk && st.token ? `https://link-ip.nextdns.io/${envGet("NEXTDNS_PROFILE")}/${st.token}` : null,
    ...(parent ? {} : { ip: st.ip ?? null, linked: st.linked ?? null, at: st.at ?? null }),
  }
}
