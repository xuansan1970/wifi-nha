import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { bump, clearCount, envGet, getJSON, peek, setJSON } from "./store.mts"
import { raise } from "./notify.mts"

export type Role = "admin" | "parent"
export type User = { id: string; name: string; role: Role; salt: string; hash: string }
export type Session = { uid: string; role: Role; name: string }

const COOKIE = "wn_sess"
// Phiên tự hết sau 15 phút không thao tác (mọi tài khoản). api.mts gia hạn lại mỗi khi người dùng còn thao tác.
export const IDLE_MS = 15 * 60000
const TTL: Record<Role, number> = { admin: IDLE_MS, parent: IDLE_MS }

function secret() {
  const s = envGet("APP_SECRET")
  if (!s || s.length < 16) throw new Error("Thiếu APP_SECRET")
  return s
}
const hmac = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url")
const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("base64url")

// Khởi tạo tài khoản lần đầu từ biến APP_USERS: "id:Tên:role:PIN;..."
export async function loadUsers(): Promise<User[]> {
  const cur = await getJSON<User[] | null>("users", null)
  if (cur?.length) {
    // Quyền (role) luôn lấy theo APP_USERS để đổi quyền chỉ cần sửa biến môi trường; PIN giữ nguyên
    const roles = new Map(
      (envGet("APP_USERS") || "").split(";").map((x) => x.split(":")).filter((p) => p.length === 4).map((p) => [p[0], p[2]]),
    )
    let changed = false
    for (const u of cur) {
      const r = roles.get(u.id) === "admin" ? "admin" : roles.has(u.id) ? "parent" : u.role
      if (r !== u.role) {
        u.role = r
        changed = true
      }
    }
    if (changed) await setJSON("users", cur)
    return cur
  }
  const seed = envGet("APP_USERS") || ""
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
// Ô đăng nhập: admin hiện riêng; mọi tài khoản phụ huynh gộp thành 1 ô "Ba Mẹ" (PIN cho biết là ai)
export const PARENT_GROUP = "bame"
export const publicUsers = async () => {
  const us = await loadUsers()
  const out = us.filter((u) => u.role === "admin").map(({ id, name, role }) => ({ id, name, role }))
  if (us.some((u) => u.role === "parent")) out.push({ id: PARENT_GROUP, name: "Ba Mẹ", role: "parent" })
  return out
}
export const allUsers = async () => (await loadUsers()).map(({ id, name, role }) => ({ id, name, role }))

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
  // Phiên kiểu cũ (sống 30–60 ngày, cấp trước khi có luật 15 phút) không còn giá trị → đăng nhập lại 1 lần
  if (Number(exp) > Date.now() + IDLE_MS + 60000) return null
  const u = (await loadUsers()).find((x) => x.id === uid)
  if (!u || u.role !== role) return null
  return { uid, role: u.role, name: u.name }
}
export const setCookie = (tok: string, role: Role) =>
  `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${TTL[role] / 1000}`
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0`

// Chống dò PIN: mỗi (tài khoản + IP) sai 5 lần → khoá 15 phút; tổng theo tài khoản sai 20 lần → khoá 15 phút + báo email
const WIN = 15 * 60000
export async function login(uid: string, pin: string, ip = "?"): Promise<{ user?: User; error?: string }> {
  const users = await loadUsers()
  const group = uid === PARENT_GROUP ? users.filter((x) => x.role === "parent") : users.filter((x) => x.id === uid)
  if (!group.length) return { error: "Chọn tài khoản" }
  const kIp = `pin-ip-${uid}-${ip}`
  const kAll = `pin-all-${uid}`
  const [ci, ca] = await Promise.all([peek(kIp, WIN), peek(kAll, WIN)])
  if (ci.n >= 5 || ca.n >= 20) {
    const left = Math.ceil((Math.max(ci.n >= 5 ? ci.start : 0, ca.n >= 20 ? ca.start : 0) + WIN - Date.now()) / 60000)
    return { error: `Sai quá nhiều lần, thử lại sau ${Math.max(1, left)} phút` }
  }
  for (const u of group) {
    const a = Buffer.from(hashPin(String(pin), u.salt))
    const b = Buffer.from(u.hash)
    if (a.length === b.length && timingSafeEqual(a, b)) {
      if (ci.n) await clearCount(kIp)
      return { user: u }
    }
  }
  const [ni, na] = await Promise.all([bump(kIp, WIN), bump(kAll, WIN)])
  if (na.n === 20)
    await raise(`pin-all-${uid}`, "Có người đang dò PIN WiFi Nhà", `Tài khoản "${uid}" bị nhập sai PIN 20 lần trong 15 phút (lần gần nhất từ IP ${ip}). Đã khoá đăng nhập tài khoản này 15 phút.`, 6 * 3600e3, true)
  return { error: ni.n >= 5 ? "Sai 5 lần — khoá 15 phút" : `Sai mã PIN (còn ${5 - ni.n} lần thử)` }
}
