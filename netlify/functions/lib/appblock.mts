// "Chặn" cho cả nhà bằng bộ lọc DNS NextDNS (gói miễn phí, không cần thẻ; trần 300.000 lượt/tháng, quá trần thì hết lọc).
// Router trỏ DNS về NextDNS (45.90.28.68 / 45.90.30.68); app là nơi DUY NHẤT chỉnh hồ sơ NextDNS: dịch vụ, nhóm nội dung, tìm kiếm an toàn,
// chặn quảng cáo, chặn web độc hại, chặn đường lách, tên miền tự thêm (denylist) và tên miền luôn cho qua (allowlist).
// Cần 2 secret: NEXTDNS_API_KEY và NEXTDNS_PROFILE. Chưa có thì chức năng ở trạng thái "chưa kết nối".
// NextDNS nhận ra nhà mình theo IP ("Linked IP"); IP chỉ cập nhật được từ trong mạng nhà nên trình duyệt của người đang ở nhà sẽ gọi link cập nhật.
import { envGet, getJSON, setJSON } from "./store.mts"
import { getSnapshot } from "./snapshot.mts"
import { LISTS } from "./blocklists.mts"

export const GROUPS = [
  { id: "game", name: "Game & Discord" },
  { id: "social", name: "Mạng xã hội" },
  { id: "chat", name: "Nhắn tin, gọi điện" },
  { id: "video", name: "Video, nhạc" },
  { id: "web", name: "Nội dung web" },
  { id: "safe", name: "An toàn & chống lách" },
] as const
type Item = { id: string; name: string; group: string; svc?: string[]; cat?: string[]; deny?: string; opt?: string }
const S = (group: string, list: [string, string][]): Item[] => list.map(([id, name]) => ({ id, name, group, svc: [id] }))
// svc/cat = mã dịch vụ và nhóm có sẵn của NextDNS; deny = danh sách tên miền bổ sung trong blocklists.mts (tự sinh, xem bin/build-blocklists.py)
export const ITEMS: Item[] = [
  { id: "lienquan", name: "Liên Quân", group: "game", deny: "lienquan" },
  { id: "roblox", name: "Roblox", group: "game", svc: ["roblox"], deny: "roblox" },
  { id: "discord", name: "Discord", group: "game", svc: ["discord"], deny: "discord" },
  { id: "games", name: "Tất cả game khác", group: "game", svc: ["fortnite", "leagueoflegends", "minecraft", "xboxlive", "steam", "blizzard", "playstation-network"], cat: ["gaming"], deny: "games" },
  ...S("social", [["tiktok", "TikTok"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["twitter", "X (Twitter)"], ["snapchat", "Snapchat"], ["reddit", "Reddit"], ["pinterest", "Pinterest"], ["tumblr", "Tumblr"], ["vk", "VK"], ["9gag", "9GAG"], ["bereal", "BeReal"], ["mastodon", "Mastodon"], ["imgur", "Imgur"], ["tinder", "Tinder"]]),
  { id: "c-social", name: "Mọi mạng xã hội khác", group: "social", cat: ["social-networks"] },
  { id: "c-dating", name: "Web, app hẹn hò", group: "social", cat: ["dating"] },
  ...S("chat", [["messenger", "Messenger"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"], ["signal", "Signal"], ["skype", "Skype"], ["google-chat", "Google Chat"], ["zoom", "Zoom"]]),
  { id: "c-messaging", name: "Mọi app nhắn tin khác", group: "chat", cat: ["messaging"] },
  ...S("video", [["youtube", "YouTube"], ["twitch", "Twitch"], ["netflix", "Netflix"], ["spotify", "Spotify"], ["dailymotion", "Dailymotion"], ["vimeo", "Vimeo"], ["primevideo", "Prime Video"], ["disneyplus", "Disney+"], ["hbomax", "HBO Max"], ["hulu", "Hulu"]]),
  { id: "c-video", name: "Mọi trang xem video khác", group: "video", cat: ["video-streaming"] },
  { id: "c-porn", name: "Web người lớn", group: "web", cat: ["porn"] },
  { id: "c-gambling", name: "Cờ bạc, cá độ", group: "web", cat: ["gambling"] },
  { id: "c-piracy", name: "Web lậu, tải lậu", group: "web", cat: ["piracy"] },
  { id: "chatgpt", name: "ChatGPT", group: "web", svc: ["chatgpt"] },
  { id: "c-ai", name: "Mọi trợ lý AI", group: "web", cat: ["ai-assistants"] },
  { id: "c-mixed", name: "Trang nội dung lẫn lộn (diễn đàn, kho ảnh)", group: "web", cat: ["mixed-content-platforms"] },
  { id: "amazon", name: "Amazon", group: "web", svc: ["amazon"] },
  { id: "ebay", name: "eBay", group: "web", svc: ["ebay"] },
  { id: "bypass", name: "VPN, 1.1.1.1 và đổi DNS", group: "safe", opt: "blockBypass", deny: "bypass" },
  { id: "c-remote", name: "Điều khiển máy từ xa (TeamViewer, AnyDesk)", group: "safe", cat: ["remote-access-tools"] },
  { id: "safesearch", name: "Tìm kiếm an toàn (Google, Bing, YouTube)", group: "safe", opt: "safeSearch" },
  { id: "ytrestricted", name: "YouTube chế độ hạn chế", group: "safe", opt: "youtubeRestrictedMode" },
  { id: "adblock", name: "Chặn quảng cáo và theo dõi", group: "safe", opt: "adblock" },
  { id: "security", name: "Chặn web lừa đảo, mã độc", group: "safe", opt: "security" },
]
const ITEM = new Map(ITEMS.map((i) => [i.id, i]))
export type Sched = { enabled: boolean; days: number[]; from: string; to: string; groups: string[] }
export type AppState = { on: Record<string, boolean>; sched: Sched; custom: string[]; allow: string[]; imported?: boolean; boost?: boolean; sig?: string; okSig?: string; ip?: string; linked?: string; token?: string; err?: string; at?: number }

const KEY = "appblock"
// Kho ứng dụng luôn cho qua: nhóm "Online Gaming" của NextDNS chặn luôn cả App Store và Google Play (kiểm 24/11 bằng nhật ký NextDNS),
// làm cả nhà không tải/cập nhật được app nào khi đang chặn game. Tải game về vẫn không chơi được vì máy chủ game bị chặn.
export const STORE_ALLOW = ["apps.apple.com", "play.google.com"]
// Hạ tầng trong nhà KHÔNG BAO GIỜ bị bộ lọc đụng tới, dù bật mục chặn nào (anh San chốt 25/11: chặn game/nội dung không được liên quan tới đèn hồ cá).
// doseen.com: máy chủ của hãng mà đèn hồ cá AiPai phải nối tới thì web mới điều khiển được. giadinhxuan.workers.dev: các app Nhà Mình (đèn, TV, WiFi, app tổng).
// Danh sách "luôn cho qua" của NextDNS thắng mọi luật chặn (dịch vụ, nhóm nội dung, tên miền tự thêm, chặn đường lách) và tính cả tên miền con.
export const HOME_ALLOW = ["doseen.com", "giadinhxuan.workers.dev"]
// Thiết bị thông minh trong nhà (WiFi IoT) không bao giờ bị bộ lọc đụng tới (anh San chốt 26/11). NextDNS lọc theo IP nhà nên không tách được theo từng WiFi;
// cách miễn trừ là luôn cho qua máy chủ của các hãng thiết bị: Tuya/SmartLife (đèn, máy lạnh, hub), EZVIZ/Hikvision (camera), Xiaomi (quạt), Ruijie (router).
export const IOT_ALLOW = [
  "tuya.com", "tuyaus.com", "tuyacn.com", "tuyaeu.com", "tuyain.com",
  "ezvizlife.com", "ezviz7.com", "ezviz.com", "hik-connect.com", "hikvision.com",
  "io.mi.com", "account.xiaomi.com",
  "ruijienetworks.com", "ruijie.com.cn", "rj.link",
]
export const ALWAYS_ALLOW = [...STORE_ALLOW, ...HOME_ALLOW, ...IOT_ALLOW]
const QUOTA = 300_000
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/
const fresh = (): AppState => ({ on: {}, sched: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], from: "19:00", to: "21:00", groups: ["game"] }, custom: [], allow: [] })
export const loadApps = async (): Promise<AppState> => {
  const f = fresh(), s = await getJSON<Partial<AppState>>(KEY, {})
  return { ...f, ...s, sched: { ...f.sched, ...(s.sched ?? {}) } }
}
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
// Mục nào cần chặn lúc này: đang gạt chặn tay, hoặc thuộc nhóm đang trong giờ chặn.
// Hễ đang chặn bất kỳ game nào thì tự chặn luôn đường lách (VPN, 1.1.1.1, đổi DNS).
export function desired(st: AppState, now: number): Record<string, boolean> {
  const win = inWindow(st.sched, now)
  const d: Record<string, boolean> = {}
  for (const i of ITEMS) d[i.id] = !!st.on[i.id] || (win && st.sched.groups.includes(i.group))
  d.bypass = d.bypass || ITEMS.some((i) => i.group === "game" && d[i.id])
  return d
}
export const isPublicIp = (ip: any) => typeof ip === "string" && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)
export const cleanDomain = (v: any) => {
  const d = String(v ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:\s]/)[0]
  if (!DOMAIN.test(d) || d.length > 100) throw new Error("Tên miền không hợp lệ (ví dụ đúng: tiktok.com)")
  return d
}

