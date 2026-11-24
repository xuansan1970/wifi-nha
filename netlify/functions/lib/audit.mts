// Kiểm toán chức năng chặn bằng số liệu THẬT (không đoán): trạng thái NextDNS, IP nhà đã liên kết chưa, tên miền game còn lọt,
// danh sách chặn trên từng router so với máy đang online (máy bị chặn mà vẫn online = chặn không ăn).
// Chạy: Quản trị gọi POST /api/selftest {kind:"blockaudit"}; hoặc tick tự chạy 1 lần mỗi khi đổi AUDIT_ID (kết quả in ra log Worker).
import { configured, desired, inWindow, loadApps, nx } from "./appblock.mts"
import * as R from "./ruijie.mts"
import { getLog, loadDevices, loadMeta, loadState, vn } from "./state.mts"
import { envGet, getJSON, setJSON } from "./store.mts"

export const AUDIT_ID = "2026-11-24-3"
// Tên miền cần biết VÌ SAO bị chặn (đọc lý do từ nhật ký NextDNS)
const WHY = ["play.google.com", "apps.apple.com", "www.youtube.com", "dl.ops.kgvn.garenanow.com"]
const GAME_RE = /garena|roblox|rbx|discord|tencent|qq\.com|gcloud|proxima|intlgame|igamecj|timi|anticheat|riot|steam|epicgames|supercell|moonton|mihoyo|hoyoverse|pubg|freefire|minecraft|xbox|playstation|unity3d|gameloft|vnggames|zing/i
const safe = async <T>(p: Promise<T>): Promise<T | { error: string }> => p.catch((e: any) => ({ error: String(e?.message || e).slice(0, 140) }))

