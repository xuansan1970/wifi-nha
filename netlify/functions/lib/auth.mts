import { createHmac, timingSafeEqual } from "node:crypto"
import { store } from "./state.mts"

const COOKIE = "wa_s"
const TTL = 90 * 24 * 3600_000

function secret() {
  const s = Netlify.env.get("APP_SECRET")
  if (!s || s.length < 16) throw new Error("Thiếu APP_SECRET")
  return s
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url")

export function makeToken() {
  const exp = String(Date.now() + TTL)
  return `${exp}.${sign(exp)}`
}
export function checkToken(tok?: string | null) {
  if (!tok) return false
  const [exp, sig] = tok.split(".")
  if (!exp || !sig || Number(exp) < Date.now()) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(exp))
  return a.length === b.length && timingSafeEqual(a, b)
}
export function tokenFrom(req: Request) {
  const c = req.headers.get("cookie") ?? ""
  return c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? null
}
export function setCookie(tok: string) {
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL / 1000}`
}
export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

// Chống dò PIN: sai 5 lần → khoá 15 phút
export async function tryPin(pin: string): Promise<{ ok: boolean; wait?: number }> {
  const real = Netlify.env.get("APP_PIN")
  if (!real) throw new Error("Thiếu APP_PIN")
  const st = store()
  const f: any = (await st.get("pinfail", { type: "json" })) ?? { n: 0, until: 0 }
  if (f.until > Date.now()) return { ok: false, wait: Math.ceil((f.until - Date.now()) / 60000) }
  const a = Buffer.from(String(pin))
  const b = Buffer.from(real)
  const ok = a.length === b.length && timingSafeEqual(a, b)
  if (ok) {
    if (f.n) await st.setJSON("pinfail", { n: 0, until: 0 })
    return { ok: true }
  }
  const n = f.n + 1
  await st.setJSON("pinfail", n >= 5 ? { n: 0, until: Date.now() + 15 * 60000 } : { n, until: 0 })
  return { ok: false, wait: n >= 5 ? 15 : undefined }
}
