// Chạy: node --test test/   (Node 22.18+ chạy thẳng .mts)
import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanLimit, cleanRule, inLimit, inOffWindow, nextChange, type Family, type NetRule } from "../netlify/functions/lib/family.mts"

// Giờ VN (UTC+7) → epoch ms. dow: 2026-11-16 = Thứ Hai
const vnMs = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+07:00`)
const MON = "2026-11-16", TUE = "2026-11-17", SUN = "2026-11-22", NEXT_MON = "2026-11-23"
const rule = (o: Partial<NetRule> = {}): NetRule => ({ id: "r", name: "đêm", days: [0, 1, 2, 3, 4, 5, 6], offAt: "22:00", onAt: "06:30", enabled: true, mode: "off", ...o })
const fam = (limits: Family["limits"]): Family => ({ on: true, ghost: [], rules: [], timers: [], limits })

test("lịch qua đêm 22:00→06:30: tắt trước nửa đêm, mở sau 06:30", () => {
  const r = [rule()]
  assert.ok(!inOffWindow(r, vnMs(MON, "21:59")))
  assert.ok(inOffWindow(r, vnMs(MON, "22:00")))
  assert.ok(inOffWindow(r, vnMs(MON, "23:59")))
  assert.ok(inOffWindow(r, vnMs(TUE, "00:00")), "qua nửa đêm vẫn tắt")
  assert.ok(inOffWindow(r, vnMs(TUE, "06:29")))
  assert.ok(!inOffWindow(r, vnMs(TUE, "06:30")), "06:30 phải mở")
})

test("khung qua đêm tính theo ngày BẮT ĐẦU (chỉ T2: tắt T2 22:00 → T3 06:30, T3 đêm thì không)", () => {
  const r = [rule({ days: [1] })]
  assert.ok(inOffWindow(r, vnMs(MON, "23:00")))
  assert.ok(inOffWindow(r, vnMs(TUE, "05:00")), "sáng T3 vẫn thuộc khung bắt đầu từ T2")
  assert.ok(!inOffWindow(r, vnMs(TUE, "23:00")), "đêm T3 không áp dụng")
})

test("Chủ nhật → Thứ hai: khung bắt đầu CN kéo sang T2", () => {
  const r = [rule({ days: [0] })]
  assert.ok(inOffWindow(r, vnMs(SUN, "23:00")))
  assert.ok(inOffWindow(r, vnMs(NEXT_MON, "02:00")))
  assert.ok(!inOffWindow(r, vnMs(NEXT_MON, "23:00")))
})

test("lịch tắt (enabled=false) không có tác dụng", () => {
  assert.ok(!inOffWindow([rule({ enabled: false })], vnMs(MON, "23:00")))
})

test("lịch trong cùng ngày 13:00→15:00", () => {
  const r = [rule({ offAt: "13:00", onAt: "15:00" })]
  assert.ok(!inOffWindow(r, vnMs(MON, "12:59")))
  assert.ok(inOffWindow(r, vnMs(MON, "13:00")))
  assert.ok(!inOffWindow(r, vnMs(MON, "15:00")))
})

test("nextChange báo đúng lần đổi kế tiếp", () => {
  const n = nextChange([rule()], vnMs(MON, "21:00"))!
  assert.equal(n.at, vnMs(MON, "22:00"))
  assert.equal(n.on, false)
  const m = nextChange([rule()], vnMs(MON, "23:00"))!
  assert.equal(m.at, vnMs(TUE, "06:30"))
  assert.equal(m.on, true)
})

test("cleanRule từ chối giờ sai, trùng giờ, không chọn ngày", () => {
  assert.throws(() => cleanRule({ offAt: "25:00", onAt: "06:00", days: [1] }))
  assert.throws(() => cleanRule({ offAt: "22:00", onAt: "22:00", days: [1] }))
  assert.throws(() => cleanRule({ offAt: "22:00", onAt: "06:00", days: [] }))
  assert.equal(cleanRule({ offAt: "22:00", onAt: "06:00", days: [1, 1, 9] }).days.length, 1)
})

test("giờ dùng WiFi: ranh giới 22:00 và ngày không áp dụng", () => {
  const f = fam([{ id: "l", ssid: "Nha", enabled: true, days: [1, 2], wins: [["06:30", "22:00"]] }])
  assert.ok(inLimit(f, "Nha", vnMs(MON, "21:59")))
  assert.ok(!inLimit(f, "Nha", vnMs(MON, "22:00")), "22:00 hết giờ dùng")
  assert.ok(!inLimit(f, "Nha", vnMs(MON, "06:29")))
  assert.ok(inLimit(f, "Nha", vnMs(SUN, "23:30")), "CN không đặt giờ = dùng tự do")
  assert.ok(inLimit(f, "nha ", vnMs(MON, "12:00")), "tên không phân biệt hoa thường/khoảng trắng")
})

test("giờ dùng WiFi: 24:00 hợp lệ, khung ngược bị từ chối, WiFi khác không bị ảnh hưởng", () => {
  const l = cleanLimit({ ssid: "Nha", days: [1], wins: [{ 0: "06:00", 1: "24:00" }] })
  assert.deepEqual(l.wins, [["06:00", "24:00"]])
  assert.throws(() => cleanLimit({ ssid: "Nha", days: [1], wins: [{ 0: "22:00", 1: "06:00" }] }))
  assert.ok(inLimit(fam([l]), "Khac", vnMs(MON, "03:00")))
})

// ---- Bảng ưu tiên: bù lần đổi bị lỡ (lastFlip) ----
import { lastFlip } from "../netlify/functions/lib/family.mts"

test("lastFlip: 07:00 sáng → lịch yêu cầu MỞ kể từ 06:30 (cron lỡ 06:30 vẫn bù được)", () => {
  const w = lastFlip([rule()], vnMs(TUE, "07:00"))!
  assert.equal(w.scene, "on")
  assert.equal(w.since, vnMs(TUE, "06:30"))
})

test("lastFlip: 23:10 → lịch yêu cầu TẮT kể từ 22:00", () => {
  const w = lastFlip([rule()], vnMs(MON, "23:10"))!
  assert.equal(w.scene, "off")
  assert.equal(w.since, vnMs(MON, "22:00"))
})

test("lastFlip: chế độ giả lỗi (ghost) được giữ", () => {
  assert.equal(lastFlip([rule({ mode: "ghost" })], vnMs(MON, "23:10"))!.scene, "ghost")
})

test("lastFlip: không có lịch bật → không bù", () => {
  assert.equal(lastFlip([rule({ enabled: false })], vnMs(MON, "23:10")), null)
  assert.equal(lastFlip([], vnMs(MON, "23:10")), null)
})

test("quy tắc bù: bấm tay SAU lần đổi thì thắng lịch; bấm tay TRƯỚC lần đổi thì lịch thắng", () => {
  const w = lastFlip([rule()], vnMs(MON, "23:10"))! // since = 22:00
  const needsCatchUp = (changedAt: number, cur: string) => changedAt < w.since && cur !== w.scene
  assert.equal(needsCatchUp(vnMs(MON, "22:30"), "on"), false, "Ba bấm mở lúc 22:30 → giữ")
  assert.equal(needsCatchUp(vnMs(MON, "18:00"), "on"), true, "chưa ai chạm từ chiều, mạng vẫn mở → tắt bù")
  assert.equal(needsCatchUp(vnMs(MON, "18:00"), "off"), false, "đã đúng lịch → không làm gì")
})

test("hai lịch chồng nhau: lịch đầu tiên đang trong khung thì quyết định", () => {
  const a = rule({ id: "a", offAt: "22:00", onAt: "06:30", mode: "off" })
  const b = rule({ id: "b", offAt: "21:00", onAt: "23:00", mode: "ghost" })
  assert.equal(lastFlip([a, b], vnMs(MON, "21:30"))!.scene, "ghost")
  assert.equal(lastFlip([a, b], vnMs(MON, "22:30"))!.scene, "off")
})

import { defaultRule } from "../netlify/functions/lib/family.mts"
test("lịch mặc định: mở 06:30, tắt 21:00 mọi ngày, luôn bật; sáng 09:07 lịch yêu cầu MỞ kể từ 06:30", () => {
  const d = defaultRule()
  assert.equal(d.enabled, true)
  const w = lastFlip([d], vnMs(TUE, "09:07"))!
  assert.equal(w.scene, "on")
  assert.equal(w.since, vnMs(TUE, "06:30"))
  assert.equal(d.offAt, "21:00")
  assert.equal(lastFlip([d], vnMs(TUE, "20:59"))!.scene, "on")
  assert.equal(lastFlip([d], vnMs(TUE, "21:00"))!.scene, "off")
})
