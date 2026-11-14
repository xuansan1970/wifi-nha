// Ruijie Cloud client — dùng đúng các API mà web cloud-as.ruijienetworks.com đang gọi.
import { constants, publicEncrypt } from "node:crypto"
import { store } from "./store.mts"

const BASE = "https://cloud-as.ruijienetworks.com"
const SERVICE = `${BASE}/webproxy/sso/back?rewrite=off&back=${encodeURIComponent(BASE + "/macc5/adminIntl/#/theme-gateway")}`
const LOGIN_URL = `${BASE}/sso/login?service=${encodeURIComponent(SERVICE)}`
// Public key RSA lấy từ trang đăng nhập Ruijie (init.intl.js)
const PUB =
  "MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKjeUvf/EGSrhYUApZlJRYYsYIkWQu5tcPc8bkWVqnlAFrJlVWmvgD5zd9Sevi7qNIl9+1NvNlFcqiUGgsevCNMCAwEAAQ=="
const PEM = `-----BEGIN PUBLIC KEY-----\n${PUB.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----\n`
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"

export class RuijieError extends Error {
  constructor(msg: string, public code?: number | string) {
    super(msg)
  }
}

type Jar = Record<string, string>

function rsa(pw: string) {
  return publicEncrypt({ key: PEM, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(pw, "utf8")).toString("base64")
}

function absorb(jar: Jar, res: Response) {
  const list: string[] = (res.headers as any).getSetCookie?.() ?? []
  for (const c of list) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    if (i <= 0) continue
    const k = pair.slice(0, i).trim()
    const v = pair.slice(i + 1).trim()
    if (!v || /expires=thu, 01 jan 1970/i.test(c) || /max-age=0\b/i.test(c)) delete jar[k]
    else jar[k] = v
  }
}
const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")

function inputValue(html: string, name: string) {
  const tag = html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*>`, "i"))?.[0]
  if (!tag) return null
  return tag.match(/value=["']([^"']*)["']/i)?.[1] ?? ""
}

async function req(jar: Jar, url: string, init: RequestInit = {}, tries = 2): Promise<Response> {
  try {
    return await req1(jar, url, init)
  } catch (e) {
    if (tries <= 1) throw new RuijieError("Không kết nối được Ruijie Cloud (mạng chập chờn), thử lại sau", "NET")
    await new Promise((r) => setTimeout(r, 500))
    return req(jar, url, init, tries - 1)
  }
}

async function req1(jar: Jar, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("User-Agent", UA)
  headers.set("Accept-Language", "en-US,en;q=0.9")
  const ck = cookieHeader(jar)
  if (ck) headers.set("Cookie", ck)
  const res = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(12000) })
  absorb(jar, res)
  return res
}

async function login(): Promise<Jar> {
  const user = Netlify.env.get("RUIJIE_USER")
  const pass = Netlify.env.get("RUIJIE_PASS")
  if (!user || !pass) throw new RuijieError("Chưa cài RUIJIE_USER / RUIJIE_PASS trong Netlify", "NO_CREDS")
  const jar: Jar = {}

  const page = await req(jar, LOGIN_URL)
  const html = await page.text()
  const lt = inputValue(html, "lt")
  const execution = inputValue(html, "execution")
  const sign = inputValue(html, "sign") ?? ""
  if (!lt || !execution) throw new RuijieError("Không đọc được form đăng nhập Ruijie (trang đã đổi?)", "LOGIN_FORM")

  const enc = rsa(pass)
  // Bước kiểm tra mật khẩu + lấy vùng cloud (giống web)
  let area = ""
  const v = await req(jar, `${BASE}/sso/validate/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ account: user, password: enc }),
  })
  if (v.ok) {
    const j: any = await v.json().catch(() => null)
    if (j && j.code !== 0) throw new RuijieError(`Ruijie từ chối đăng nhập: ${j.msg || j.code}`, "BAD_CREDS")
    if (j?.isOpen2FA) throw new RuijieError("Tài khoản đang bật 2FA — app chưa hỗ trợ", "2FA")
    area = j?.area ?? ""
  }

  const form = new URLSearchParams({
    username: user,
    password: enc,
    lt,
    execution,
    sign,
    action: "",
    _eventId: "submit",
    timeZone: "GMT+07:00",
    selectedCloud: area,
    googleTotpCode: "",
    disposableCode: "",
  })
  const submit = inputValue(html, "submit")
  if (submit !== null) form.set("submit", submit)

  let res = await req(jar, LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: LOGIN_URL, Origin: BASE },
    body: form.toString(),
  })
  // Theo chuỗi redirect CAS -> webproxy/sso/back?ticket=... -> macc5
  for (let hop = 0; hop < 8; hop++) {
    const loc = res.headers.get("location")
    if (!loc || res.status < 300 || res.status >= 400) break
    const next = new URL(loc, BASE).toString()
    if (!next.startsWith(BASE)) break
    if (next.includes("/macc5/")) break
    res = await req(jar, next)
  }
  if (!jar["LT_SESSION"]) throw new RuijieError("Đăng nhập Ruijie không thành công (không nhận được phiên)", "NO_SESSION")
  return jar
}


