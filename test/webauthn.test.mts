// Mở khoá Face ID/vân tay: giả lập 1 máy (authenticator) rồi chạy trọn luồng bật → mở khoá → gỡ qua /api/webauthn/*
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, randomBytes, sign as nodeSign } from "node:crypto"
import { makeToken, loadUsers } from "../netlify/functions/lib/auth.mts"
import { waRoutes } from "../netlify/functions/lib/webauthn.mts"

// Kho dữ liệu giả thay Durable Object
const mem = new Map<string, any>()
;(globalThis as any).__CF_DO = {
  get: async (k: string) => mem.get(k),
  put: async (k: string, v: any) => void mem.set(k, structuredClone(v)),
  bump: async (k: string, w: number) => {
    const c = mem.get(k)
    const cur = c && Date.now() - c.start <= w ? { n: c.n + 1, start: c.start } : { n: 1, start: Date.now() }
    mem.set(k, cur)
    return cur
  },
  peek: async (k: string, w: number) => {
    const c = mem.get(k)
    return c && Date.now() - c.start <= w ? c : { n: 0, start: 0 }
  },
  clear: async (k: string) => void mem.delete(k),
  auditAdd: async () => {},
}
process.env.APP_SECRET = "test-secret-0123456789abcdef"
process.env.APP_USERS = "san:Xuân San:admin:1111;ba:Ba:parent:2222;me:Mẹ:parent:3333"

const ORIGIN = "https://wifi.test"
const RP = "wifi.test"
const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url")
const sha = (d: Uint8Array | string) => createHash("sha256").update(d).digest()
const json = (d: any, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: h })

async function call(path: string, body: any, cookie = "", ip = "1.1.1.1", m = "POST") {
  const url = new URL(ORIGIN + "/api" + path)
  const req = new Request(url, { method: m, headers: { cookie, "cf-connecting-ip": ip, "user-agent": "test" } })
  const r = (await waRoutes({ path, m, body, req, url, json }))!
  return { status: r.status, data: (await r.json()) as any, cookie: r.headers.get("set-cookie") ?? "" }
}
const cookieOf = async (uid: string) => {
  const u = (await loadUsers()).find((x) => x.id === uid)!
  return `wn_sess=${makeToken(u)}`
}

// "Máy" giả: giữ khoá riêng, ký như Face ID thật (flags: UP+UV, có AT khi đăng ký)
function device(kind: "ec" | "rsa" = "ec") {
  const kp = kind === "ec" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : generateKeyPairSync("rsa", { modulusLength: 2048 })
  const id = randomBytes(20)
  const authData = (flags: number, attested: boolean, rp = RP) =>
    Buffer.concat([sha(rp), Buffer.from([flags]), Buffer.alloc(4), ...(attested ? [Buffer.alloc(16), Buffer.from([0, id.length]), id, Buffer.from([0xa0])] : [])])
  const client = (type: string, challenge: string, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  return {
    id: b64u(id),
    create(o: any, opt: { origin?: string; flags?: number } = {}) {
      return { token: o.token, id: b64u(id), alg: kind === "ec" ? -7 : -257, label: "Máy thử", clientDataJSON: b64u(client("webauthn.create", o.challenge, opt.origin)), authenticatorData: b64u(authData(opt.flags ?? 0x45, true)), publicKey: b64u(kp.publicKey.export({ type: "spki", format: "der" })) }
    },
    get(o: any, opt: { origin?: string; flags?: number; tamper?: boolean; rp?: string } = {}) {
      const ad = authData(opt.flags ?? 0x05, false, opt.rp)
      const cd = client("webauthn.get", o.challenge, opt.origin)
      const sig = nodeSign("sha256", Buffer.concat([ad, sha(cd)]), kp.privateKey)
      if (opt.tamper) sig[sig.length - 1] ^= 1
      return { token: o.token, id: b64u(id), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig) }
    },
  }
}
const enroll = async (uid: string, d = device()) => {
  const ck = await cookieOf(uid)
  const o = (await call("/webauthn/register/options", {}, ck)).data
  const r = await call("/webauthn/register", d.create(o), ck)
  assert.equal(r.status, 200, JSON.stringify(r.data))
  return d
}
const unlock = async (d: ReturnType<typeof device>, opt: any = {}, ip = "1.1.1.1") => {
  const o = (await call("/webauthn/login/options", {}, "", ip)).data
  return call("/webauthn/login", d.get(o, opt), "", ip)
}

