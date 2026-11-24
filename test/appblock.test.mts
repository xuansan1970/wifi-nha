import { test } from "node:test"
import assert from "node:assert/strict"
import { denyMap, desired, inWindow, isPublicIp, mergeItems, type AppState } from "../netlify/functions/lib/appblock.mts"

const vnMs = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+07:00`)
const MON = "2026-11-16", TUE = "2026-11-17"
const st = (o: Partial<AppState> = {}): AppState => ({ on: {}, applied: {}, sched: { enabled: true, days: [1], from: "19:00", to: "21:00" }, ...o })

test("giờ chặn trong ngày: đúng ngày, đúng khung", () => {
  const s = st().sched
  assert.equal(inWindow(s, vnMs(MON, "19:00")), true)
  assert.equal(inWindow(s, vnMs(MON, "20:59")), true)
  assert.equal(inWindow(s, vnMs(MON, "21:00")), false)
  assert.equal(inWindow(s, vnMs(TUE, "20:00")), false)
  assert.equal(inWindow({ ...s, enabled: false }, vnMs(MON, "20:00")), false)
})
test("giờ chặn qua đêm tính theo ngày bắt đầu", () => {
  const s = { enabled: true, days: [1], from: "21:00", to: "06:00" }
  assert.equal(inWindow(s, vnMs(MON, "22:00")), true)
  assert.equal(inWindow(s, vnMs(TUE, "05:59")), true)
  assert.equal(inWindow(s, vnMs(TUE, "06:00")), false)
  assert.equal(inWindow(s, vnMs(TUE, "22:00")), false)
})
test("chặn tay luôn có hiệu lực; đang chặn game thì tự chặn đường lách", () => {
  assert.deepEqual(desired(st({ on: { roblox: true } }), vnMs(TUE, "10:00")), { lienquan: false, roblox: true, discord: false, games: false, bypass: true })
  assert.deepEqual(desired(st(), vnMs(TUE, "10:00")), { lienquan: false, roblox: false, discord: false, games: false, bypass: false })
  assert.equal(desired(st({ on: { bypass: true } }), vnMs(TUE, "10:00")).bypass, true)
})
test("trong giờ chặn: chặn hết game, chat và đường lách", () => {
  assert.deepEqual(desired(st(), vnMs(MON, "20:00")), { lienquan: true, roblox: true, discord: true, games: true, bypass: true })
})
test("ghép danh sách NextDNS: giữ mục anh San tự thêm, chỉ đổi mục app quản lý", () => {
  const cur = [{ id: "instagram", active: true }, { id: "roblox", active: true, recreation: false }]
  const out = mergeItems(cur, new Map([["roblox", false], ["discord", true]]))
  assert.deepEqual(out, [{ id: "instagram", active: true }, { id: "roblox", active: false, recreation: false }, { id: "discord", active: true }])
  assert.deepEqual(mergeItems(undefined as any, new Map([["a", true]])), [{ id: "a", active: true }])
})
test("tên miền chặn thêm bật theo nhóm; lọc IP công khai", () => {
  const m = denyMap({ lienquan: true })
  assert.equal(m.get("garena.vn"), true)
  assert.equal(m.get("riotgames.com"), false)
  assert.equal(m.has("nextdns.io"), false)
  assert.equal(isPublicIp("113.161.1.2"), true)
  for (const ip of ["192.168.1.8", "10.0.0.1", "172.16.5.1", "100.64.0.1", "", undefined]) assert.equal(isPublicIp(ip), false)
})
test("danh sách chặn: đủ nhóm, không dính dịch vụ thiết yếu", async () => {
  const { LISTS } = await import("../netlify/functions/lib/blocklists.mts")
  for (const g of ["lienquan", "roblox", "discord", "games", "bypass"]) assert.ok(LISTS[g].length > 10, g)
  const all = new Set(Object.values(LISTS).flat())
  for (const d of ["google.com", "youtube.com", "facebook.com", "zalo.me", "apple.com", "icloud.com", "microsoft.com", "cloudflare.com", "tiktok.com"]) assert.equal(all.has(d), false, d)
  for (const d of ["garena.vn", "roblox.com", "discord.com", "cloudflareclient.com", "dns.google", "riotgames.com"]) assert.equal(all.has(d), true, d)
})
