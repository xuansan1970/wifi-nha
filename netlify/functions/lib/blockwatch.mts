// Canh "chặn mạng theo máy" bằng số liệu thật, chạy mỗi nhịp tick (5 phút):
// 1) Máy đã chặn ở tầng này mà tầng khác chưa có trong danh sách chặn (lệnh tới router bị rớt) → tự chặn bù.
// 2) Máy nằm trong danh sách chặn nhưng vẫn đang nối WiFi quá 5 phút → ghi nhật ký + email, vì lúc đó chặn KHÔNG ăn.
import { raise } from "./notify.mts"
import * as R from "./ruijie.mts"
import { getSnapshot } from "./snapshot.mts"
import { loadLan } from "./lan.mts"
import { addLog, linkName, loadDevices, loadMeta, namesOf, vn } from "./state.mts"
import { getJSON, setJSON } from "./store.mts"

type Router = { gid: number; name: string; blocked: string[]; clients: { mac: string; wired?: boolean; ssid?: string; rawName?: string }[] }
// Máy bị chặn đổi sang địa chỉ WiFi mới (nối WiFi nhà khác) để có mạng lại: nhận ra bằng tên máy trùng với máy đang bị chặn
export function findFollowers(routers: Router[], blockedNames: Set<string>, lan: Record<string, { name?: string }> = {}) {
  const all = new Set(routers.flatMap((r) => r.blocked ?? []))
  const seen = new Set<string>()
  return routers.flatMap((r) => (r.clients ?? []).filter((c) => !c.wired && !all.has(c.mac) && [linkName(c.rawName), linkName(lan[c.mac]?.name)].some((n) => n && blockedNames.has(n)) && !seen.has(c.mac) && seen.add(c.mac)).map((c) => ({ mac: c.mac, name: String(c.rawName || lan[c.mac]?.name || c.mac), ssid: c.ssid ?? "", router: r.name })))
}
// Hàm thuần để test: trả về việc cần chặn bù và máy bị chặn mà vẫn online
export function findLeaks(routers: Router[]) {
  const all = new Set(routers.flatMap((r) => r.blocked ?? []))
  const missing = routers.flatMap((r) => [...all].filter((m) => !(r.blocked ?? []).includes(m)).map((mac) => ({ gid: r.gid, router: r.name, mac })))
  const online = routers.flatMap((r) => (r.clients ?? []).filter((c) => all.has(c.mac) && !c.wired).map((c) => ({ gid: r.gid, router: r.name, mac: c.mac, ssid: c.ssid ?? "" })))
  return { missing, online }
}

export async function blockWatch(now = Date.now()) {
  const snap = await getSnapshot(5 * 60_000)
  if (!snap?.routers?.length || snap.errors?.length) return
  const { missing, online } = findLeaks(snap.routers as Router[])
  const anyBlocked = (snap.routers as Router[]).some((r) => r.blocked?.length)
  const [devices, meta] = anyBlocked ? await Promise.all([loadDevices(), loadMeta()]) : [{}, {}] as any
  if (anyBlocked) {
    const lan = await loadLan().catch(() => ({} as Record<string, { name?: string }>))
    const names = new Set<string>((snap.routers as Router[]).flatMap((r) => r.blocked ?? []).flatMap((m) => namesOf(m, devices, lan)))
    for (const f of findFollowers(snap.routers as Router[], names, lan).slice(0, 4)) {
      const res = await Promise.all((snap.routers as Router[]).map((r) => R.blockMac(r.gid, f.mac).then(() => true, () => false)))
      await addLog([{ t: now, ok: res.every(Boolean), by: "Hệ thống", role: "system", text: `Chặn thêm địa chỉ mới của "${f.name}" (máy đang bị chặn đã nối WiFi ${f.ssid} bằng địa chỉ khác)` }])
    }
  }
  const nameOf = (m: string) => meta[m]?.custom || devices[m]?.name || m
  for (const x of missing.slice(0, 6)) {
    const ok = await R.blockMac(x.gid, x.mac).then(() => true, () => false)
    await addLog([{ t: now, ok, by: "Hệ thống", role: "system", text: ok ? `Chặn bù ${nameOf(x.mac)} trên ${x.router} (trước đó tầng này chưa nhận lệnh chặn)` : `Chưa chặn bù được ${nameOf(x.mac)} trên ${x.router}, sẽ thử lại sau 5 phút` }])
  }
  const seen = await getJSON<Record<string, number>>("block-leak", {})
  const next: Record<string, number> = {}
  for (const x of online) {
    next[x.mac] = seen[x.mac] ?? now
    if (now - next[x.mac] >= 5 * 60000)
      await raise(`block-leak-${x.mac}`, `Đã chặn nhưng máy vẫn vào mạng: ${nameOf(x.mac)}`, `Máy "${nameOf(x.mac)}" nằm trong danh sách chặn nhưng lúc ${vn(now).hm} vẫn đang nối WiFi "${x.ssid}" ở ${x.router} (đã hơn 5 phút). Lệnh chặn chưa có tác dụng trên router này.`, 3 * 3600e3, true)
  }
  if (JSON.stringify(seen) !== JSON.stringify(next)) await setJSON("block-leak", next)
}
