import { healthStatus, pingWatchdog, saveBeat } from "./lib/health.mts"
import { raise, sendMail } from "./lib/notify.mts"
import { BACKUP_KEYS, CONFIG_FIELDS, restoreTest, runBackup, runDigest } from "./lib/backup.mts"
import type { Config } from "@netlify/functions"
import {
  cleanLimit, cleanRule as cleanNetRule, cleanTimer, saveLimits, tickLimits, unghost, endGrant, familyView, ghostSet, grant, isFamilySsid, DEFAULT_RULE_ID, loadFamily, markManual, NetRule, saveRules, saveTimers, Scene, SCENES, setNet, setScene,
} from "./lib/family.mts"
import * as R from "./lib/ruijie.mts"
import { allUsers, clearCookie, login, makeToken, publicUsers, readSession, Session, setCookie, setPin } from "./lib/auth.mts"
import { exec, Usage } from "./lib/engine.mts"
import { waRoutes } from "./lib/webauthn.mts"
import { buildSnapshot, getSnapshot, inventory } from "./lib/snapshot.mts"
import { KIND_VI } from "./lib/smart.mts"
import {
  addLog, getLog, isIotDevice, isPrivateSsid, labelOf, loadDevices, loadMeta, loadState, LogItem, mutate, Rule, saveMeta, Target, vn,
} from "./lib/state.mts"
import { getVersion, listVersions, auditList, cacheGet, cachePut, envGet, getJSON, isKvLimit, setJSON } from "./lib/store.mts"

const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  })
class Http extends Error {
  constructor(public status: number, msg: string) {
    super(msg)
  }
}
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const ALL = [0, 1, 2, 3, 4, 5, 6]
const isMac = (m: any) => typeof m === "string" && R.macKey(m).length === 12
const uid = () => crypto.randomUUID().slice(0, 8)

async function gids() {
  return (await R.listProjects()).map((p: any) => p.gid as number)
}

// Ba Mẹ được đặt lịch theo người/thiết bị (giờ nghỉ, giới hạn giờ/ngày); lịch khởi động lại router / tắt WiFi lẻ chỉ Xuân San
const PARENT_RULES = ["block", "quota"]

function needAdmin(s: Session) {
  if (s.role !== "admin") throw new Http(403, "Chức năng này chỉ dành cho Xuân San")
}

async function parseTarget(t: any): Promise<Target> {
  if (t?.kind === "person") {
    const st = await loadState()
    if (!st.people.some((p) => p.id === t.id)) throw new Http(400, "Không tìm thấy người này")
    return { kind: "person", id: String(t.id) }
  }
  if (t?.kind === "device" && isMac(t.id)) return { kind: "device", id: R.macKey(t.id) }
  throw new Http(400, "Chưa chọn thiết bị/người")
}

async function cleanRule(b: any, all: number[]): Promise<Rule> {
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d: number) => d >= 0 && d <= 6))] : []
  const base: Rule = {
    id: typeof b.id === "string" && /^[\w-]{1,20}$/.test(b.id) ? b.id : uid(),
    type: b.type,
    name: String(b.name || "").trim().slice(0, 60),
    enabled: b.enabled !== false,
    days: (days.length ? days : ALL) as number[],
  }
  const pickGids = (x: any) => {
    const v = (Array.isArray(x) ? x.map(Number) : []).filter((g: number) => all.includes(g))
    if (!v.length) throw new Http(400, "Chưa chọn router")
    return v
  }
  if (b.type === "reboot") {
    if (!HM.test(b.at)) throw new Http(400, "Giờ không hợp lệ")
    return { ...base, at: b.at, gids: pickGids(b.gids), name: base.name || `Khởi động lại lúc ${b.at}` }
  }
  if (b.type === "wifi") {
    if (!HM.test(b.offAt) || !HM.test(b.onAt) || b.offAt === b.onAt) throw new Http(400, "Giờ tắt/bật không hợp lệ")
    const targets = (Array.isArray(b.targets) ? b.targets : [])
      .map((t: any) => ({ gid: Number(t.gid), ssidIds: [...new Set((t.ssidIds || []).map(Number).filter(Boolean))] as number[] }))
      .filter((t: any) => all.includes(t.gid) && t.ssidIds.length)
    if (!targets.length) throw new Http(400, "Chưa chọn WiFi nào")
    return { ...base, offAt: b.offAt, onAt: b.onAt, targets, name: base.name || `Tắt WiFi ${b.offAt}–${b.onAt}` }
  }
  if (b.type === "block") {
    if (!HM.test(b.from) || !HM.test(b.to) || b.from === b.to) throw new Http(400, "Giờ chặn/mở không hợp lệ")
    const target = await parseTarget(b.target)
    return { ...base, from: b.from, to: b.to, target, name: base.name || `Giờ nghỉ ${b.from}–${b.to}` }
  }
  if (b.type === "quota") {
    const minutes = Math.round(Number(b.minutes))
    if (!(minutes >= 5 && minutes <= 1440)) throw new Http(400, "Số phút từ 5 đến 1440")
    const target = await parseTarget(b.target)
    return { ...base, minutes, target, name: base.name || `Tối đa ${minutes >= 60 ? `${+(minutes / 60).toFixed(1)}h` : `${minutes}′`}/ngày` }
  }
  throw new Http(400, "Loại lịch không hợp lệ")
}

