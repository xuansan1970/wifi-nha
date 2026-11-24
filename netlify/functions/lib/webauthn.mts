// Mở khoá bằng Face ID / vân tay (WebAuthn passkey của máy). Khuôn mặt/vân tay không rời khỏi máy:
// server chỉ giữ khoá công khai và kiểm chữ ký. PIN vẫn giữ nguyên làm đường dự phòng.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { loadUsers, makeToken, readSession, setCookie, type Session, type User } from "./auth.mts"
import { addLog } from "./state.mts"
import { bump, envGet, getJSON, peek, setJSON } from "./store.mts"

export type Passkey = { id: string; uid: string; spki: string; alg: number; label: string; at: number; last: number }
const KEY = "passkeys"
const TTL = 5 * 60000
const FAIL_WIN = 15 * 60000
const MAX_PER_USER = 10
const ALGS: Record<number, any> = {
  [-7]: { imp: { name: "ECDSA", namedCurve: "P-256" }, ver: { name: "ECDSA", hash: "SHA-256" } },
  [-257]: { imp: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, ver: { name: "RSASSA-PKCS1-v1_5" } },
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url")
const un64 = (s: any) => new Uint8Array(Buffer.from(String(s ?? ""), "base64url"))
const sha256 = async (d: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", d))
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && timingSafeEqual(a, b)
const sign = (v: string) => {
  const s = envGet("APP_SECRET")
  if (!s || s.length < 16) throw new Error("Thiếu APP_SECRET")
  return createHmac("sha256", s).update("wa|" + v).digest("base64url")
}
export class WaError extends Error {}
const bad = (m: string): never => {
  throw new WaError(m)
}

export const loadPasskeys = () => getJSON<Passkey[]>(KEY, [])

// Mã thử thách không cần lưu: server ký kèm hạn dùng, mục đích (reg/auth) và tài khoản
export function newChallenge(kind: "reg" | "auth", uid = "") {
  const challenge = b64u(randomBytes(32))
  const body = Buffer.from(JSON.stringify({ c: challenge, e: Date.now() + TTL, k: kind, u: uid })).toString("base64url")
  return { challenge, token: `${body}.${sign(body)}` }
}
function readToken(token: any, kind: "reg" | "auth") {
  const [body, sig] = String(token ?? "").split(".")
  if (!body || !sig || !same(Buffer.from(sig), Buffer.from(sign(body)))) bad("Phiên xác thực không hợp lệ, thử lại")
  const t = JSON.parse(Buffer.from(body, "base64url").toString())
  if (t.k !== kind || t.e < Date.now()) bad("Phiên xác thực đã hết hạn, thử lại")
  return t as { c: string; u: string }
}

// Kiểm phần chung của mọi phản hồi WebAuthn: đúng loại, đúng mã thử thách, đúng trang, đã xác minh người dùng
async function checkCommon(b: any, type: string, challenge: string, origin: string, rpId: string) {
  const cdRaw = un64(b.clientDataJSON)
  let cd: any
  try {
    cd = JSON.parse(Buffer.from(cdRaw).toString("utf8"))
  } catch {
    bad("Dữ liệu xác thực hỏng")
  }
  if (cd.type !== type || cd.challenge !== challenge || cd.origin !== origin) bad("Xác thực không khớp với trang này")
  const ad = un64(b.authenticatorData)
  if (ad.length < 37 || !same(ad.subarray(0, 32), await sha256(Buffer.from(rpId)))) bad("Xác thực không dành cho app này")
  if ((ad[32] & 0x05) !== 0x05) bad("Máy chưa xác minh khuôn mặt/vân tay")
  return { cdRaw, ad }
}

// Chữ ký ES256 từ máy ở dạng DER → WebCrypto cần dạng r||s (64 byte)
export function derToRaw(der: Uint8Array) {
  let p = 2
  if (der[0] !== 0x30) bad("Chữ ký sai định dạng")
  if (der[1] & 0x80) p += der[1] & 0x7f
  const out = new Uint8Array(64)
  for (const off of [0, 32]) {
    if (der[p] !== 0x02) bad("Chữ ký sai định dạng")
    const len = der[p + 1]
    let v = der.subarray(p + 2, p + 2 + len)
    while (v.length > 32 && v[0] === 0) v = v.subarray(1)
    if (v.length > 32) bad("Chữ ký sai định dạng")
    out.set(v, off + 32 - v.length)
    p += 2 + len
  }
  return out
}
const importKey = (spki: Uint8Array, alg: number) => crypto.subtle.importKey("spki", spki, ALGS[alg].imp, false, ["verify"])

export async function register(s: Session, b: any, origin: string, rpId: string): Promise<Passkey> {
  const t = readToken(b.token, "reg")
  if (t.u !== s.uid) bad("Phiên xác thực không hợp lệ, thử lại")
  const { ad } = await checkCommon(b, "webauthn.create", t.c, origin, rpId)
  const id = String(b.id ?? "")
  const alg = Number(b.alg)
  if (!/^[\w-]{16,1400}$/.test(id) || !ALGS[alg]) bad("Máy này chưa hỗ trợ kiểu khoá cần dùng")
  // authenticatorData khi đăng ký: … aaguid(16) | độ dài mã khoá(2) | mã khoá — phải trùng mã khoá gửi lên
  const n = (ad[53] << 8) | ad[54]
  if (!(ad[32] & 0x40) || !same(ad.subarray(55, 55 + n), un64(id))) bad("Mã khoá không khớp")
  await importKey(un64(b.publicKey), alg).catch(() => bad("Khoá công khai không hợp lệ"))
  const all = await loadPasskeys()
  if (all.some((k) => k.id === id)) bad("Máy này đã bật rồi")
  if (all.filter((k) => k.uid === s.uid).length >= MAX_PER_USER) bad(`Mỗi tài khoản tối đa ${MAX_PER_USER} máy — gỡ bớt máy cũ trước`)
  const pk: Passkey = { id, uid: s.uid, spki: b64u(un64(b.publicKey)), alg, label: String(b.label || "Thiết bị").trim().slice(0, 40) || "Thiết bị", at: Date.now(), last: 0 }
  await setJSON(KEY, [...all, pk])
  return pk
}

export async function authenticate(b: any, origin: string, rpId: string, ip: string): Promise<{ user: User; pk: Passkey }> {
  const kFail = `wa-fail-${ip}`
  if ((await peek(kFail, FAIL_WIN)).n >= 10) bad("Thử sai quá nhiều lần, dùng mã PIN hoặc thử lại sau 15 phút")
  try {
    const t = readToken(b.token, "auth")
    const { cdRaw, ad } = await checkCommon(b, "webauthn.get", t.c, origin, rpId)
    const all = await loadPasskeys()
    const pk = all.find((k) => k.id === String(b.id ?? "")) ?? bad("Máy này chưa bật Face ID cho app — đăng nhập bằng PIN rồi bật lại trong Cài đặt")
    const data = new Uint8Array(ad.length + 32)
    data.set(ad)
    data.set(await sha256(cdRaw), ad.length)
    const sig = pk.alg === -7 ? derToRaw(un64(b.signature)) : un64(b.signature)
    if (!(await crypto.subtle.verify(ALGS[pk.alg].ver, await importKey(un64(pk.spki), pk.alg), sig, data))) bad("Chữ ký không hợp lệ")
    // Mỗi mã thử thách chỉ dùng 1 lần (chống phát lại)
    if ((await bump(`wa-used-${t.c}`, TTL)).n > 1) bad("Phiên xác thực đã dùng rồi, thử lại")
    const user = (await loadUsers()).find((u) => u.id === pk.uid) ?? bad("Tài khoản không còn tồn tại")
    pk.last = Date.now()
    await setJSON(KEY, all)
    return { user, pk }
  } catch (e) {
    if (e instanceof WaError) await bump(kFail, FAIL_WIN)
    throw e
  }
}

// Gỡ 1 máy: chủ tài khoản gỡ máy của mình, Quản trị gỡ được mọi máy
export async function removePasskey(s: Session, id: string): Promise<Passkey> {
  const all = await loadPasskeys()
  const pk = all.find((k) => k.id === id && (k.uid === s.uid || s.role === "admin")) ?? bad("Không tìm thấy máy này")
  await setJSON(KEY, all.filter((k) => k !== pk))
  return pk
}

/* ---------- API /api/webauthn/* (gọi từ api.mts) ---------- */
type Ctx = { path: string; m: string; body: any; req: Request; url: URL; json: (d: any, status?: number, h?: Record<string, string>) => Response }
export async function waRoutes({ path, m, body, req, url, json }: Ctx): Promise<Response | null> {
  const ip = req.headers.get("cf-connecting-ip") ?? "?"
  const dev = (req.headers.get("user-agent") ?? "").slice(0, 120)
  const rpId = url.hostname
  try {
    // ----- công khai: mở khoá -----
    if (path === "/webauthn/login/options" && m === "POST") return json({ ...newChallenge("auth"), rpId })
    if (path === "/webauthn/login" && m === "POST") {
      try {
        const { user, pk } = await authenticate(body, url.origin, rpId, ip)
        await addLog([{ t: Date.now(), ok: true, by: user.name, role: user.role, ip, dev, text: `${user.name} đăng nhập bằng Face ID/vân tay (${pk.label})` }])
        return json({ ok: true, me: { uid: user.id, name: user.name, role: user.role } }, 200, { "Set-Cookie": setCookie(makeToken(user), user.role) })
      } catch (e: any) {
        if (!(e instanceof WaError)) throw e
        await addLog([{ t: Date.now(), ok: false, by: "Đăng nhập", role: "system", ip, dev, text: `Mở khoá bằng Face ID/vân tay thất bại: ${e.message} (IP ${ip})` }])
        return json({ error: e.message }, 401)
      }
    }
    // ----- cần đăng nhập: bật / xem / gỡ máy -----
    const s = await readSession(req)
    if (!s) return json({ error: "Cần đăng nhập" }, 401)
    if (path === "/webauthn/register/options" && m === "POST") {
      const mine = (await loadPasskeys()).filter((k) => k.uid === s.uid).map((k) => k.id)
      return json({ ...newChallenge("reg", s.uid), rp: { id: rpId, name: "WiFi Nhà" }, user: { id: b64u(Buffer.from(s.uid)), name: s.name }, exclude: mine })
    }
    if (path === "/webauthn/register" && m === "POST") {
      const pk = await register(s, body, url.origin, rpId)
      await addLog([{ t: Date.now(), ok: true, by: s.name, role: s.role, ip, dev, text: `${s.name} bật mở khoá bằng Face ID/vân tay trên "${pk.label}"` }])
      return json({ ok: true })
    }
    if (path === "/webauthn/list" && m === "GET") {
      const names = new Map((await loadUsers()).map((u) => [u.id, u.name]))
      const list = (await loadPasskeys()).filter((k) => k.uid === s.uid || s.role === "admin")
      return json({ keys: list.map((k) => ({ id: k.id, label: k.label, at: k.at, last: k.last, uid: k.uid, owner: names.get(k.uid) ?? k.uid })) })
    }
    if (path === "/webauthn/remove" && m === "POST") {
      const pk = await removePasskey(s, String(body.id ?? ""))
      await addLog([{ t: Date.now(), ok: true, by: s.name, role: s.role, ip, dev, text: `${s.name} gỡ mở khoá Face ID/vân tay của máy "${pk.label}"` }])
      return json({ ok: true })
    }
    return null
  } catch (e: any) {
    if (e instanceof WaError) return json({ error: e.message }, 400)
    throw e
  }
}