// Dịch vụ / nhóm NextDNS: giữ thuộc tính sẵn có (vd recreation), chỉ đổi active
export function mergeItems(cur: any[], managed: Map<string, boolean>) {
  const keep = (cur ?? []).filter((x) => !managed.has(x.id))
  const seen = new Map((cur ?? []).map((x) => [x.id, x]))
  // NextDNS chỉ nhận id, active, recreation; gửi kèm trường khác (vd website) là bị từ chối ("extraneous")
  const pick = (x: any) => ({ id: x.id, active: !!x.active, ...(x.recreation !== undefined ? { recreation: !!x.recreation } : {}) })
  return [...keep.map(pick), ...[...managed].map(([id, active]) => pick({ ...(seen.get(id) ?? {}), id, active }))]
}
export function wantMaps(want: Record<string, boolean>) {
  const svc = new Map<string, boolean>(), cat = new Map<string, boolean>(), deny = new Map<string, boolean>()
  for (const i of ITEMS) {
    for (const s of i.svc ?? []) svc.set(s, !!want[i.id] || svc.get(s) === true)
    for (const c of i.cat ?? []) cat.set(c, !!want[i.id] || cat.get(c) === true)
    for (const d of (i.deny && LISTS[i.deny]) || []) deny.set(d, !!want[i.id] || deny.get(d) === true)
  }
  return { svc, cat, deny }
}
const sigOf = (st: AppState, want: Record<string, boolean>) => ITEMS.map((i) => (want[i.id] ? 1 : 0)).join("") + "|" + Object.values(LISTS).map((l) => l.length).join(",") + "|" + st.custom.join(",") + "|" + st.allow.join(",") + "|" + ALWAYS_ALLOW.join(",")