test("bật Face ID rồi mở khoá: vào đúng tài khoản, có cookie phiên", async () => {
  const d = await enroll("san")
  const r = await unlock(d)
  assert.equal(r.status, 200, JSON.stringify(r.data))
  assert.deepEqual(r.data.me, { uid: "san", name: "Xuân San", role: "admin" })
  assert.match(r.cookie, /^wn_sess=san\.admin\./)
})

test("Ba và Mẹ mỗi người một máy: mở khoá ra đúng người, đúng quyền phụ huynh", async () => {
  const ba = await enroll("ba"), me = await enroll("me")
  assert.equal((await unlock(ba)).data.me.uid, "ba")
  const r = await unlock(me)
  assert.equal(r.data.me.uid, "me")
  assert.equal(r.data.me.role, "parent")
})

test("khoá RSA (Windows Hello) cũng mở được", async () => {
  const d = await enroll("san", device("rsa"))
  assert.equal((await unlock(d)).status, 200)
})

test("chưa đăng nhập thì không bật được Face ID", async () => {
  assert.equal((await call("/webauthn/register/options", {})).status, 401)
  assert.equal((await call("/webauthn/register", {})).status, 401)
})

test("mã thử thách đăng ký của người này không dùng được cho người khác", async () => {
  const d = device()
  const o = (await call("/webauthn/register/options", {}, await cookieOf("ba"))).data
  assert.equal((await call("/webauthn/register", d.create(o), await cookieOf("san"))).status, 400)
})

test("từ chối: máy lạ, chữ ký sửa, sai trang, sai app, chưa xác minh khuôn mặt", async () => {
  const d = await enroll("san")
  assert.equal((await unlock(device(), {}, "2.2.2.1")).status, 401, "máy chưa bật")
  assert.equal((await unlock(d, { tamper: true }, "2.2.2.2")).status, 401, "chữ ký bị sửa")
  assert.equal((await unlock(d, { origin: "https://evil.test" }, "2.2.2.3")).status, 401, "trang giả")
  assert.equal((await unlock(d, { rp: "evil.test" }, "2.2.2.4")).status, 401, "app khác")
  assert.equal((await unlock(d, { flags: 0x01 }, "2.2.2.5")).status, 401, "không có UV")
})

test("phát lại đúng gói mở khoá cũ thì bị chặn", async () => {
  const d = await enroll("san")
  const o = (await call("/webauthn/login/options", {}, "", "3.3.3.3")).data
  const pkt = d.get(o)
  assert.equal((await call("/webauthn/login", pkt, "", "3.3.3.3")).status, 200)
  assert.equal((await call("/webauthn/login", pkt, "", "3.3.3.3")).status, 401)
})

test("sai 10 lần từ 1 IP thì khoá Face ID 15 phút (PIN vẫn dùng được)", async () => {
  const d = await enroll("san")
  for (let i = 0; i < 10; i++) await unlock(d, { tamper: true }, "4.4.4.4")
  const r = await unlock(d, {}, "4.4.4.4")
  assert.equal(r.status, 401)
  assert.match(r.data.error, /quá nhiều/)
  assert.equal((await unlock(d, {}, "4.4.4.5")).status, 200, "IP khác không bị ảnh hưởng")
})

test("gỡ máy: Ba Mẹ không gỡ/không thấy máy của Xuân San; Xuân San gỡ được mọi máy; gỡ xong hết mở khoá", async () => {
  const dSan = await enroll("san"), dBa = await enroll("ba")
  const ba = await cookieOf("ba"), san = await cookieOf("san")
  const seen = (await call("/webauthn/list", {}, ba, "1.1.1.1", "GET")).data.keys
  assert.ok(seen.every((k: any) => k.uid === "ba"))
  assert.equal((await call("/webauthn/remove", { id: dSan.id }, ba)).status, 400)
  assert.ok((await call("/webauthn/list", {}, san, "1.1.1.1", "GET")).data.keys.some((k: any) => k.uid === "ba"))
  assert.equal((await call("/webauthn/remove", { id: dBa.id }, san)).status, 200)
  assert.equal((await unlock(dBa, {}, "5.5.5.5")).status, 401)
  assert.equal((await unlock(dSan, {}, "5.5.5.6")).status, 200)
})

test("bật 2 lần trên cùng 1 máy thì báo đã bật", async () => {
  const d = await enroll("me")
  const ck = await cookieOf("me")
  const o = (await call("/webauthn/register/options", {}, ck)).data
  assert.ok(o.exclude.includes(d.id))
  assert.equal((await call("/webauthn/register", d.create(o), ck)).status, 400)
})
