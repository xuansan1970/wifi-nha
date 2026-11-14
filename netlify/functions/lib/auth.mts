import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { getJSON, setJSON } from "./store.mts"

export type Role = "admin" | "parent"
export type User = { id: string; name: string; role: Role; salt: string; hash: string }
export type Session = { uid: string; role: Role; name: string }

const COOKIE = "wn_s"
const TTL: Record<Role, number> = { admin: 60 * 86400_000, parent: 30 * 86400_000 }

function secret() {
  const s = Netlify.env.get("APP_SECRET")
  if (!s || s.length < 16) throw new Error("Thiếu APP_SECRET")
  return s
}
const hmac = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url")
const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("base64url")

// Khởi tạo tài khoản lần đầu từ biến APP_USERS: "id:Tên:role:PIN;..."
export async function loadUsers(): Promise<User[]> {
  const cur = await getJSON<User[] | null>("users", null)
  if (cur?.length) return cur
  const seed = Netlify.env.get("APP_USERS") || ""
  const users: User[] = seed
    .split(";")
    .map((x) => x.split(":"))
    .filter((p) => p.length === 4 && p[0] && p[3])
    .map(([id, name, role, pin]) => {
      const salt = randomBytes(12).toString("base64url")
      return { id, name, role: role === "admin" ? "admin" : "parent", salt, hash: hashPin(pin, salt) }
    })
  if (!users.some((u) => u.role === "admin")) throw new Error("Chưa cấu hình APP_USERS")
  await setJSON("users", users)
  return users
}
export const publicUsers = async () => (await loadUsers()).map(({ id, name, role }) => ({ id, name, role }))

export async function setPin(uid: string, pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN phải gồm 4–8 chữ số")
  const users = await loadUsers()
  const u = users.find((x) => x.id === uid)
  if (!u) throw new Error("Không có tài khoản này")
  u.salt = randomBytes(12).toString("base64url")
  u.hash = hashPin(pin, u.salt)
  await setJSON("users", users)
}

export function makeToken(u: { id: string; role: Role }) {
  const exp = Date.now() + TTL[u.role]
  const body = `${u.id}.${u.role}.${exp}`
  return `${body}.${hmac(body)}`
}
export async function readSession(req: Request): Promise<Session | null> {
  const c = req.headers.get("cookie") ?? ""
  const tok = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]
  if (!tok) return null
  const parts = tok.split(".")
  if (parts.length !== 4) return null
  const [uid, role, exp, sig] = parts
  const a = Buffer.from(sig)
  const b = Buffer.from(hmac(`${uid}.${role}.${exp}`))
  if (a.length !== b.length || !timingSafeEqual(a, b) || Number(exp) < Date.now()) return null
  const u = (await loadUsers()).find((x) => x.id === uid)
  if (!u || u.role !== role) return null
  return { uid, role: u.role, name: u.name }
}
export const setCookie = (tok: string, role: Role) =>
  `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL[role] / 1000}`
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

// Chống dò PIN theo từng tài khoản: sai 5 lần → khoá 15 phút
export async function login(uid: string, pin: string): Promise<{ user?: User; error?: string }> {
  const users = await loadUsers()
  const u = users.find((x) => x.id === uid)
  if (!u) return { error: "Chọn tài khoản" }
  const key = `pinfail-${uid}`
  const f = await getJSON<{ n: number; until: number }>(key, { n: 0, until: 0 })
  if (f.until > Date.now()) return { error: `Sai quá nhiều lần, thử lại sau ${Math.ceil((f.until - Date.now()) / 60000)} phút` }
  const a = Buffer.from(hashPin(String(pin), u.salt))
  const b = Buffer.from(u.hash)
  if (a.length === b.length && timingSafeEqual(a, b)) {
    if (f.n) await setJSON(key, { n: 0, until: 0 })
    return { user: u }
  }
  const n = f.n + 1
  await setJSON(key, n >= 5 ? { n: 0, until: Date.now() + 15 * 60000 } : { n, until: 0 })
  return { error: n >= 5 ? "Sai 5 lần — khoá 15 phút" : `Sai mã PIN (còn ${5 - n} lần thử)` }
}
