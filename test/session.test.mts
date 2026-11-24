// Tự thoát sau 15 phút không dùng + bảng "Có gì mới" (ghi đã xem theo từng người)
import { test } from "node:test"
import assert from "node:assert/strict"
import api from "../netlify/functions/api.mts"
import { loadUsers, makeToken } from "../netlify/functions/lib/auth.mts"

const mem = new Map<string, any>()
;(globalThis as any).__CF_DO = {
  get: async (k: string) => mem.get(k),
  put: async (k: string, v: any) => void mem.set(k, structuredClone(v)),
  auditAdd: async () => {},
}
process.env.APP_SECRET = "test-secret-0123456789abcdef"
process.env.APP_USERS = "san:Xuân San:admin:1111;ba:Ba:parent:2222;me:Mẹ:parent:3333"

const cookieOf = async (uid: string) => `wn_sess=${makeToken((await loadUsers()).find((x) => x.id === uid)!)}`
const call = (path: string, cookie: string, o: { active?: boolean; body?: any } = {}) =>
  api(new Request("https://wifi.test/api" + path, { method: o.body ? "POST" : "GET", headers: { cookie, ...(o.active ? { "x-active": "1" } : {}), ...(o.body ? { "content-type": "application/json" } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }))
const realNow = Date.now
const at = async <T>(ms: number, fn: () => Promise<T>) => {
  Date.now = () => realNow() + ms
  try { return await fn() } finally { Date.now = realNow }
}

test("phiên hết sau 15 phút không thao tác — cả Xuân San lẫn Ba Mẹ", async () => {
  for (const uid of ["san", "ba"]) {
    const ck = await cookieOf(uid)
    assert.equal((await at(14 * 60000, () => call("/me", ck))).status, 200, uid + " phút 14 còn vào được")
    assert.equal((await at(16 * 60000, () => call("/me", ck))).status, 401, uid + " phút 16 phải mở khoá lại")
  }
})

test("đang thao tác thì được gia hạn; request app tự gọi nền thì không", async () => {
  const ck = await cookieOf("ba")
  assert.equal((await call("/me", ck)).headers.get("set-cookie"), null, "gọi nền không gia hạn")
  const r = await at(10 * 60000, () => call("/me", ck, { active: true }))
  const fresh = r.headers.get("set-cookie")!.split(";")[0]
  assert.match(fresh, /^wn_sess=ba\.parent\./)
  assert.match(r.headers.get("set-cookie")!, /Max-Age=900/)
  assert.equal((await at(20 * 60000, () => call("/me", fresh))).status, 200, "phiên mới sống tới phút 25")
  assert.equal((await at(26 * 60000, () => call("/me", fresh))).status, 401)
})

test("phiên đã hết thì x-active cũng không cứu được", async () => {
  const ck = await cookieOf("san")
  const r = await at(16 * 60000, () => call("/me", ck, { active: true }))
  assert.equal(r.status, 401)
  assert.equal(r.headers.get("set-cookie"), null)
})

test("Có gì mới: ghi đã xem theo từng người, Ba Mẹ dùng được", async () => {
  const ba = await cookieOf("ba"), me = await cookieOf("me")
  assert.deepEqual(((await (await call("/news", ba)).json()) as any).seen, [])
  assert.equal((await call("/news", ba, { body: { ids: ["2026-11-24-faceid", "x y z", "2026-11-24-faceid"] } })).status, 200)
  assert.deepEqual(((await (await call("/news", ba)).json()) as any).seen, ["2026-11-24-faceid"])
  assert.deepEqual(((await (await call("/news", me)).json()) as any).seen, [], "Mẹ chưa xem thì vẫn hiện cho Mẹ")
  assert.equal((await call("/news", "")).status, 401)
})

test("phiên kiểu cũ sống 60 ngày (cấp trước luật 15 phút) bị từ chối", async () => {
  const old = await at(30 * 86400_000, () => cookieOf("san"))
  assert.equal((await call("/me", old)).status, 401)
})

test("canh chặn: tìm tầng chưa nhận lệnh chặn và máy bị chặn mà vẫn nối WiFi", async () => {
  const { findLeaks } = await import("../netlify/functions/lib/blockwatch.mts")
  const r = findLeaks([
    { gid: 1, name: "Tret", blocked: ["aa"], clients: [{ mac: "bb" }, { mac: "aa", wired: true }] },
    { gid: 2, name: "T1", blocked: [], clients: [{ mac: "aa", ssid: "Ninesouth13" }] },
  ])
  assert.deepEqual(r.missing, [{ gid: 2, router: "T1", mac: "aa" }])
  assert.deepEqual(r.online, [{ gid: 2, router: "T1", mac: "aa", ssid: "Ninesouth13" }])
  assert.deepEqual(findLeaks([{ gid: 1, name: "Tret", blocked: [], clients: [{ mac: "bb" }] }]), { missing: [], online: [] })
})

test("bám đuôi: máy mới nối WiFi gia đình ngay sau lệnh chặn bị chặn theo; không đụng dây, IoT, WiFi riêng, máy đã có từ trước", async () => {
  const { pickHoppers } = await import("../netlify/functions/lib/engine.mts")
  const before = new Set(["old1", "blocked1"])
  const after = [{ mac: "old1", ssid: "Ninesouth13" }, { mac: "new1", ssid: "Gia Dinh Xuan Tung_TV" }, { mac: "new2", ssid: "Xuan Tung_iot T2" }, { mac: "new3", ssid: "OGA-528DBD" }, { mac: "new4", wired: true, ssid: "" }, { mac: "blocked1", ssid: "Ninesouth13" }]
  assert.deepEqual(pickHoppers(before, after, ["blocked1"]), ["new1"])
})

test("chặn 1 máy = chặn mọi địa chỉ WiFi của máy đó; tên chung chung thì không gộp nhầm máy khác", async () => {
  const { siblingMacs, linkName } = await import("../netlify/functions/lib/state.mts")
  const { findFollowers } = await import("../netlify/functions/lib/blockwatch.mts")
  const dev = (rawName: string) => ({ rawName, firstSeen: 0, lastSeen: 0 }) as any
  const devices = { aa0000000001: dev("MacBook Pro của San"), aa0000000002: dev("macbook pro của san"), aa0000000003: dev("iPhone"), aa0000000004: dev("iPhone"), aa0000000005: dev("Macbook Air Jerry"), aa0000000006: dev("") }
  assert.deepEqual(siblingMacs(["AA:00:00:00:00:01"], devices).sort(), ["aa0000000001", "aa0000000002"])
  assert.deepEqual(siblingMacs(["aa0000000003"], devices), ["aa0000000003"], "2 chiếc cùng tên 'iPhone' là 2 máy khác nhau")
  assert.deepEqual(siblingMacs(["aa0000000006"], devices), ["aa0000000006"])
  assert.equal(linkName("MacBook Air"), "")
  // tên do máy quét trong nhà đọc được cũng nối được 2 địa chỉ của cùng 1 máy, dù router không biết tên
  assert.deepEqual(siblingMacs(["aa0000000006"], devices, { aa0000000006: { name: "San’s MacBook Pro" }, aa0000000007: { name: "San’s MacBook Pro" } }).sort(), ["aa0000000006", "aa0000000007"])
  const routers = [{ gid: 1, name: "T2", blocked: ["aa0000000001"], clients: [{ mac: "aa0000000009", rawName: "MacBook Pro của San", ssid: "TV" }, { mac: "aa0000000005", rawName: "Macbook Air Jerry" }, { mac: "aa0000000001", rawName: "MacBook Pro của San" }] }]
  assert.deepEqual(findFollowers(routers, new Set(["macbook pro của san"])), [{ mac: "aa0000000009", name: "MacBook Pro của San", ssid: "TV", router: "T2" }])
})
