// Ảnh chụp toàn bộ hệ thống: router, WiFi, thiết bị đang online, danh sách chặn.
// Lưu vào Blobs để mở app là có dữ liệu ngay (rồi cập nhật nền).
import * as R from "./ruijie.mts"
import { identify, loadOui } from "./smart.mts"
import { Dev, floorOf, loadDevices, loadMeta, saveDevices } from "./state.mts"
import { cacheGet, cachePut, getJSON, setJSON } from "./store.mts"

export type Snapshot = { at: number; routers: any[]; errors: string[] }

// Bản mới nhất: Cache API (miễn phí) hoặc KV, lấy cái mới hơn
async function latestSnap(): Promise<Snapshot | null> {
  const [c, k] = await Promise.all([cacheGet<Snapshot>("snapshot"), getJSON<Snapshot | null>("snapshot", null)])
  if (c && (!k || c.at >= k.at)) return { ...c, kvAt: k?.at ?? 0 } as any
  return k ? ({ ...k, kvAt: k.at } as any) : null
}

export async function getSnapshot(maxAgeMs: number): Promise<Snapshot> {
  const cur: any = await latestSnap()
  if (cur && Date.now() - cur.at <= maxAgeMs) return cur
  return buildSnapshot(cur?.kvAt ?? 0)
}

// Ghi KV tối đa 1 lần / 4 phút (gói Free chỉ 1.000 lần ghi/ngày); Cache API thì ghi mỗi lần
const KV_SNAP_EVERY = 4 * 60_000
async function saveSnap(snap: Snapshot, kvAt: number) {
  await cachePut("snapshot", snap)
  if (Date.now() - kvAt >= KV_SNAP_EVERY) await setJSON("snapshot", snap)
}

// Cloudflare Workers không cho dùng chung Promise giữa các request → mỗi request tự build.
export async function buildSnapshot(kvAt?: number): Promise<Snapshot> {
  if (kvAt === undefined) kvAt = (await getJSON<Snapshot | null>("snapshot", null))?.at ?? 0
  const snap = await build()
  await saveSnap(snap, kvAt)
  return snap
}

async function settle<T>(p: Promise<T>, fb: T, errs: string[]) {
  try {
    return await p
  } catch (e: any) {
    errs.push(e.message)
    return fb
  }
}