// Dữ liệu gửi cho giao diện: ảnh chụp + người + chặn tạm + mức dùng hôm nay
async function view(snapMaxAge: number, s: Session) {
  const [snap, st, meta, devices, usage, fam] = await Promise.all([
    getSnapshot(snapMaxAge),
    loadState(),
    loadMeta(),
    loadDevices(),
    getJSON<Usage>("usage", { date: "", m: {}, hit: {} }),
    loadFamily(),
  ])
  const ghost = ghostSet(fam)
  const today = vn(Date.now()).date
  const blockedMacs = new Set<string>()
  snap.routers.forEach((r: any) => r.blocked.forEach((m: string) => blockedMacs.add(m)))
  const blocked = [...blockedMacs].map((mac) => {
    const d = devices[mac]
    return {
      mac,
      name: meta[mac]?.custom || d?.name || mac,
      kind: d?.kind || "unknown",
      owner: meta[mac]?.owner ?? null,
      floor: d?.floor ?? "",
      temp: st.temps.find((t) => t.macs.includes(mac)) ?? null,
    }
  })
  const known = Object.values(devices)
    .map((d) => ({
      mac: d.mac,
      name: meta[d.mac]?.custom || d.name || d.mac,
      kind: d.kind || "unknown",
      vendor: d.vendor || "",
      owner: meta[d.mac]?.owner ?? null,
      floor: d.floor || "",
      ssid: d.ssid || "",
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen)
  const parent = s.role !== "admin"
  const iotSsids = new Set<string>()
  snap.routers.forEach((r: any) => r.ssids.forEach((x: any) => !isFamilySsid(r.gid, x, ghost) && iotSsids.add(x.name)))
  const iotMac = (mac: string) => isIotDevice(devices[mac], iotSsids)
  // Ba Mẹ: giấu WiFi IoT/ẩn và mọi thiết bị IoT, không cần thông tin kỹ thuật
  const routers = parent
    ? snap.routers.map((r: any) => ({
        gid: r.gid,
        name: r.name,
        floor: r.floor,
        order: r.order,
        online: r.online,
        device: null,
        devices: [],
        blocked: r.blocked.filter((m: string) => !iotMac(m)),
        ssids: r.ssids.filter((x: any) => isFamilySsid(r.gid, x, ghost)).map((x: any) => ({ ...x, ghost: ghost.has(`${r.gid}:${x.id}`) })),
        clients: r.clients.filter((c: any) => !iotSsids.has(c.ssid) && !iotMac(c.mac)),
        errors: [],
      }))
    : snap.routers.map((r: any) => ({ ...r, ssids: r.ssids.map((x: any) => ({ ...x, private: isPrivateSsid(x), ghost: ghost.has(`${r.gid}:${x.id}`) })) }))
  let notif: any = null
  if (!parent) {
    const [log, seen] = await Promise.all([getLog(), getJSON<number>(`seen-${s.uid}`, 0)])
    const items = log.filter((l) => l.role === "parent").slice(0, 40)
    notif = { unread: items.filter((l) => l.t > seen).length, items, seen }
  }
  return {
    me: s,
    at: snap.at,
    errors: parent ? [] : snap.errors,
    routers,
    notif,
    people: st.people,
    temps: st.temps,
    rules: parent ? st.rules.filter((r) => PARENT_RULES.includes(r.type)) : st.rules,
    blocked: parent ? blocked.filter((b) => !iotMac(b.mac)) : blocked,
    known: parent ? known.filter((k) => !iotMac(k.mac)) : known,
    usage: usage.date === today ? usage.m : {},
    kinds: KIND_VI,
    net: await familyView(snap),
  }
}

// Link gateway camera: lấy bản mới hơn giữa Cache API và KV
async function camConfig(): Promise<{ gatewayUrl?: string; at?: number }> {
  const [c, k] = await Promise.all([cacheGet<any>("cam_config"), getJSON<any>("cam_config", {})])
  return c && (c.at ?? 0) >= (k?.at ?? 0) ? c : k || {}
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/"
  const m = req.method
  // Cookie SameSite=None (để chạy trong app tổng Nhà Mình) → chặn request ghi từ trang lạ
  const origin = req.headers.get("origin")
  if (m !== "GET" && origin && origin !== url.origin && origin !== "https://nha-minh.giadinhxuan.workers.dev")
    return new Response(JSON.stringify({ error: "Nguồn không hợp lệ" }), { status: 403, headers: { "content-type": "application/json" } })
  const body: any = m === "GET" || m === "DELETE" ? {} : await req.json().catch(() => ({}))

  try {
    // Chức năng xem camera đang tạm gỡ (code vẫn giữ). Bật lại: đặt biến CAM_ENABLED=1
    if (path.startsWith("/cam/") && envGet("CAM_ENABLED") !== "1") throw new Http(404, "Chức năng camera đang tạm tắt")
    // ---------- công khai ----------
    if (path === "/health") {
      if (url.searchParams.get("by") === "watchdog") await pingWatchdog()
      const h = await healthStatus()
      return json(
        { ...h, ruijie: !!(envGet("RUIJIE_USER") && envGet("RUIJIE_PASS")), users: !!envGet("APP_USERS"), secret: !!envGet("APP_SECRET") },
        h.ok ? 200 : 503,
      )
    }
    if (path === "/users" && m === "GET") return json({ users: await publicUsers() })
    if (path === "/login" && m === "POST") {
      const ip = req.headers.get("cf-connecting-ip") ?? "?"
      const r = await login(String(body.uid ?? ""), String(body.pin ?? ""), ip)
      if (!r.user) {
        await addLog([{ t: Date.now(), ok: false, by: body.uid === "bame" ? "Ba Mẹ" : "Đăng nhập", role: body.uid === "bame" ? "parent" : "admin", ip, dev: (req.headers.get("user-agent") ?? "").slice(0, 120), text: `Nhập sai PIN tài khoản ${body.uid === "bame" ? "Ba Mẹ" : String(body.uid).slice(0, 20)} (IP ${ip})` }])
        return json({ error: r.error }, 401)
      }
      await addLog([{ t: Date.now(), ok: true, by: r.user.name, role: r.user.role as any, ip, dev: (req.headers.get("user-agent") ?? "").slice(0, 120), text: `${r.user.name} đăng nhập` }])
      return json({ ok: true, me: { uid: r.user.id, name: r.user.name, role: r.user.role } }, 200, {
        "Set-Cookie": setCookie(makeToken(r.user), r.user.role),
      })
    }
    // Mở khoá bằng Face ID / vân tay (passkey): tự kiểm đăng nhập bên trong — xem lib/webauthn.mts
    if (path.startsWith("/webauthn/")) {
      const w = await waRoutes({ path, m, body, req, url, json })
      if (w) return w
    }
    if (path === "/logout") return json({ ok: true }, 200, { "Set-Cookie": clearCookie })
    // Máy chạy go2rtc tự báo link tunnel mới (trycloudflare đổi link mỗi lần khởi động) — xác thực bằng secret CAM_TOKEN
    if (path === "/cam/gateway" && m === "POST") {
      const tok = envGet("CAM_TOKEN") || ""
      if (!tok || req.headers.get("x-cam-token") !== tok) return json({ error: "Sai token" }, 401)
      const raw = String(body.gatewayUrl || "").trim().replace(/\/$/, "")
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(raw) && !/^https:\/\/[a-z0-9.-]+$/.test(raw)) return json({ error: "URL không hợp lệ" }, 400)
      const cur = await camConfig()
      const changed = cur.gatewayUrl !== raw
      const next = { gatewayUrl: raw, at: Date.now() }
      await cachePut("cam_config", next, 7 * 86400)
      if (changed) {
        await setJSON("cam_config", next).catch((e) => { if (!isKvLimit(e)) throw e })
        await addLog([{ t: Date.now(), ok: true, by: "Hệ thống", role: "system", text: `Camera Gateway tự cập nhật: ${raw}` }]).catch(() => {})
      }
      return json({ ok: true, changed })
    }

    // ---------- cần đăng nhập ----------
    const s = await readSession(req)
    if (!s) return json({ error: "Cần đăng nhập" }, 401)

    const ip = req.headers.get("cf-connecting-ip") ?? "?"
    const dev = (req.headers.get("user-agent") ?? "").slice(0, 120)
    const L = (items: LogItem[]) => addLog(items.map((i) => ({ ip, dev, ...i, role: s.role })))
    const parent = s.role !== "admin"
    if (parent && !["/me", "/view", "/refresh", "/block", "/unblock", "/wifi/toggle", "/logout", "/net/toggle", "/net/grant", "/net/grant/end", "/net/rules", "/net/scene", "/net/timer", "/net/limits", "/cam/config", "/cam/log", "/device", "/people", "/rules", "/wifi/secret", "/wifi/password"].includes(path) && !/^\/(net\/rules|net\/timer|net\/limits|people|rules)\//.test(path))
      throw new Http(403, "Chức năng này chỉ dành cho Xuân San")

    // Ba Mẹ không được đụng vào thiết bị / WiFi IoT
    const guardIot = async (target: Target) => {
      if (!parent || target.kind !== "device") return
      const [snap, devices] = await Promise.all([getSnapshot(10 * 60_000), loadDevices()])
      const iot = new Set<string>()
      const g = ghostSet(await loadFamily())
      snap.routers.forEach((r: any) => r.ssids.forEach((x: any) => !isFamilySsid(r.gid, x, g) && iot.add(x.name)))
      if (isIotDevice(devices[target.id], iot)) throw new Http(403, "Thiết bị IoT chỉ Xuân San chỉnh được")
    }

    if (path === "/me") return json({ me: s })
    if (path === "/notifs/seen" && m === "POST") {
      await setJSON(`seen-${s.uid}`, Date.now())
      return json({ ok: true })
    }
    if (path === "/eweb/open" && m === "POST") {
      if (parent) throw new Http(403, "Chỉ Xuân San dùng eWeb")
      const gid = Number(body.gid)
      const hours = Math.max(1, Math.min(24, Math.round(Number(body.hours) || 1)))
      const devs = await R.listDevices(gid)
      const d = devs[0]
      if (!d) throw new Http(400, "Không tìm thấy router")
      if (!d.online) throw new Http(400, "Router đang offline, không mở eWeb được")
      const t = await R.openEweb(d.sn, hours)
      const map = await getJSON<Record<string, any>>("eweb", {})
      map[d.sn] = { tunnelId: t.tunnelId, until: Date.now() + hours * 3600_000, gid }
      await setJSON("eweb", map)
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Mở eWeb router ${d.name} (${hours}h)` }])
      return json({ url: t.url, until: map[d.sn].until })
    }
    if (path === "/eweb/close" && m === "POST") {
      if (parent) throw new Http(403, "Chỉ Xuân San dùng eWeb")
      const gid = Number(body.gid)
      const d = (await R.listDevices(gid))[0]
      const map = await getJSON<Record<string, any>>("eweb", {})
      const cur = d && map[d.sn]
      if (cur?.tunnelId) await R.closeEweb(d.sn, cur.tunnelId).catch(() => {})
      if (d) delete map[d.sn]
      await setJSON("eweb", map)
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Đóng eWeb router ${d?.name ?? gid}` }])
      return json({ ok: true })
    }
    if (path === "/eweb/status") {
      if (parent) throw new Http(403, "Chỉ Xuân San dùng eWeb")
      const map = await getJSON<Record<string, any>>("eweb", {})
      const out: Record<string, number> = {}
      for (const v of Object.values(map)) if (v.until > Date.now()) out[v.gid] = v.until
      return json({ open: out })
    }
    // fast=1: trả dữ liệu đã lưu (≤10 phút) ngay; mặc định: làm mới nếu cũ hơn 20s
    if (path === "/view") return json(await view(url.searchParams.get("fast") ? 10 * 60_000 : 20_000, s))
    if (path === "/refresh" && m === "POST") {
      await buildSnapshot()
      return json(await view(60_000, s))
    }
    if (path === "/log") {
      needAdmin(s)
      return json({ log: await getLog() })
    }
    // Phiên bản cũ của lịch/cài đặt: xem danh sách, và quay lại 1 phiên bản (bản hiện tại cũng được lưu thành phiên bản mới → quay lại được tiếp)
    if (path === "/versions") {
      needAdmin(s)
      const key = String(url.searchParams.get("key") || "family")
      if (!BACKUP_KEYS.includes(key as any)) throw new Http(400, "key không hợp lệ")
      return json({ key, versions: await listVersions(key) })
    }
    if (path === "/restore" && m === "POST") {
      needAdmin(s)
      const v = await getVersion(Number(body.id))
      if (!v || !BACKUP_KEYS.includes(v.k as any)) throw new Http(404, "Không có phiên bản này")
      const fields = CONFIG_FIELDS[v.k]
      const cur = await getJSON<any>(v.k, {})
      await setJSON(v.k, fields ? { ...cur, ...Object.fromEntries(fields.map((f) => [f, v.value?.[f]])) } : v.value)
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Quay lại phiên bản #${body.id} của "${v.k}"` }])
      return json({ ok: true, key: v.k })
    }
    // Nhật ký chỉ-thêm, lưu vĩnh viễn (chỉ Xuân San xem). ?format=csv để tải về, ?before=<id> để lật trang
    if (path === "/audit") {
      needAdmin(s)
      const rows = await auditList(Number(url.searchParams.get("limit")) || 200, Number(url.searchParams.get("before")) || 0)
      if (url.searchParams.get("format") !== "csv") return json({ rows })
      const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
      const head = "id,thoi_gian_VN,ok,nguoi,vai_tro,noi_dung,ip,thiet_bi,truoc,sau"
      const body = rows.map((r: any) => [r.id, new Date(r.t + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 19), r.ok, q(r.by), r.role ?? "", q(r.text), r.ip ?? "", q(r.dev), q(r.before), q(r.after)].join(","))
      return new Response("\ufeff" + [head, ...body].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=wifi-nha-audit.csv" } })
    }

    // ---- Camera WebRTC (go2rtc: admin + ba mẹ đều xem được, chỉ Xuân San chỉnh gateway) ----
    if (path === "/cam/config" && m === "GET") {
      const cfg = await camConfig()
      const gatewayUrl = (cfg.gatewayUrl || envGet("CAM_GATEWAY_URL") || "").replace(/\/$/, "")
      return json({ gatewayUrl })
    }
    if (path === "/cam/config" && m === "POST") {
      needAdmin(s)
      const raw = String(body.gatewayUrl || "").trim().replace(/\/$/, "")
      if (raw && !/^https?:\/\/.+/.test(raw)) throw new Http(400, "URL gateway phải bắt đầu bằng https:// hoặc http://")
      const next = { gatewayUrl: raw, at: Date.now() }
      await cachePut("cam_config", next, 7 * 86400)
      await setJSON("cam_config", next)
      await L([{ t: Date.now(), ok: true, by: s.name, text: raw ? `Cập nhật Camera Gateway: ${raw}` : "Xoá Camera Gateway" }])
      return json({ ok: true, gatewayUrl: raw })
    }
    if (path === "/cam/log" && m === "POST") {
      const text = String(body.text || "").trim().slice(0, 160)
      if (!text) throw new Http(400, "Thiếu nội dung nhật ký")
      await L([{ t: Date.now(), ok: true, by: s.name, text }])
      return json({ ok: true })
    }

    // ---- chặn / mở (Ba Mẹ cũng dùng được) ----
    if (path === "/block" && m === "POST") {
      const target = await parseTarget(body.target)
      await guardIot(target)
      const minutes = Math.max(0, Math.min(10080, Math.round(Number(body.minutes) || 0)))
      const [st, devices, meta] = await Promise.all([loadState(), loadDevices(), loadMeta()])
      const label = labelOf(target, st, devices, meta)
      const log = await exec(
        { kind: "block", target, label, until: minutes ? Date.now() + minutes * 60000 : undefined, reason: minutes ? `${minutes}′` : "" },
        s.name,
      )
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      await markManual(s.name).catch(() => {})
      return json({ ok: true })
    }
    if (path === "/unblock" && m === "POST") {
      const target = await parseTarget(body.target)
      await guardIot(target)
      const [st, devices, meta] = await Promise.all([loadState(), loadDevices(), loadMeta()])
      const log = await exec({ kind: "unblock", target, label: labelOf(target, st, devices, meta) }, s.name)
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true })
    }
    if (path === "/reboot" && m === "POST") {
      needAdmin(s)
      const all = await gids()
      const target = body.gid === "all" ? all : [Number(body.gid)].filter((g) => all.includes(g))
      if (!target.length) throw new Http(400, "Router không hợp lệ")
      const log = await exec({ kind: "reboot", gids: target, label: String(body.label || "").slice(0, 40) || "bấm tay" }, s.name)
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true })
    }

    // ---- Mạng gia đình (Ba Mẹ + Xuân San) ----
    if (path === "/net/toggle" && m === "POST") {
      const log = await setNet(!!body.on, s.name)
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/grant" && m === "POST") {
      const minutes = Number(body.minutes)
      if (![30, 60, 120].includes(minutes)) throw new Http(400, "Chỉ cho thêm 30 phút, 1 hoặc 2 tiếng")
      const log = await grant(minutes, s.name)
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/grant/end" && m === "POST") {
      const log = await endGrant(s.name, `${s.name} kết thúc giờ dùng thêm`)
      if (log) await L([log])
      if (log && !log.ok) throw new Http(502, log.text)
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/scene" && m === "POST") {
      const scene = body.scene as Scene
      if (!SCENES.includes(scene)) throw new Http(400, "Kịch bản không hợp lệ")
      const log = await setScene(scene, s.name)
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/timer" && m === "POST") {
      let t
      try {
        t = cleanTimer(body, s.name)
      } catch (e: any) {
        throw new Http(400, e.message)
      }
      await saveTimers((ts) => [...ts, t])
      const lbl = { on: "mở toàn bộ mạng", off: "tắt toàn bộ mạng", ghost: "giả lỗi mạng" }[t.scene]
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Hẹn ${lbl} lúc ${vn(t.at).hm}` }])
      return json({ ok: true, net: await familyView() })
    }
    if (path.startsWith("/net/timer/") && m === "DELETE") {
      const id = path.slice("/net/timer/".length)
      await saveTimers((ts) => ts.filter((x) => x.id !== id))
      await L([{ t: Date.now(), ok: true, by: s.name, text: "Huỷ một hẹn giờ mạng" }])
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/limits" && m === "POST") {
      let l
      try {
        l = cleanLimit(body)
      } catch (e: any) {
        throw new Http(400, e.message)
      }
      // Chỉ đặt giờ cho WiFi gia đình (không phải WiFi riêng / IoT)
      const snap = await getSnapshot(10 * 60_000)
      const g = ghostSet(await loadFamily())
      const known = snap.routers.some((r: any) => r.ssids.some((x: any) => x.name === l.ssid && isFamilySsid(r.gid, x, g)))
      if (!known) throw new Http(403, "WiFi này không đặt giờ được")
      const prevLimit = (await loadFamily()).limits.find((x) => x.id === l.id || x.ssid === l.ssid)
      await saveLimits((ls) => [...ls.filter((x) => x.id !== l.id && x.ssid !== l.ssid), l])
      const DV = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Đặt giờ dùng WiFi “${l.ssid}”: ${l.wins.map((w) => w.join("–")).join(", ")} · ${l.days.length === 7 ? "mỗi ngày" : l.days.map((d) => DV[d]).join(" ")}${l.enabled ? "" : " (đang tắt giới hạn)"}`, before: prevLimit ? JSON.stringify(prevLimit) : undefined, after: JSON.stringify(l) }])
      // áp dụng ngay nếu mạng đang mở bình thường
      // Áp dụng ngay: WiFi đang ngoài giờ dùng thì tắt (không bật/tắt WiFi khác)
      const now = Date.now()
      const logs = await tickLimits(await loadFamily(), now, now - 1, now).catch((e: any) => [{ t: now, ok: false, by: "Giờ dùng WiFi", text: `Lỗi áp giờ dùng: ${e.message}` }])
      if (logs.length) await addLog(logs.map((x) => ({ ...x, role: "system" as const })))
      return json({ ok: true, net: await familyView() })
    }
    if (path.startsWith("/net/limits/") && m === "DELETE") {
      const id = path.slice("/net/limits/".length)
      const old = (await loadFamily()).limits.find((x) => x.id === id)
      await saveLimits((ls) => ls.filter((x) => x.id !== id))
      if (old) await L([{ t: Date.now(), ok: true, by: s.name, text: `Bỏ giờ dùng WiFi “${old.ssid}” (dùng tự do)`, before: JSON.stringify(old) }])
      return json({ ok: true, net: await familyView() })
    }
    if (path === "/net/rules" && m === "POST") {
      let r: NetRule
      try {
        r = cleanNetRule(body)
      } catch (e: any) {
        throw new Http(400, e.message)
      }
      const prev = (await loadFamily()).rules.find((x) => x.id === r.id)
      if (r.id === DEFAULT_RULE_ID) r.enabled = true // lịch mặc định không thể tắt, chỉ chỉnh giờ
      const exists = !!prev
      await saveRules((rules) => (exists ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r].slice(-20)))
      await L([{ t: Date.now(), ok: true, by: s.name, text: `${exists ? "Sửa" : "Thêm"} lịch mạng “${r.name}”: tắt ${r.offAt} → mở ${r.onAt}${r.enabled ? "" : " (đang tắt lịch)"}`, before: prev ? JSON.stringify(prev) : undefined, after: JSON.stringify(r) }])
      return json({ ok: true, net: await familyView() })
    }
    if (path.startsWith("/net/rules/") && m === "DELETE") {
      const id = path.slice("/net/rules/".length)
      if (id === DEFAULT_RULE_ID) throw new Http(400, "Lịch mặc định không xoá được, chỉ chỉnh giờ")
      const r = (await loadFamily()).rules.find((x) => x.id === id)
      await saveRules((rules) => rules.filter((x) => x.id !== id))
      if (r) await L([{ t: Date.now(), ok: true, by: s.name, text: `Xoá lịch mạng “${r.name}”`, before: JSON.stringify(r) }])
      return json({ ok: true, net: await familyView() })
    }

    if (path === "/wifi/toggle" && m === "POST") {
      const gid = Number(body.gid)
      if (!(await gids()).includes(gid)) throw new Http(400, "Router không hợp lệ")
      if (parent) {
        const snap = await getSnapshot(10 * 60_000)
        const ss = snap.routers.find((r: any) => r.gid === gid)?.ssids.find((x: any) => x.id === Number(body.ssidId))
        if (!ss || !isFamilySsid(gid, ss, ghostSet(await loadFamily()))) throw new Http(403, "WiFi này chỉ Xuân San chỉnh được")
      }
      if (body.enable) await unghost(gid, Number(body.ssidId)).catch(() => {})
      const log = await exec(
        { kind: "wifi", enable: !!body.enable, targets: [{ gid, ssidIds: [Number(body.ssidId)] }], label: String(body.name || "").slice(0, 40) },
        s.name,
      )
      await L([log])
      if (!log.ok) throw new Http(502, log.text)
      return json({ ok: true })
    }
    // ---- Gia đình: người, thiết bị, giờ nghỉ, giới hạn giờ (Ba Mẹ cũng dùng được) ----
    if (path === "/device" && m === "POST") {
      if (!isMac(body.mac)) throw new Http(400, "MAC không hợp lệ")
      const mac = R.macKey(body.mac)
      await guardIot({ kind: "device", id: mac })
      const meta = await loadMeta()
      const cur = (meta[mac] = meta[mac] ?? {})
      if ("name" in body) {
        const name = String(body.name || "").trim().slice(0, 40)
        if (name) cur.custom = name
        else delete cur.custom
        // đồng bộ tên lên Ruijie để app Reyee cũng thấy
        const d = (await loadDevices())[mac]
        if (name && d?.gid) await R.renameClient(d.gid, mac, name).catch(() => {})
      }
      if ("owner" in body) {
        const st = await loadState()
        if (body.owner && !st.people.some((p) => p.id === body.owner)) throw new Http(400, "Không có người này")
        if (body.owner) cur.owner = String(body.owner)
        else delete cur.owner
      }
      if (!cur.custom && !cur.owner) delete meta[mac]
      await saveMeta(meta)
      return json({ ok: true })
    }

    if (path === "/people" && m === "POST") {
      const name = String(body.name || "").trim().slice(0, 30)
      if (!name) throw new Http(400, "Nhập tên")
      const p = await mutate((st) => {
        const ex = st.people.find((x) => x.id === body.id)
        if (ex) {
          ex.name = name
          return ex
        }
        const np = { id: uid(), name, color: st.people.length % 6 }
        st.people.push(np)
        return np
      })
      return json({ ok: true, person: p })
    }
    const pm = path.match(/^\/people\/([\w-]+)$/)
    if (pm && m === "DELETE") {
      await mutate((st) => {
        st.people = st.people.filter((p) => p.id !== pm[1])
        st.rules = st.rules.filter((r) => !(r.target?.kind === "person" && r.target.id === pm[1]))
      })
      const meta = await loadMeta()
      for (const k of Object.keys(meta)) if (meta[k].owner === pm[1]) delete meta[k].owner
      await saveMeta(meta)
      return json({ ok: true })
    }

    if (path === "/rules" && m === "POST") {
      if (parent && !PARENT_RULES.includes(body.type)) throw new Http(403, "Loại lịch này chỉ Xuân San đặt được")
      const rule = await cleanRule(body, await gids())
      if (rule.target) await guardIot(rule.target)
      if (parent && (await loadState()).rules.some((r) => r.id === rule.id && !PARENT_RULES.includes(r.type))) throw new Http(403, "Lịch này chỉ Xuân San sửa được")
      await mutate((st) => {
        const i = st.rules.findIndex((r) => r.id === rule.id)
        if (i >= 0) st.rules[i] = rule
        else st.rules.push(rule)
      })
      return json({ ok: true, rule })
    }
    const rm = path.match(/^\/rules\/([\w-]+)(\/toggle)?$/)
    if (rm) {
      await mutate((st) => {
        const r = st.rules.find((x) => x.id === rm[1])
        if (!r) throw new Http(404, "Không tìm thấy lịch")
        if (parent && !PARENT_RULES.includes(r.type)) throw new Http(403, "Lịch này chỉ Xuân San sửa được")
        if (m === "DELETE") st.rules = st.rules.filter((x) => x.id !== rm[1])
        else if (rm[2] && m === "POST") r.enabled = !r.enabled
        else throw new Http(405, "Không hỗ trợ")
      })
      return json({ ok: true })
    }

    // ---- Mật khẩu WiFi: Ba Mẹ chỉ xem/đổi được WiFi gia đình (không phải WiFi riêng của Xuân San, không phải IoT) ----
    if ((path === "/wifi/secret" || path === "/wifi/password") && m === "POST") {
      const gid = Number(body.gid), ssidId = Number(body.ssidId)
      if (!(await gids()).includes(gid)) throw new Http(400, "Router không hợp lệ")
      if (parent) {
        const snap = await getSnapshot(10 * 60_000)
        const ss = snap.routers.find((r: any) => r.gid === gid)?.ssids.find((x: any) => x.id === ssidId)
        if (!ss || !isFamilySsid(gid, ss, ghostSet(await loadFamily()))) throw new Http(403, "WiFi này chỉ Xuân San chỉnh được")
      }
      if (path === "/wifi/secret") {
        const { raw } = await R.ssidRaw(gid, ssidId)
        await L([{ t: Date.now(), ok: true, by: s.name, text: `Xem mật khẩu WiFi “${raw.ssidName}”` }])
        return json({ password: raw.password ?? "" })
      }
      const pw = String(body.password || "")
      if (pw.length < 8 || pw.length > 63) throw new Http(400, "Mật khẩu WiFi 8–63 ký tự")
      await R.updateSsid(gid, ssidId, { password: pw })
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Đổi mật khẩu WiFi “${String(body.name || ssidId).slice(0, 40)}”` }])
      return json({ ok: true })
    }

    // ---------- chỉ admin ----------
    needAdmin(s)

    if (path === "/wifi/create" && m === "POST") {
      const name = String(body.name || "").trim()
      const pass = String(body.password || "")
      if (!name || Buffer.byteLength(name) > 32) throw new Http(400, "Tên WiFi 1–32 ký tự")
      if (pass.length < 8 || pass.length > 63) throw new Http(400, "Mật khẩu WiFi 8–63 ký tự")
      const bands = (Array.isArray(body.bands) ? body.bands : []).filter((b: string) => ["2.4G", "5G"].includes(b))
      if (!bands.length) throw new Http(400, "Chọn ít nhất 1 băng tần")
      const all = await gids()
      const targets = (Array.isArray(body.gids) ? body.gids.map(Number) : []).filter((g: number) => all.includes(g))
      if (!targets.length) throw new Http(400, "Chọn router")
      const errs: string[] = []
      for (const gid of targets)
        try {
          await R.createSsid(gid, { name, password: pass, bands, hidden: !!body.hidden, isolation: !!body.isolation })
        } catch (e: any) {
          errs.push(e.message)
        }
      await L([{ t: Date.now(), ok: !errs.length, by: s.name, text: `Tạo WiFi “${name}” trên ${targets.length - errs.length}/${targets.length} router${errs.length ? ` — ${errs[0]}` : ""}` }])
      if (errs.length === targets.length) throw new Http(502, errs[0])
      await buildSnapshot().catch(() => {})
      return json({ ok: true, errors: errs })
    }
    if (path === "/wifi/update" && m === "POST") {
      const gid = Number(body.gid)
      if (!(await gids()).includes(gid)) throw new Http(400, "Router không hợp lệ")
      const p: R.SsidPatch = {}
      if (body.name !== undefined) {
        const n = String(body.name).trim()
        if (!n || Buffer.byteLength(n) > 32) throw new Http(400, "Tên WiFi 1–32 ký tự")
        p.name = n
      }
      if (body.password) {
        const pw = String(body.password)
        if (pw.length < 8 || pw.length > 63) throw new Http(400, "Mật khẩu WiFi 8–63 ký tự")
        p.password = pw
      }
      if (Array.isArray(body.bands)) {
        const b = body.bands.filter((x: string) => ["2.4G", "5G"].includes(x))
        if (!b.length) throw new Http(400, "Chọn ít nhất 1 băng tần")
        p.bands = b
      }
      for (const k of ["hidden", "isolation", "bandSteering", "fastRoaming", "gaming"] as const)
        if (typeof body[k] === "boolean") p[k] = body[k]
      if (["auto", "wifi6", "wifi5", "wifi4"].includes(body.standard)) p.standard = body.standard
      if (body.usersLimit !== undefined) {
        const u = Math.round(Number(body.usersLimit))
        if (!(u >= 0 && u <= 256)) throw new Http(400, "Giới hạn số máy 0–256")
        p.usersLimit = u
      }
      for (const k of ["upRate", "downRate", "wlanUpRate", "wlanDownRate"] as const)
        if (body[k] !== undefined) {
          const v = String(body[k]).trim()
          if (v && !/^\d{1,7}$/.test(v)) throw new Http(400, "Giới hạn tốc độ phải là số (kbps)")
          p[k] = v
        }
      await R.updateSsid(gid, Number(body.ssidId), p)
      const changed = Object.keys(p).map((k) => (k === "password" ? "mật khẩu" : k === "name" ? "tên" : k)).join(", ")
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Sửa WiFi “${String(body.oldName || body.ssidId)}” (${changed || "không đổi"})` }])
      await buildSnapshot().catch(() => {})
      return json({ ok: true })
    }
    if (path === "/wifi/delete" && m === "POST") {
      const gid = Number(body.gid)
      if (!(await gids()).includes(gid)) throw new Http(400, "Router không hợp lệ")
      await R.deleteSsid(gid, Number(body.ssidId))
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Xoá WiFi “${String(body.name || body.ssidId)}”` }])
      await buildSnapshot().catch(() => {})
      return json({ ok: true })
    }

    if (path === "/inventory") {
      needAdmin(s)
      return json(await inventory())
    }
    if (path === "/pin" && m === "POST") {
      needAdmin(s)
      await setPin(String(body.uid), String(body.pin))
      await L([{ t: Date.now(), ok: true, by: s.name, text: `Đổi mã PIN tài khoản ${body.uid}` }])
      return json({ ok: true })
    }
    // Tự kiểm tra hệ thống cảnh báo (chỉ Quản trị): email thử / cảnh báo thử / làm "nhịp tim" cũ để thử watchdog
    if (path === "/selftest" && m === "POST") {
      needAdmin(s)
      if (body.kind === "email") {
        const r = await sendMail("[WiFi Nhà] Email thử", `Email thử từ app WiFi Nhà, gửi bởi ${s.name}.`)
        return json(r, r.ok ? 200 : 502)
      }
      if (body.kind === "alert") {
        await raise("selftest", "Cảnh báo thử", "Đây là cảnh báo thử do Quản trị bấm. Khoảng 15 phút sau sẽ có email 'Đã phục hồi'.", 0)
        return json({ ok: true })
      }
      if (body.kind === "stale") {
        await saveBeat({ at: Date.now() - 30 * 60000, ok: true, ran: 0 })
        return json({ ok: true })
      }
      if (body.kind === "backup") return json({ ok: await runBackup(Date.now(), true) })
      if (body.kind === "restoretest") {
        const r = await restoreTest()
        return json(r, r.ok ? 200 : 500)
      }
      if (body.kind === "digest") return json({ ok: await runDigest(Date.now(), true) })
      throw new Http(400, "kind phải là email, alert, stale, backup, restoretest hoặc digest")
    }
    if (path === "/accounts") {
      needAdmin(s)
      return json({ users: await allUsers() })
    }

    throw new Http(404, "Không tìm thấy")
  } catch (e: any) {
    if (!(e instanceof Http)) console.error(path, e)
    const status = e instanceof Http ? e.status : e instanceof R.RuijieError ? 502 : 500
    return json({ error: e.message || "Lỗi không xác định", code: e.code }, status)
  }
}

export const config: Config = { path: "/api/*" }
