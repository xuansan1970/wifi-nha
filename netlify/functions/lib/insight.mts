// Mục "Hoạt động" (chỉ Xuân San): số liệu lấy thẳng từ Ruijie Cloud cho từng tầng —
// máy nào đã vào mạng gần đây (kể cả máy đã rời đi), dùng bao nhiêu, chất lượng sóng, WiFi nào tải nặng, kênh có nghẽn không, cảnh báo router.
import * as R from "./ruijie.mts"
import { identify, loadOui } from "./smart.mts"
import { getSnapshot } from "./snapshot.mts"
import { loadDevices, loadMeta } from "./state.mts"

const settle = (p: Promise<any>, d: any): Promise<any> => p.catch(() => d)
const vnDay = (t: number, sep = "") => new Date(t + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, sep)
const LB = { module: "logbiz" }

// Mức tải của kênh: Ruijie đếm số router thấy kênh tải thấp/vừa/cao
export const chanLevel = (x: any) => (!x ? null : { channel: Number(x.channel) || 0, level: x.highUtiCount > 0 ? "high" : x.mediumUtiCount > 0 ? "medium" : "low" })

export async function insight() {
  const snap = await getSnapshot(10 * 60_000)
  const [devices, meta, oui] = await Promise.all([loadDevices(), loadMeta(), loadOui()])
  const now = Date.now()
  const online = new Map<string, any>()
  for (const r of snap.routers) for (const c of r.clients) online.set(c.mac, c)

  const floors = await Promise.all(
    snap.routers.map(async (r: any) => {
      const gid = r.gid
      const [today, qual, rank, c2, c5, warn] = await Promise.all([
        settle(R.call("/intl/user/count/building/today", "GET", { ...LB, querys: { group_id: gid, limit: 100, start_day: vnDay(now), end_day: vnDay(now) } }), null),
        settle(R.call("/sta/current_users/vague", "GET", { ...LB, querys: { groupId: gid, page: 1, per_page: 200 } }), null),
        settle(R.call("/ssid/rank", "GET", { ...LB, querys: { data: "total", type: 0, today: vnDay(now, "-"), per_page: 20, page: 1, group_id: gid } }), null),
        settle(R.call("/chnluti/building/status", "GET", { querys: { group_id: gid, radio_type: "2G" } }), null),
        settle(R.call("/chnluti/building/status", "GET", { querys: { group_id: gid, radio_type: "5G" } }), null),
        settle(R.call("/warn/warnlog", "GET", { querys: { group_id: gid, page: 1, per_page: 5, is_eliminate: true } }), null),
      ])
      const q = new Map<string, any>()
      for (const x of qual?.list ?? []) q.set(R.macKey(x.mac), x)
      const seen = (today?.list ?? []).map((x: any) => {
        const mac = R.macKey(x.mac)
        const on = online.get(mac)
        const reg = devices[mac]
        const id = on ?? identify({ mac, alias: x.alias, rawName: reg?.rawName, label: reg?.label, ssid: reg?.ssid }, meta[mac]?.custom, oui)
        const ql = q.get(mac)
        return {
          mac,
          name: id.name,
          kind: id.kind,
          guess: !!id.guess,
          random: !!id.random,
          owner: meta[mac]?.owner ?? null,
          online: !!on,
          sec: Number(x.activeTime) || 0,
          bytes: Number(x.wifiUpDown) || 0,
          score: ql ? Number(ql.score) || 0 : null,
          rssi: ql?.rssi ?? on?.rssi ?? null,
          loss: ql ? Number(ql.pktLoseRate) || 0 : null,
        }
      })
      return {
        gid,
        floor: r.floor,
        failed: !today,
        seen,
        ssids: (rank?.ssidCount ?? []).map((s: any) => ({ ssid: s.ssid, total: Number(s.total) || 0, bytes: Number(s.wifiUpDown) || 0 })),
        chan: { "2.4G": chanLevel(c2?.data?.[0]), "5G": chanLevel(c5?.data?.[0]) },
        alarms: (warn?.data?.logList ?? []).map((w: any) => ({ t: w.createTime, end: w.eliminateTime || null, desc: w.warnTypeDesc || "", dev: w.deviceName || "" })),
      }
    }),
  )
  return { at: now, floors }
}