let sessionAt = 0
async function getSession(force = false): Promise<Jar> {
  if (!force) {
    const s: any = await store().get("session", { type: "json" })
    if (s?.jar?.LT_SESSION && Date.now() - s.at < 6 * 3600_000) {
      sessionAt = s.at
      return s.jar
    }
  }
  const jar = await login()
  sessionAt = Date.now()
  await store().setJSON("session", { jar, at: sessionAt })
  return jar
}

const AUTH_RE = /login|logout|session|expire|token|unauthor|not\s*log|re-?log|登录|过期/i

export type CallOpts = { params?: any; querys?: Record<string, any>; module?: string }

export async function call(api: string, method: string, opts: CallOpts = {}): Promise<any> {
  const doCall = async (jar: Jar) => {
    const body: any = {
      api,
      method,
      module: opts.module ?? "default",
      querys: { ...(opts.querys ?? {}), lang: "en", cloudType: "smb" },
      authParams: { api, method },
    }
    if (opts.params !== undefined) body.params = opts.params
    const res = await req(jar, `${BASE}/webproxy/common/api?${api.split("?")[0]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE, Referer: `${BASE}/macc5/adminIntl/` },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { res, json }
  }

  let jar = await getSession()
  const before = JSON.stringify(jar)
  let { res, json } = await doCall(jar)
  const needLogin =
    res.status === 401 ||
    res.status === 403 ||
    (res.status >= 300 && res.status < 400) ||
    !json ||
    (json.code !== 0 && json.code !== undefined && AUTH_RE.test(String(json.msg ?? "")))
  if (needLogin) {
    jar = await getSession(true)
    ;({ res, json } = await doCall(jar))
  } else if (JSON.stringify(jar) !== before && jar.LT_SESSION) {
    // giữ cookie mới (SERVERID…) nếu server có cấp lại
    await store().setJSON("session", { jar, at: sessionAt })
  }
  if (!json) throw new RuijieError(`Ruijie trả về lỗi HTTP ${res.status}`, res.status)
  if (json.code !== 0) throw new RuijieError(json.msg || `Ruijie lỗi ${json.code}`, json.code)
  return json
}

// ---------- Helpers nghiệp vụ ----------
export const macColon = (m: string) =>
  m.replace(/[^0-9a-f]/gi, "").toUpperCase().match(/.{2}/g)!.join(":")
export const macDot = (m: string) =>
  m.replace(/[^0-9a-f]/gi, "").toLowerCase().match(/.{4}/g)!.join(".")
export const macKey = (m: string) => m.replace(/[^0-9a-f]/gi, "").toLowerCase()

let projCache: { at: number; v: any[] } | null = null
export async function listProjects() {
  if (projCache && Date.now() - projCache.at < 300_000) return projCache.v
  const v = await listProjectsRaw()
  projCache = { at: Date.now(), v }
  return v
}
async function listProjectsRaw() {
  const j = await call("/maint/network/common/list?page_index=1&page_size=999&version=1&include_fitap=true", "GET")
  return (j.dataList ?? []).map((d: any) => ({
    gid: d.buildingId as number,
    name: d.name as string,
    online: d.onCount ?? 0,
    total: d.totalCount ?? 0,
    conflict: d.enetConflictState === "CONFLICT",
  }))
}

export async function listDevices(gid: number) {
  const j = await call("/maint/devices/list?page=1&per_page=20", "POST", { params: { groupId: gid, commonType: "" } })
  return (j.deviceList ?? []).map((d: any) => ({
    sn: d.serialNumber,
    model: d.productClass,
    name: d.aliasName || d.name,
    online: d.onlineStatus === "ON",
    localIp: d.localIp,
    wanIp: d.cpeIp,
    lastOnline: d.lastOnline,
    firmware: String(d.softwareVersion || "").split(";")[0],
    newFirmware: d.recommendSoftwareVersion && d.recommendSoftwareVersion !== d.softwareVersion ? String(d.recommendSoftwareVersion).split(";")[0] : null,
    staNums: d.staNums ?? 0,
  }))
}

export async function listClients(gid: number) {
  const list = await clientsRaw(gid)
  return list.map((c: any) => ({
    mac: macKey(c.mac),
    alias: c.alias || "",
    rawName: c.userName || c.hostName || "",
    label: c.staLabel || "",
    labelName: c.staLabelName || "",
    os: c.staOs || "",
    ip: c.ip || "",
    band: c.band || "",
    ssid: c.ssid || "",
    rssi: c.rssi ?? null,
    wired: c.connectType !== "wireless",
    traffic: c.flowUpDown ?? 0,
    since: c.onlineTime ?? null,
    down: c.downlinkRate ?? 0,
    up: c.uplinkRate ?? 0,
    sn: c.linkedDevice || "",
  }))
}

export async function listBlocked(gid: number) {
  const j = await call(`/homescene/mac_filter/${gid}`, "GET")
  return (j.list ?? []).map((x: any) => macKey(x.mac))
}

export async function blockMac(gid: number, mac: string) {
  const cur = await call(`/enet/conf/group/${gid}/mac_filter`, "GET")
  if (cur.info?.type && cur.info.type !== "deny")
    throw new RuijieError("Router này đang ở chế độ whitelist, không chặn kiểu blacklist được")
  if ((cur.info?.macList ?? []).some((m: any) => macKey(m.mac) === macKey(mac))) return
  await call(`/enet/conf/group/${gid}/mac_filter`, "POST", { params: { type: "deny", macList: [{ mac: macColon(mac) }] } })
}

export async function unblockMac(gid: number, mac: string) {
  const list = await listBlocked(gid)
  if (!list.includes(macKey(mac))) return
  await call(`/enet/conf/group/${gid}/mac_filter`, "DELETE", {
    querys: { group_id: gid, mac: macDot(mac), type: "global" },
  })
}

export async function reboot(sns: string[]) {
  await call("/maint/device/reboot", "POST", { params: { snList: sns } })
}

const tidCache = new Map<number, number>()
export async function templateId(gid: number): Promise<number> {
  if (tidCache.has(gid)) return tidCache.get(gid)!
  const j = await call(`/conf/group/${gid}/templates`, "GET")
  const id = j.tempList?.[0]?.id
  if (!id) throw new RuijieError("Không tìm thấy cấu hình WiFi của router")
  tidCache.set(gid, id)
  return id
}

export async function listSsids(gid: number, tid?: number) {
  tid = tid ?? (await templateId(gid))
  const j = await call("/conf/wifi_grp/wifi", "GET", { querys: { group_id: gid, conf_template_id: tid } })
  // Chỉ lấy thông tin hiển thị — KHÔNG trả mật khẩu WiFi ra ngoài
  return (j.data?.ssidList ?? []).map((s: any) => ({
    id: s.id as number,
    name: s.ssidName as string,
    enable: String(s.enable) === "true",
    hidden: String(s.ishidden) === "true",
    bands: String(s.relatedRadio || "")
      .split(",")
      .map((r: string) => (r === "1" ? "2.4G" : r === "2" ? "5G" : r === "3" ? "6G" : r))
      .filter(Boolean),
  }))
}

export async function setSsids(gid: number, ssidIds: number[], enable: boolean) {
  if (!ssidIds.length) return
  const tid = await templateId(gid)
  await call(`/conf/template/${tid}/ssid/enable`, "PUT", { params: { enable, ssidIdList: ssidIds, uid: [], groupId: gid } })
}

export async function routerOverview(gid: number) {
  const settle = async <T,>(p: Promise<T>, fb: T) => {
    try {
      return { v: await p, e: null as string | null }
    } catch (e: any) {
      return { v: fb, e: e.message as string }
    }
  }
  const [dev, cli, blk, ssid] = await Promise.all([
    settle(listDevices(gid), []),
    settle(listClients(gid), []),
    settle(listBlocked(gid), []),
    settle(listSsids(gid), []),
  ])
  return {
    devices: dev.v,
    clients: cli.v,
    blocked: blk.v,
    ssids: ssid.v,
    errors: [dev.e, cli.e, blk.e, ssid.e].filter(Boolean),
  }
}

// ---------- Mở rộng: quản lý WiFi + tên thiết bị + dữ liệu đầy đủ ----------
const SECRET_KEY = /pass|pwd|psk|secret|key|token/i
export function sanitize<T>(o: T): T {
  return JSON.parse(JSON.stringify(o ?? null), (k, v) => (k && SECRET_KEY.test(k) ? undefined : v))
}

export async function wifiFull(gid: number) {
  const tid = await templateId(gid)
  const j = await call("/conf/wifi_grp/wifi", "GET", { querys: { group_id: gid, conf_template_id: tid } })
  return { tid, data: sanitize(j.data ?? {}) }
}

export async function createSsid(
  gid: number,
  o: { name: string; password?: string; bands: string[]; hidden: boolean; isolation?: boolean },
) {
  const tid = await templateId(gid)
  const open = !o.password
  const radio = o.bands.map((b) => (b === "5G" ? "2" : b === "6G" ? "3" : "1")).sort().join(",") || "1,2"
  const entity: any = {
    wirelessModeType: "auto",
    authEntity: {},
    serverGrpId: "",
    ishidden: !!o.hidden,
    ssidEncode: "utf-8",
    fowardType: "bridge",
    vlanType: "1",
    vlanId: "1",
    encryptionMode: open ? "open" : "wpa_wpa2-psk",
    relatedRadio: radio,
    isApartment: false,
    bandSelectEnable: radio === "1,2",
    beMode: true,
    axMode: true,
    qosEnable: false,
    wlanQosEnable: false,
    authEnable: false,
    ppskEnable: false,
    ftEnable: 0,
    preset: "0",
    mlo: 0,
    l2iso: !!o.isolation,
    ssidName: o.name,
    encryptionType: open ? "open" : "wpa",
    isGuest: false,
    effectRange: 0,
    enable: "true",
    upRate: "",
    downRate: "",
    wlanUpRate: "",
    wlanDownRate: "",
    xpressEnable: "false",
    vAuth: 0,
    encryptionModeDesc: open ? "No encryption" : "Encrypt",
    wm: 0,
  }
  if (!open) entity.password = o.password
  await call("/conf/template/ssid", "POST", {
    params: { confTemplateId: tid, groupId: gid, wifiGrpSsid: false, wirelessConfEntity: entity },
  })
}

export async function deleteSsid(gid: number, ssidId: number) {
  const tid = await templateId(gid)
  await call("/conf/template/ssid", "DELETE", { querys: { conf_template_id: tid, ssid_id: ssidId } })
}

export async function renameClient(gid: number, mac: string, alias: string, staLabel = "") {
  await call(`/enet/terminal-remark?group_id=${gid}`, "POST", { params: { mac: macDot(mac), alias, staLabel } })
}

export async function clientsRaw(gid: number) {
  const j = await call("/network/current/user/global/page", "GET", {
    module: "logbiz",
    querys: { group_id: gid, page_index: 1, page_size: 200, keyword: "", connect_type: "", authMac: false, sta_label: "" },
  })
  return j.list ?? []
}

// ---------- Sửa chi tiết 1 WiFi (giống form "Edit Wi-Fi" của Ruijie) ----------
export async function ssidRaw(gid: number, ssidId: number) {
  const tid = await templateId(gid)
  const j = await call("/conf/wifi_grp/wifi", "GET", { querys: { group_id: gid, conf_template_id: tid } })
  const raw = (j.data?.ssidList ?? []).find((s: any) => Number(s.id) === Number(ssidId))
  if (!raw) throw new RuijieError("Không tìm thấy WiFi này (có thể vừa bị xoá)")
  return { tid, raw }
}

export type SsidPatch = {
  name?: string
  password?: string
  bands?: string[]
  hidden?: boolean
  isolation?: boolean
  bandSteering?: boolean
  fastRoaming?: boolean
  gaming?: boolean
  standard?: string
  usersLimit?: number
  upRate?: string
  downRate?: string
  wlanUpRate?: string
  wlanDownRate?: string
}

export async function updateSsid(gid: number, ssidId: number, p: SsidPatch) {
  const { tid, raw } = await ssidRaw(gid, ssidId)
  const e: any = { ...raw }
  delete e.encryptionModeDesc
  if (p.name !== undefined) e.ssidName = p.name
  if (p.password !== undefined && p.password !== "") e.password = p.password
  if (p.bands) e.relatedRadio = p.bands.map((b) => (b === "5G" ? "2" : b === "6G" ? "3" : "1")).sort().join(",")
  if (p.hidden !== undefined) e.ishidden = p.hidden
  if (p.isolation !== undefined) e.isGuest = p.isolation
  if (p.bandSteering !== undefined) e.bandSelectEnable = p.bandSteering
  if (p.fastRoaming !== undefined) e.ftEnable = p.fastRoaming ? 1 : 0
  if (p.gaming !== undefined) e.xpressEnable = p.gaming ? "true" : "false"
  // Form gốc của Ruijie gửi "auto" cho WiFi đang lưu "wifi6" — làm y hệt để không đổi chuẩn ngoài ý muốn
  if (e.wirelessModeType === "wifi6") e.wirelessModeType = "auto"
  if (p.usersLimit !== undefined) e.usersLimit = p.usersLimit
  for (const k of ["upRate", "downRate", "wlanUpRate", "wlanDownRate"] as const) if (p[k] !== undefined) e[k] = p[k]
  for (const k of ["upRate", "downRate", "wlanUpRate", "wlanDownRate"]) if (e[k] === undefined) e[k] = ""
  e.encryptionType = String(e.encryptionMode || "").startsWith("wpa") ? "wpa" : e.encryptionType ?? "open"
  e.effectRange = e.effectRange ?? 0
  e.serverGrpId = e.serverGrpId ?? ""
  await call("/conf/template/ssid", "POST", {
    params: { confTemplateId: tid, ssidId: Number(ssidId), groupId: gid, wifiGrpSsid: false, wirelessConfEntity: e },
  })
}

// Bảng giờ phát WiFi tích hợp của router (tmngt) → dạng dễ đọc
export function parseTmngt(t: any) {
  if (!t?.text) return null
  try {
    const o = JSON.parse(t.text)
    return { mode: t.tmmode, days: o }
  } catch {
    return null
  }
}

// ---------- eWeb: trang quản trị gốc trong router, mở qua tunnel của Ruijie (tự đăng nhập) ----------
export async function openEweb(sn: string, hours: number): Promise<{ url: string; tunnelId: number }> {
  const op = "device_list_eweb"
  const r = await call("/tunnel/web/get_url?client_source=web3", "POST", {
    params: { adminProtocol: "HTTPS", sn, isDirectCreate: false, remoteHost: "127.0.0.1", operation_source: op, vaildTime: hours, autoLogin: true },
  })
  const d = r.data ?? {}
  if (typeof d.useUrl === "string" && d.useUrl) return { url: d.useUrl, tunnelId: d.tunnelId ?? 0 }
  if (Array.isArray(d.useUrl) && d.useUrl[0]) return { url: d.useUrl[0], tunnelId: d.tunnelId ?? 0 }
  const tunnelId = Number(d.tunnelId)
  if (!tunnelId) throw new RuijieError("Ruijie không tạo được tunnel eWeb")
  for (let i = 0; i < 16; i++) {
    await new Promise((res) => setTimeout(res, 1500))
    const t = await call("/tunnel/web/get_tunnel", "POST", { params: { sn, tunnelId, operation_source: op, autoLogin: true } })
    const x = t.data ?? {}
    if (x.status === "ESTABLISHED" && (x.useUrl || x.domainUrl || x.ipUrl)) return { url: x.useUrl || x.domainUrl || x.ipUrl, tunnelId }
    if (x.status === "CLOSED") throw new RuijieError("Tunnel eWeb bị đóng — router có thể đang offline")
  }
  throw new RuijieError("Tunnel eWeb chưa sẵn sàng, thử lại sau ít giây")
}
export async function closeEweb(sn: string, tunnelId: number) {
  await call("/tunnel/destroy", "POST", { params: { sn, tunnelId } })
}
