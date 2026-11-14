// Client Tuya OpenAPI (Singapore): lấy danh sách thiết bị & bật/tắt đèn, công tắc thông minh từ xa
import { createHash, createHmac } from "node:crypto"

const BASE = "https://openapi-sg.iotbing.com"

export function isTuyaConfigured() {
  return Boolean(process.env.TUYA_ACCESS_ID?.trim() && process.env.TUYA_ACCESS_KEY?.trim() && process.env.TUYA_UID?.trim())
}

function sign(method: string, path: string, body: string, token = "") {
  const id = process.env.TUYA_ACCESS_ID!.trim()
  const secret = process.env.TUYA_ACCESS_KEY!.trim()
  const t = String(Date.now())
  const contentHash = createHash("sha256").update(body).digest("hex")
  const strToSign = [method.toUpperCase(), contentHash, "", path].join("\n")
  const payload = id + token + t + strToSign
  const sig = createHmac("sha256", secret).update(payload).digest("hex").toUpperCase()
  return { t, sig, id }
}

async function tuyaReq(method: string, path: string, bodyObj?: any, token = "") {
  const body = bodyObj ? JSON.stringify(bodyObj) : ""
  const { t, sig, id } = sign(method, path, body, token)
  const headers: Record<string, string> = {
    client_id: id,
    sign: sig,
    t,
    sign_method: "HMAC-SHA256",
  }
  if (token) headers.access_token = token
  if (body) headers["Content-Type"] = "application/json"
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(10000),
  })
  const j: any = await res.json().catch(() => null)
  if (!res.ok || !j?.success) throw new Error(j?.msg || `Tuya HTTP ${res.status}`)
  return j.result
}

async function getToken(): Promise<string> {
  const res = await tuyaReq("GET", "/v1.0/token?grant_type=1")
  return res.access_token
}

export async function listTuyaDevices() {
  if (!isTuyaConfigured()) return { configured: false, devices: [] }
  const uid = process.env.TUYA_UID!.trim()
  const token = await getToken()
  const list: any[] = await tuyaReq("GET", `/v1.0/users/${uid}/devices`, undefined, token)
  return {
    configured: true,
    devices: list
      .filter((d) => ["kg", "dj", "cz", "pc", "tdq"].includes(d.category))
      .map((d) => {
        const sw = (d.status || []).find((s: any) => /^switch/.test(s.code))
        return {
          id: String(d.id),
          name: String(d.name || d.id),
          category: String(d.category),
          online: Boolean(d.online),
          on: Boolean(sw?.value),
          code: String(sw?.code || "switch_1"),
        }
      }),
  }
}

export async function toggleTuyaDevice(id: string, code: string, on: boolean) {
  const token = await getToken()
  await tuyaReq("POST", `/v1.0/iot-03/devices/${encodeURIComponent(id)}/commands`, {
    commands: [{ code, value: on }],
  }, token)
}