export async function nx(path: string, method = "GET", body?: any): Promise<any> {
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

// Lần đầu kết nối: lấy những gì đang bật sẵn trên NextDNS làm trạng thái ban đầu của app (không tự tắt thứ anh San đã bật)
function importState(st: AppState, pc: any, privacy: any, security: any) {
  const act = (arr: any[], id: string) => (arr ?? []).some((x) => x.id === id && x.active)
  for (const i of ITEMS) {
    if (i.svc?.length === 1 && !i.cat && act(pc?.services, i.svc[0])) st.on[i.id] = true
    if (i.cat?.length === 1 && !i.svc && act(pc?.categories, i.cat[0])) st.on[i.id] = true
  }
  if (pc?.safeSearch) st.on.safesearch = true
  if (pc?.youtubeRestrictedMode) st.on.ytrestricted = true
  if (pc?.blockBypass) st.on.bypass = true
  if ((privacy?.blocklists ?? []).length) st.on.adblock = true
  if (security?.googleSafeBrowsing || security?.threatIntelligenceFeeds) st.on.security = true
  st.imported = true
}

// Đưa NextDNS về đúng trạng thái mong muốn. Gọi khi bấm nút và mỗi lần tick; không có gì đổi thì chỉ đọc IP đang liên kết.
export async function applyApps(now = Date.now()): Promise<AppState> {
  const st = await loadApps()
  if (!configured()) return st
  try {
    if (!st.imported) {
      const [pc, privacy, security] = await Promise.all([nx("/parentalControl"), nx("/privacy"), nx("/security")])
      importState(st, pc, privacy, security)
    }
    const want = desired(st, now)
    const sig = sigOf(st, want)
    st.sig = sig
    if (st.okSig !== sig) {
      const { svc, cat, deny } = wantMaps(want)
      for (const d of st.custom) deny.set(d, true)
      const pc = await nx("/parentalControl")
      await nx("/parentalControl/services", "PUT", mergeItems(pc?.services, svc))
      await nx("/parentalControl/categories", "PUT", mergeItems(pc?.categories, cat))
      await nx("/parentalControl", "PATCH", { safeSearch: want.safesearch, youtubeRestrictedMode: want.ytrestricted, blockBypass: want.bypass })
      await nx("/privacy/blocklists", "PUT", want.adblock ? [{ id: "nextdns-recommended" }] : [])
      await nx("/security", "PATCH", { threatIntelligenceFeeds: want.security, googleSafeBrowsing: want.security, cryptojacking: want.security })
      await nx("/denylist", "PUT", [...deny].map(([id, active]) => ({ id, active })))
      await nx("/allowlist", "PUT", [...new Set([...ALWAYS_ALLOW, ...st.allow])].map((id) => ({ id, active: true })))
      // Giữ câu trả lời DNS lâu hơn để đỡ tốn lượt truy vấn (gói miễn phí có trần theo tháng)
      if (!st.boost) { await nx("/settings/performance", "PATCH", { cacheBoost: true }).catch(() => {}); st.boost = true }
      st.okSig = sig
    }
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
  if (!ITEM.has(id)) throw new Error("Không có mục này")
  const st = await loadApps()
  st.on[id] = !!on
  await setJSON(KEY, st)
  return applyApps()
}
// 2 nút ở thẻ chặn game: "Chặn toàn bộ" = bật MỌI công tắc trong thẻ (các mục game + đường lách); "Gỡ toàn bộ" = tắt hết các công tắc đó.
// Giờ chặn (nếu đang bật) không bị đụng tới.
// YouTube và Netflix KHÔNG BAO GIỜ bị 2 nút này đụng tới (anh San chốt 24/11: chặn 2 mục này làm TV phòng khách không xem được).
// Muốn chặn YouTube/Netflix thì gạt tay từng mục trong "Chặn thêm".
export const TV_KEEP = ["youtube", "netflix"]
export async function setAllGames(on: boolean) {
  const st = await loadApps()
  for (const i of ITEMS) if (i.group === "game") st.on[i.id] = !!on
  // Công tắc "VPN, 1.1.1.1 và đổi DNS" nằm cùng thẻ nên bật/tắt theo: bấm Chặn toàn bộ thì mọi công tắc trong thẻ đều bật
  st.on.bypass = !!on
  await setJSON(KEY, st)
  return applyApps()
}
// Đặt nhiều công tắc trong 1 lần ghi (dùng khi khôi phục trạng thái)
export async function setMany(map: Record<string, boolean>) {
  const st = await loadApps()
  for (const [id, on] of Object.entries(map)) if (ITEM.has(id)) st.on[id] = !!on
  await setJSON(KEY, st)
  return applyApps()
}
export async function saveSched(b: any) {
  const days = [...new Set((Array.isArray(b?.days) ? b.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6))].sort() as number[]
  const groups = (Array.isArray(b?.groups) ? b.groups : []).filter((g: any) => GROUPS.some((x) => x.id === g && x.id !== "safe")) as string[]
  if (!HM.test(b?.from) || !HM.test(b?.to)) throw new Error("Giờ không hợp lệ")
  if (b.from === b.to) throw new Error("Giờ bắt đầu và kết thúc phải khác nhau")
  if (b.enabled && !days.length) throw new Error("Chọn ít nhất 1 ngày")
  if (b.enabled && !groups.length) throw new Error("Chọn ít nhất 1 nhóm để chặn theo giờ")
  const st = await loadApps()
  st.sched = { enabled: !!b.enabled, days, from: b.from, to: b.to, groups: [...new Set(groups)] }
  await setJSON(KEY, st)
  return applyApps()
}
// Tên miền tự thêm: list = "deny" (luôn chặn) hoặc "allow" (luôn cho qua, thắng mọi luật chặn)
export async function editDomain(list: string, domain: any, add: boolean) {
  if (list !== "deny" && list !== "allow") throw new Error("Danh sách không hợp lệ")
  const d = cleanDomain(domain)
  const st = await loadApps()
  const key = list === "deny" ? "custom" : "allow"
  const cur = st[key].filter((x) => x !== d)
  if (add && cur.length >= 200) throw new Error("Tối đa 200 tên miền mỗi danh sách")
  st[key] = add ? [...cur, d] : cur
  await setJSON(KEY, st)
  return { st: await applyApps(), domain: d }
}
// Số lượt đã dùng trong tháng (trần gói miễn phí) + tên miền bị chặn nhiều nhất 24 giờ qua
export async function appStats(withTop: boolean) {
  if (!configured()) return { configured: false }
  const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 8) + "01"
  const [status, top] = await Promise.all([nx(`/analytics/status?from=${month}`), withTop ? nx("/analytics/domains?status=blocked&from=-1d&limit=15") : Promise.resolve([])])
  const used = (status ?? []).reduce((a: number, x: any) => a + (Number(x.queries) || 0), 0)
  const blocked = (status ?? []).filter((x: any) => x.status === "blocked").reduce((a: number, x: any) => a + (Number(x.queries) || 0), 0)
  return { configured: true, used, blocked, quota: QUOTA, top: (top ?? []).map((x: any) => ({ domain: x.domain, queries: x.queries })) }
}
// Dữ liệu cho giao diện. clientIp = IP của người đang mở app: nếu họ đang ở nhà mà NextDNS chưa biết IP nhà thì trả link để trình duyệt tự cập nhật.
export function appView(st: AppState, now: number, parent: boolean, clientIp = "") {
  const want = desired(st, now)
  const linkedOk = !!st.ip && st.linked === st.ip
  const atHome = !!st.ip && clientIp === st.ip
  return {
    configured: configured(),
    groups: GROUPS,
    items: ITEMS.map((i) => ({ id: i.id, name: i.name, group: i.group, on: !!st.on[i.id], active: want[i.id] })),
    pending: st.sig !== st.okSig,
    sched: st.sched,
    inWindow: inWindow(st.sched, now),
    custom: st.custom,
    allow: st.allow,
    err: st.err ?? null,
    linkedOk,
    relink: configured() && atHome && !linkedOk && st.token ? `https://link-ip.nextdns.io/${envGet("NEXTDNS_PROFILE")}/${st.token}` : null,
    ...(parent ? {} : { ip: st.ip ?? null, linked: st.linked ?? null, at: st.at ?? null }),
  }
}