// mode "router": chỉ phần router + lý do chặn (ít lượt gọi mạng; gói Free của Workers trần 50 lượt mỗi lần chạy)
export async function blockAudit(mode: "full" | "router" = "full") {
  const now = Date.now()
  const out: any = { id: AUDIT_ID, at: new Date(now + 7 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + " VN" }
  // ---- 1. Chặn game (NextDNS) ----
  const st = await loadApps()
  const want = desired(st, now)
  out.apps = { configured: configured(), gatTay: Object.keys(st.on).filter((k) => st.on[k]), sched: st.sched, trongGioChan: inWindow(st.sched, now), dangChan: Object.keys(want).filter((k) => want[k]), chuaDongBo: st.sig !== st.okSig, err: st.err ?? null, ipNha: st.ip, ipLienKet: st.linked, lienKetDung: !!st.ip && st.ip === st.linked, capNhatLuc: st.at ? vn(st.at).hm : null, custom: st.custom, allow: st.allow }
  if (configured() && mode === "router") {
    out.why = Object.fromEntries(await Promise.all(WHY.map(async (d) => { const r: any = await safe(nx(`/logs?search=${d}&limit=10`)); return [d, Array.isArray(r) ? [...new Set(r.map((x: any) => `${x.domain} ${x.status} ${(x.reasons ?? []).map((q: any) => q.name || q.id).join("+")}`))] : r] })))
  }
  if (configured() && mode === "full") {
    const [pc, setup, status, top, blocked, devices, ips, protocols, deny] = await Promise.all([
      safe(nx("/parentalControl")), safe(nx("/setup")), safe(nx("/analytics/status?from=-6h")), safe(nx("/analytics/domains?status=default&from=-6h&limit=300")),
      safe(nx("/analytics/domains?status=blocked&from=-6h&limit=40")), safe(nx("/analytics/devices?from=-6h")), safe(nx("/analytics/ips?from=-6h")), safe(nx("/analytics/protocols?from=-6h")), safe(nx("/denylist")),
    ])
    const p: any = pc
    out.nextdns = {
      services: (p.services ?? []).filter((x: any) => x.active).map((x: any) => x.id), categories: (p.categories ?? []).filter((x: any) => x.active).map((x: any) => x.id),
      blockBypass: p.blockBypass, safeSearch: p.safeSearch, pcErr: p.error,
      linkedIp: (setup as any)?.linkedIp?.ip ?? (setup as any)?.error, denylist: Array.isArray(deny) ? { total: deny.length, active: deny.filter((x: any) => x.active).length } : deny,
      status6h: status, devices6h: devices, ips6h: ips, protocols6h: protocols,
      topBlocked6h: Array.isArray(blocked) ? blocked.map((x: any) => `${x.domain}:${x.queries}`) : blocked,
      gameLot6h: Array.isArray(top) ? top.filter((x: any) => GAME_RE.test(x.domain)).map((x: any) => `${x.domain}:${x.queries}`) : top,
      topAllowed6h: Array.isArray(top) ? top.slice(0, 60).map((x: any) => `${x.domain}:${x.queries}`) : top,
    }
  }
  // ---- 2. Chặn mạng theo máy (Ruijie) ----
  const [state, devices, meta, log, projects] = await Promise.all([loadState(), loadDevices(), loadMeta(), getLog(), safe(R.listProjects())])
  out.routers = []
  for (const pr of Array.isArray(projects) ? projects : []) {
    const gid = (pr as any).gid
    const [bl, raw, clients] = await Promise.all([safe(R.listBlocked(gid)), safe(R.call(`/enet/conf/group/${gid}/mac_filter`, "GET")), safe(R.listClients(gid))])
    const cl: any[] = Array.isArray(clients) ? clients : []
    const blocked: string[] = Array.isArray(bl) ? bl : []
    out.routers.push({
      gid, name: (pr as any).name, blocked, blErr: (bl as any).error, filterType: (raw as any)?.info?.type ?? (raw as any)?.error, rawCount: (raw as any)?.info?.macList?.length,
      online: cl.length, clErr: (clients as any).error,
      biChanMaVanOnline: cl.filter((c) => blocked.includes(c.mac)).map((c) => ({ mac: c.mac, name: c.alias || c.rawName, ssid: c.ssid, ip: c.ip, wired: c.wired })),
      clients: cl.map((c) => `${c.mac}|${(c.alias || c.rawName || "").slice(0, 24)}|${c.ssid}|${c.ip}|${c.wired ? "dây" : c.band}|${c.os || c.maker || ""}`),
    })
  }
  out.state = { temps: state.temps.map((t) => ({ ...t, until: vn(t.until).hm })), rules: state.rules.filter((r) => r.type === "block" || r.type === "quota"), people: state.people.map((p) => ({ id: p.id, name: p.name, macs: Object.keys(meta).filter((m) => meta[m].owner === p.id) })) }
  out.macbooks = Object.entries(devices).filter(([m, d]: any) => /mac|barney|apple|laptop/i.test(`${d.name} ${d.rawName} ${d.kind} ${d.vendor} ${meta[m]?.custom ?? ""}`)).map(([m, d]: any) => ({ mac: m, name: meta[m]?.custom || d.name, raw: d.rawName, kind: d.kind, vendor: d.vendor, ssid: d.ssid, floor: d.floor, owner: meta[m]?.owner, last: d.lastSeen ? vn(d.lastSeen).hm + " " + new Date(d.lastSeen + 7 * 3600e3).toISOString().slice(5, 10) : null }))
  const since = now - 8 * 3600e3
  out.mayMoi8h = Object.entries(devices).filter(([, d]: any) => d.firstSeen >= since).map(([m, d]: any) => `${m}|${meta[m]?.custom || d.name}|${d.ssid}|${d.floor}|đầu ${vn(d.firstSeen).hm}|cuối ${vn(d.lastSeen).hm}`)
  out.logChan = log.filter((l) => /chặn|Chặn/.test(l.text)).slice(0, 40).map((l) => `${new Date(l.t + 7 * 3600e3).toISOString().slice(5, 16)} ${l.ok ? "OK" : "LỖI"} ${l.by}: ${l.text}`)
  return out
}

// tick gọi: mỗi AUDIT_ID chỉ chạy 1 lần, in kết quả ra log Worker theo từng khối (xem bằng `wrangler tail`)
export const auditDue = async () => (await getJSON<string>("audit-id", "")) !== AUDIT_ID
export async function auditOnce() {
  if (!(await auditDue())) return
  await setJSON("audit-id", AUDIT_ID)
  const out = await blockAudit("router")
  for (const [k, v] of Object.entries(out)) {
    const s = JSON.stringify(v)
    for (let i = 0; i < s.length; i += 3500) console.log(`AUDIT ${k} ${Math.floor(i / 3500)} ${s.slice(i, i + 3500)}`)
  }
  console.log("AUDIT END")
}
