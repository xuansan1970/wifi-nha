import { test } from "node:test"
import assert from "node:assert/strict"
import { desired, inWindow, isPublicIp, trafficExpr, type AppState } from "../netlify/functions/lib/appblock.mts"

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
test("chặn tay luôn có hiệu lực; trong giờ chặn thì chặn cả 3", () => {
  const a = desired(st({ on: { roblox: true } }), vnMs(TUE, "10:00"))
  assert.deepEqual(a, { lienquan: false, roblox: true, discord: false })
  assert.deepEqual(desired(st(), vnMs(MON, "20:00")), { lienquan: true, roblox: true, discord: true })
})
test("biểu thức luật Cloudflare + lọc IP công khai", () => {
  assert.equal(trafficExpr(["a.com", "b.gg"]), 'any(dns.domains[*] in {"a.com" "b.gg"})')
  assert.equal(isPublicIp("113.161.1.2"), true)
  for (const ip of ["192.168.1.8", "10.0.0.1", "172.16.5.1", "100.64.0.1", "", undefined]) assert.equal(isPublicIp(ip), false)
})
