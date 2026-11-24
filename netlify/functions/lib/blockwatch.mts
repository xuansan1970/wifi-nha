// Canh "chặn mạng theo máy" bằng số liệu thật, chạy mỗi nhịp tick (5 phút):
// 1) Máy đã chặn ở tầng này mà tầng khác chưa có trong danh sách chặn (lệnh tới router bị rớt) → tự chặn bù.
// 2) Máy nằm trong danh sách chặn nhưng vẫn đang nối WiFi quá 5 phút → ghi nhật ký + email, vì lúc đó chặn KHÔNG ăn.
import { raise } from "./notify.mts"
import * as R from "./ruijie.mts"
import { getSnapshot } from "./snapshot.mts"
import { addLog, loadDevices, loadMeta, vn } from "./state.mts"
import { getJSON, setJSON } from "./store.mts"

type Router = { gid: number; name: string; blocked: string[]; clients: { mac: string; wired?: boolean; ssid?: string }[] }
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
  const [devices, meta] = missing.length || online.length ? await Promise.all([loadDevices(), loadMeta()]) : [{}, {}] as any
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
