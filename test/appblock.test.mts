import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanDomain, desired, inWindow, isPublicIp, ITEMS, mergeItems, wantMaps, type AppState } from "../netlify/functions/lib/appblock.mts"

const vnMs = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+07:00`)
const MON = "2026-11-16", TUE = "2026-11-17"
const st = (o: Partial<AppState> = {}): AppState => ({ on: {}, custom: [], allow: [], sched: { enabled: true, days: [1], from: "19:00", to: "21:00", groups: ["game"] }, ...o })
const onIds = (d: Record<string, boolean>) => Object.keys(d).filter((k) => d[k]).sort()

test("giờ chặn trong ngày: đúng ngày, đúng khung", () => {
  const s = st().sched
  assert.equal(inWindow(s, vnMs(MON, "19:00")), true)
  assert.equal(inWindow(s, vnMs(MON, "20:59")), true)
  assert.equal(inWindow(s, vnMs(MON, "21:00")), false)
  assert.equal(inWindow(s, vnMs(TUE, "20:00")), false)
  assert.equal(inWindow({ ...s, enabled: false }, vnMs(MON, "20:00")), false)
})
test("giờ chặn qua đêm tính theo ngày bắt đầu", () => {
  const s = { enabled: true, days: [1], from: "21:00", to: "06:00", groups: ["game"] }
  assert.equal(inWindow(s, vnMs(MON, "22:00")), true)
  assert.equal(inWindow(s, vnMs(TUE, "05:59")), true)
  assert.equal(inWindow(s, vnMs(TUE, "06:00")), false)
  assert.equal(inWindow(s, vnMs(TUE, "22:00")), false)
})
test("chặn tay luôn có hiệu lực; đang chặn game thì tự chặn đường lách; mạng xã hội thì không kéo theo", () => {
  assert.deepEqual(onIds(desired(st({ on: { roblox: true } }), vnMs(TUE, "10:00"))), ["bypass", "roblox"])
  assert.deepEqual(onIds(desired(st({ on: { tiktok: true } }), vnMs(TUE, "10:00"))), ["tiktok"])
  assert.deepEqual(onIds(desired(st(), vnMs(TUE, "10:00"))), [])
})
test("trong giờ chặn: chỉ chặn các nhóm đã chọn", () => {
  assert.deepEqual(onIds(desired(st(), vnMs(MON, "20:00"))), ["bypass", "discord", "games", "lienquan", "roblox"])
  const d = desired(st({ sched: { enabled: true, days: [1], from: "19:00", to: "21:00", groups: ["video"] } }), vnMs(MON, "20:00"))
  assert.equal(d.youtube, true); assert.equal(d.roblox, false); assert.equal(d.bypass, false)
})
test("quy ra dịch vụ, nhóm và tên miền NextDNS", () => {
  const { svc, cat, deny } = wantMaps({ games: true, tiktok: true })
  assert.equal(svc.get("steam"), true); assert.equal(svc.get("tiktok"), true); assert.equal(svc.get("roblox"), false)
  assert.equal(cat.get("gaming"), true); assert.equal(cat.get("porn"), false)
  assert.equal(deny.get("riotgames.com"), true); assert.equal(deny.get("garena.vn"), false); assert.equal(deny.has("nextdns.io"), false)
})
test("ghép danh sách NextDNS: giữ thuộc tính sẵn có, chỉ đổi active", () => {
  const out = mergeItems([{ id: "other", active: true, website: "https://x.y" }, { id: "roblox", active: true, recreation: false, website: "https://roblox.com" }], new Map([["roblox", false], ["discord", true]]))
  assert.deepEqual(out, [{ id: "other", active: true }, { id: "roblox", active: false, recreation: false }, { id: "discord", active: true }])
})
test("tên miền tự thêm được làm sạch; IP công khai", () => {
  assert.equal(cleanDomain(" https://www.TikTok.com/abc?x=1 "), "tiktok.com")
  assert.throws(() => cleanDomain("khong hop le"))
  assert.equal(isPublicIp("113.161.1.2"), true)
  for (const ip of ["192.168.1.8", "10.0.0.1", "172.16.5.1", "100.64.0.1", "", undefined]) assert.equal(isPublicIp(ip), false)
})
test("danh mục: mã không trùng, nhóm hợp lệ; danh sách chặn không dính dịch vụ thiết yếu", async () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length)
  const { LISTS } = await import("../netlify/functions/lib/blocklists.mts")
  for (const g of ["lienquan", "roblox", "discord", "games", "bypass"]) assert.ok(LISTS[g].length > 10, g)
  const all = new Set(Object.values(LISTS).flat())
  for (const d of ["google.com", "youtube.com", "facebook.com", "zalo.me", "apple.com", "icloud.com", "microsoft.com", "cloudflare.com", "tiktok.com", "nextdns.io", "tailscale.com"]) assert.equal(all.has(d), false, d)
  for (const d of ["garena.vn", "roblox.com", "discord.com", "cloudflareclient.com", "dns.google", "riotgames.com"]) assert.equal(all.has(d), true, d)
})
