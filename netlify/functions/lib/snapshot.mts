// Ảnh chụp toàn bộ hệ thống: router, WiFi, thiết bị đang online, danh sách chặn.
// Lưu vào Blobs để mở app là có dữ liệu ngay (rồi cập nhật nền).
import * as R from "./ruijie.mts"
import { identify, loadOui } from "./smart.mts"
import { Dev, floorOf, loadDevices, loadMeta, saveDevices } from "./state.mts"
import { getJSON, setJSON } from "./store.mts"

export type Snapshot = { at: number; routers: any[]; errors: string[] }

let building: Promise<Snapshot> | null = null

export async function getSnapshot(maxAgeMs: number): Promise<Snapshot> {
  const cur = await getJSON<Snapshot | null>("snapshot", null)
  if (cur && Date.now() - cur.at <= maxAgeMs) return cur
  return buildSnapshot()
}

export function buildSnapshot(): Promise<Snapshot> {
  if (!building) building = build().finally(() => (building = null))
  return building
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

  // Thiết bị bị chặn (đang offline) vẫn cần tên → lấy từ sổ thiết bị
  await saveDevices(devices)
  const snap: Snapshot = { at: Date.now(), routers, errors: allErrors }
  await setJSON("snapshot", snap)
  return snap
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