async function build(): Promise<Snapshot> {
  const projects = await R.listProjects()
  const [devices, oui, meta] = await Promise.all([loadDevices(), loadOui(), loadMeta()])
  const now = Date.now()
  const allErrors: string[] = []

  const routers = await Promise.all(
    projects.map(async (p: any) => {
      const errs: string[] = []
      const fl = floorOf(p.name)
      const [devs, clients, blocked, wifi] = await Promise.all([
        settle(R.listDevices(p.gid), [] as any[], errs),
        settle(R.listClients(p.gid), [] as any[], errs),
        settle(R.listBlocked(p.gid), [] as string[], errs),
        settle(R.wifiFull(p.gid), { tid: 0, data: {} as any }, errs),
      ])
      const ssids = ((wifi.data as any).ssidList ?? []).map((s: any) => ({
        id: s.id,
        wlanId: s.wlanId,
        name: s.ssidName,
        enable: String(s.enable) === "true",
        hidden: String(s.ishidden) === "true",
        iot: /iot/i.test(s.ssidName) || String(s.ishidden) === "true",
        bands: String(s.relatedRadio || "")
          .split(",")
          .map((r: string) => (r === "1" ? "2.4G" : r === "2" ? "5G" : r === "3" ? "6G" : r))
          .filter(Boolean),
        security: s.encryptionModeDesc || s.encryptionMode || "",
        vlan: s.vlanId,
        isolation: s.l2iso === true || s.l2iso === "true",
        bandSteering: s.bandSelectEnable === true || s.bandSelectEnable === "true",
        isolation2: s.isGuest === true || s.isGuest === "true",
        fastRoaming: Number(s.ftEnable) === 1,
        gaming: String(s.xpressEnable) === "true",
        standard: s.wirelessModeType || "",
        usersLimit: Number(s.usersLimit) || 0,
        upRate: s.upRate || "",
        downRate: s.downRate || "",
        wlanUpRate: s.wlanUpRate || "",
        wlanDownRate: s.wlanDownRate || "",
        schedule: R.parseTmngt(s.tmngt),
      }))
      const cl = clients.map((c: any) => {
        const reg = devices[c.mac]
        const id = identify(c, meta[c.mac]?.custom, oui)
        const d: Dev = (devices[c.mac] = {
          ...(reg ?? { firstSeen: now }),
          mac: c.mac,
          lastSeen: now,
          gid: p.gid,
          floor: fl.floor,
          ssid: c.ssid,
          band: c.band,
          ip: c.ip,
          alias: c.alias,
          rawName: c.rawName,
          label: c.label,
          os: c.os,
          name: id.name,
          kind: id.kind,
          vendor: id.vendor,
        } as Dev)
        return { ...c, ...id, owner: meta[c.mac]?.owner ?? null, firstSeen: d.firstSeen }
      })
      if (errs.length) allErrors.push(`${fl.floor}: ${errs[0]}`)
      return {
        gid: p.gid,
        name: p.name,
        floor: fl.floor,
        order: fl.order,
        conflict: p.conflict,
        device: devs[0] ?? null,
        devices: devs,
        online: devs.some((d: any) => d.online),
        clients: cl,
        blocked,
        ssids,
        tid: wifi.tid,
        errors: errs,
      }
    }),
  )
  routers.sort((a, b) => a.order - b.order)

  // Một thiết bị có thể xuất hiện ở nhiều project (router mesh/AP chung) → chỉ giữ ở router nó đang nối
  const snOwner = new Map<string, number>()
  for (const r of routers) for (const d of r.devices) snOwner.set(d.sn, r.gid)
  const seen = new Map<string, number>()
  for (const r of routers)
    for (const c of r.clients) {
      const home = snOwner.get(c.sn)
      if (home === r.gid) seen.set(c.mac, r.gid) // đúng router đang nối → ưu tiên
      else if (!seen.has(c.mac)) seen.set(c.mac, home ?? r.gid)
    }
  for (const r of routers) {
    r.clients = r.clients.filter((c: any) => (seen.get(c.mac) ?? r.gid) === r.gid)
    for (const c of r.clients) {
      const d = devices[c.mac]
      if (d) {
        d.gid = r.gid
        d.floor = r.floor
      }
      c.floor = r.floor
    }
  }

  // Thiết bị bị chặn (đang offline) vẫn cần tên → lấy từ sổ thiết bị
  // Chỉ ghi KV "devices" khi có thay đổi thực sự hoặc đã quá 30 phút chưa cập nhật lastSeen
  const prevDevices = await loadDevices()
  const devicesChanged = Object.keys(devices).some((mac) => {
    const prev = prevDevices[mac]
    const cur = devices[mac]
    if (!prev) return true
    if (now - (prev.lastSeen ?? 0) >= 30 * 60_000 && cur.lastSeen !== prev.lastSeen) return true
    return (
      prev.gid !== cur.gid ||
      prev.floor !== cur.floor ||
      prev.ssid !== cur.ssid ||
      prev.ip !== cur.ip ||
      prev.name !== cur.name ||
      prev.kind !== cur.kind ||
      prev.vendor !== cur.vendor
    )
  })
  if (devicesChanged) await saveDevices(devices)
  return { at: Date.now(), routers, errors: allErrors }
}

// Sửa nhanh ảnh chụp sau thao tác để giao diện thấy kết quả ngay (không chờ quét lại)
export async function patchSnapshot(fn: (s: Snapshot) => void) {
  const cur: any = await latestSnap()
  if (!cur) return
  delete cur.kvAt
  fn(cur)
  await cachePut("snapshot", cur)
  await setJSON("snapshot", cur) // thao tác của người dùng: ghi luôn để mọi máy thấy ngay
}

// Dữ liệu đầy đủ để lưu trữ / xuất (không chứa mật khẩu)
export async function inventory() {
  const projects = await R.listProjects()
  const devices = await loadDevices()
  const routers = await Promise.all(
    projects.map(async (p: any) => {
      const errs: string[] = []
      const [devs, wifi, blocked] = await Promise.all([
        settle(R.call("/maint/devices/list?page=1&per_page=20", "POST", { params: { groupId: p.gid, commonType: "" } }), {} as any, errs),
        settle(R.wifiFull(p.gid), { tid: 0, data: {} }, errs),
        settle(R.call(`/enet/conf/group/${p.gid}/mac_filter`, "GET"), {} as any, errs),
      ])
      return {
        project: p,
        floor: floorOf(p.name).floor,
        hardware: R.sanitize(devs.deviceList ?? []),
        wifi: wifi.data,
        macFilter: R.sanitize(blocked.info ?? null),
        errors: errs,
      }
    }),
  )
  return { at: Date.now(), routers, devices: Object.values(devices) }
}
