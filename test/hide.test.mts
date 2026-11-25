// Ba Mẹ ngang quyền Xuân San, chỉ giấu WiFi riêng (OGA) + IoT; eWeb và kho dữ liệu thô vẫn riêng Xuân San
import { test } from "node:test"
import assert from "node:assert/strict"
import api from "../netlify/functions/api.mts"
import { hideSet } from "../netlify/functions/lib/hide.mts"
import { loadUsers, makeToken } from "../netlify/functions/lib/auth.mts"

const mem = new Map<string, any>()
;(globalThis as any).__CF_DO = {
  get: async (k: string) => mem.get(k),
  put: async (k: string, v: any) => void mem.set(k, structuredClone(v)),
  auditAdd: async () => {},
}
process.env.APP_SECRET = "test-secret-0123456789abcdef"
process.env.APP_USERS = "san:Xuân San:admin:1111;ba:Ba:parent:2222"
const call = async (path: string, uid: string) =>
  api(new Request("https://wifi.test/api" + path, { headers: { cookie: `wn_sess=${makeToken((await loadUsers()).find((x) => x.id === uid)!)}` } }))

test("hideSet: giấu OGA + IoT, giữ WiFi gia đình", () => {
  const routers = [{ gid: 1, ssids: [{ id: 1, name: "Ninesouth13" }, { id: 2, name: "OGA-528DBD" }, { id: 3, name: "Nha IoT" }] }]
  const H = hideSet(routers, new Set(), { aa: { ssid: "Nha IoT" }, bb: { ssid: "Ninesouth13" }, cc: { ssid: "OGA-528DBD" } })
  assert.deepEqual([...H.fam], ["1:1"])
  assert.equal(H.mac("aa"), true)
  assert.equal(H.mac("cc"), true)
  assert.equal(H.mac("bb"), false)
  assert.equal(H.rule({ type: "reboot", gids: [1] }), true, "Ba Mẹ đặt được lịch khởi động lại")
  assert.equal(H.rule({ type: "wifi", targets: [{ gid: 1, ssidIds: [1] }] }), true)
  assert.equal(H.rule({ type: "wifi", targets: [{ gid: 1, ssidIds: [1, 2] }] }), false, "lịch đụng OGA thì không")
  assert.equal(H.rule({ type: "block", target: { kind: "device", id: "aa" } }), false)
  assert.equal(H.rule({ type: "block", target: { kind: "device", id: "bb" } }), true)
  assert.equal(H.text("Xem mật khẩu WiFi “OGA-528DBD”"), false)
  assert.equal(H.text("Chặn máy của em"), true)
})

test("Ba Mẹ vào được mục quản trị; eWeb và kho dữ liệu thô vẫn riêng Xuân San", async () => {
  assert.equal((await call("/accounts", "ba")).status, 200)
  assert.equal((await call("/accounts", "san")).status, 200)
  assert.equal((await call("/eweb/status", "ba")).status, 403)
  assert.equal((await call("/inventory", "ba")).status, 403)
})
