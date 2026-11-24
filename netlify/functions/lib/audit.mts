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

// ---- Thử chặn THẬT có đo giờ (anh San duyệt 24/11): mỗi nhịp tick (5 phút) chạy đúng 1 bước, theo thứ tự; mỗi EXP_ID chạy 1 vòng ----
// Máy đo đặt trong mạng nhà ghi lại thời điểm thật sự rớt mạng / có mạng lại. Kết quả kiểm toán lưu vào kho rồi in ra ở bước cuối
// (vì khi chính máy đo bị chặn thì không xem log trực tiếp được).
export const EXP_ID = "2026-11-24-quat-1"
const FAN = { mac: "c493bb22273e", label: "Quạt phòng San (thử chặn thật)" }
const MAC = { mac: "f6685c574bff", label: "MacBook Pro của San (thử chặn thật)" }
const MAC2 = { mac: "864cb7a0f207", label: "MacBook Pro của San (thử chặn thật)" }
const t8 = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 19)
async function expBlock(d: { mac: string; label: string }, on: boolean) {
  const { exec } = await import("./engine.mts")
  const { addLog } = await import("./state.mts")
  const target = { kind: "device" as const, id: d.mac }
  const log = await exec(on ? { kind: "block", target, label: d.label, until: Date.now() + 14 * 60000, reason: "thử nghiệm" } : { kind: "unblock", target, label: d.label }, "Kiểm toán")
  await addLog([{ ...log, role: "system" }])
  console.log("EXP", on ? "block" : "unblock", d.label, t8(), log.ok, log.text)
}
async function expAudit(tag: string) {
  const o = await blockAudit("router")
  const pack = { at: t8(), routers: o.routers.map((r: any) => ({ name: r.name, blocked: r.blocked, err: r.blErr || r.clErr, vanOnline: r.biChanMaVanOnline, co: r.clients.filter((c: string) => c.startsWith(FAN.mac) || c.startsWith(MAC2.mac) || /MacBook Pro của San/i.test(c)) })) }
  await setJSON(`exp-audit-${tag}`, pack)
  console.log("EXPAUDIT", tag, JSON.stringify(pack).slice(0, 3500))
}
const STEPS: (() => Promise<void>)[] = [
  async () => { await expBlock(FAN, true); const { setAllGames } = await import("./appblock.mts"); console.log("EXP games-off", t8(), (await setAllGames(false)).err ?? "ok") }, // đã chạy 19:30
  async () => expAudit("quat"), // quạt đang bị chặn: danh sách chặn và danh sách máy online nói gì?
  async () => { await expBlock(FAN, false); const { setAllGames } = await import("./appblock.mts"); console.log("EXP games-on", t8(), (await setAllGames(true)).err ?? "ok") },
  async () => {
    // 19:35 phát hiện: 5 phút sau khi chặn quạt, danh sách chặn trên cả 3 router đã TRỐNG. Đo xem mục chặn biến mất sau bao nhiêu giây, ở router nào trước.
    await expBlock(MAC, true)
    const poll: string[] = []
    for (let k = 0; k < 9; k++) {
      await new Promise((r) => setTimeout(r, 8000))
      const [t2, tr] = await Promise.all([safe(R.listBlocked(7235090)), safe(R.listBlocked(233092))])
      poll.push(`${t8()} T2=${Array.isArray(t2) ? t2.join(",") || "trống" : "lỗi"} Tret=${Array.isArray(tr) ? tr.join(",") || "trống" : "lỗi"}`)
    }
    await setJSON("exp-poll", poll)
    console.log("EXPPOLL", JSON.stringify(poll))
  },
  async () => {
    await expAudit("mac")
    // Vì sao mục chặn tự biến mất? Xem cờ xung đột cấu hình của từng project và dữ liệu thô của danh sách chặn
    const pj: any = await safe(R.call("/maint/network/common/list?page_index=1&page_size=999&version=1&include_fitap=true", "GET"))
    const raw = await Promise.all([233092, 7235104, 7235090].map((g) => safe(R.call(`/enet/conf/group/${g}/mac_filter`, "GET"))))
    const hs = await Promise.all([233092, 7235090].map((g) => safe(R.call(`/homescene/mac_filter/${g}`, "GET"))))
    const dump = { projects: JSON.stringify(pj).slice(0, 2600), macFilter: JSON.stringify(raw).slice(0, 1500), homescene: JSON.stringify(hs).slice(0, 1200) }
    await setJSON("exp-dump", dump)
    for (const [k, v] of Object.entries(dump)) console.log("EXPDUMP", k, v)
  },
  async () => expBlock(MAC, false),
  async () => { for (const tag of ["quat", "mac"]) console.log("EXPAUDIT", tag, JSON.stringify(await getJSON<any>(`exp-audit-${tag}`, null)).slice(0, 3500)); console.log("EXPPOLL", JSON.stringify(await getJSON<any>("exp-poll", null))); for (const [k, v] of Object.entries(await getJSON<any>("exp-dump", {}))) console.log("EXPDUMP", k, v); console.log("EXP END", t8()) },
  // ---- Vòng 2 (sau khi sửa: chặn 1 máy = chặn mọi địa chỉ WiFi của máy đó) ----
  async () => {
    // Quạt: lần 1 mục chặn biến mất trong 5 phút. Đo lại từng 8 giây xem mất lúc nào.
    const { buildSnapshot } = await import("./snapshot.mts")
    await buildSnapshot().catch((e) => console.log("EXP snap-error", String(e?.message).slice(0, 100)))
    await expBlock(FAN, true)
    const poll: string[] = []
    for (let k = 0; k < 6; k++) {
      await new Promise((r) => setTimeout(r, 8000))
      const [t2, tr] = await Promise.all([safe(R.listBlocked(7235090)), safe(R.listBlocked(233092))])
      poll.push(`${t8()} T2=${Array.isArray(t2) ? t2.join(",") || "trống" : "lỗi"} Tret=${Array.isArray(tr) ? tr.join(",") || "trống" : "lỗi"}`)
    }
    await setJSON("exp-poll2", poll)
    console.log("EXPPOLL2", JSON.stringify(poll))
  },
  async () => { await expBlock(FAN, false); await expBlock(MAC, true) },
  async () => { await expAudit("mac2"); await expBlock(MAC, false) },
  async () => {
    // 20:17 anh San báo TV không xem được: YouTube và Netflix đang bị chặn cho cả nhà (bật lúc 14:46–14:47) → gỡ 2 mục này
    const { toggleApp } = await import("./appblock.mts")
    const { addLog } = await import("./state.mts")
    for (const id of ["youtube", "netflix"]) { const r = await toggleApp(id, false); console.log("EXP tv-fix", id, t8(), r.err ?? "ok") }
    await addLog([{ t: Date.now(), ok: true, by: "Kiểm toán", role: "system", text: "Bỏ chặn YouTube và Netflix (TV phòng khách không xem được)" }])
    for (const k of ["exp-poll2", "exp-audit-mac2"]) console.log("EXPFINAL", k, JSON.stringify(await getJSON<any>(k, null)).slice(0, 3500)); console.log("EXP END2", t8()) },
  // ---- Vòng 3: thử cơ chế "bám đuôi" trên MacBook (đang dùng địa chỉ 864c… sau lần nhảy WiFi ở vòng 1) ----
  // (đã huỷ 20:24 theo tình hình thực tế: chưa thử bám đuôi trên máy thật)
  async () => {
    // 20:38 đo từ mạng nhà: mọi mục chặn (game, đường lách, quảng cáo) đều đang mở. Anh San yêu cầu khôi phục như lúc trước, trừ YouTube và Netflix.
    const { loadApps, setMany } = await import("./appblock.mts")
    const { addLog } = await import("./state.mts")
    const b = await loadApps()
    console.log("EXP restore-before", t8(), JSON.stringify({ on: Object.keys(b.on).filter((k) => b.on[k]), sched: b.sched, ip: b.ip, linked: b.linked, err: b.err ?? null }))
    const a2 = await setMany({ lienquan: true, roblox: true, discord: true, games: true, bypass: true, adblock: true, security: true, youtube: false, netflix: false })
    await addLog([{ t: Date.now(), ok: !a2.err, by: "Kiểm toán", role: "system", text: `Khôi phục chặn game, đường lách, quảng cáo, web độc hại như trước; YouTube và Netflix để mở cho TV${a2.err ? " — lỗi: " + a2.err : ""}` }])
    console.log("EXP restore-after", t8(), JSON.stringify({ on: Object.keys(a2.on).filter((k) => a2.on[k]), ip: a2.ip, linked: a2.linked, err: a2.err ?? null }))
    const lg = (await (await import("./state.mts")).getLog()).filter((l) => l.t > Date.now() - 100 * 60000 && /chặn|Chặn|Gỡ|Bỏ/.test(l.text)).slice(0, 25).map((l) => `${new Date(l.t + 7 * 3600e3).toISOString().slice(11, 16)} ${l.by}: ${l.text}`)
    console.log("EXP recent-log", JSON.stringify(lg).slice(0, 3000))
  },
]
export async function expStep(): Promise<boolean> {
  const st = await getJSON<{ id: string; stage: number }>("exp", { id: "", stage: 0 })
  const cur = st.id === EXP_ID ? st.stage : 0
  if (cur >= STEPS.length) return false
  await setJSON("exp", { id: EXP_ID, stage: cur + 1 })
  console.log("EXP step", cur, t8())
  await STEPS[cur]().catch((e) => console.log("EXP step-error", cur, String(e?.message || e).slice(0, 200)))
  return true
}
