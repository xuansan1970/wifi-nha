import type { Config, Context } from "@netlify/functions"
import * as R from "./lib/ruijie.mts"
import { checkToken, clearCookie, makeToken, setCookie, tokenFrom, tryPin } from "./lib/auth.mts"
import { addLog, blockEverywhere, getLog, loadState, Rule, saveState, unblockEverywhere } from "./lib/state.mts"
import { exec, tick } from "./lib/engine.mts"

const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  })

function floorLabel(name: string) {
  const n = name.toLowerCase()
  if (/tret|trệt|gf|ground/.test(n)) return { label: "Tầng trệt", order: 0 }
  const m = n.match(/t(?:ầng|ang)?\s*(\d)/)
  if (m) return { label: `Tầng ${m[1]}`, order: Number(m[1]) }
  return { label: name, order: 9 }
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const isMac = (m: any) => typeof m === "string" && R.macKey(m).length === 12

async function allGids() {
  return (await R.listProjects()).map((p: any) => p.gid)
}

async function overview() {
  const projects = await R.listProjects()
  const s = await loadState()
  const routers = await Promise.all(
    projects.map(async (p: any) => ({ ...p, ...floorLabel(p.name), ...(await R.routerOverview(p.gid)) })),
  )
  routers.sort((a, b) => a.order - b.order)
  // nhớ tên thiết bị để danh sách bị chặn vẫn hiện tên
  let changed = false
  for (const r of routers)
    for (const c of r.clients)
      if (c.name && c.name !== c.mac && s.names[c.mac] !== c.name) {
        s.names[c.mac] = c.name
        changed = true
      }
  if (changed) {
    const s2 = await loadState()
    s2.names = { ...s2.names, ...s.names }
    await saveState(s2)
  }
  return { routers, temps: s.temps, names: s.names, now: Date.now() }
}

function cleanRule(b: any, gids: number[]): Rule {
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d: number) => d >= 0 && d <= 6))] : []
  const base = {
    id: typeof b.id === "string" && b.id ? b.id : crypto.randomUUID().slice(0, 8),
    type: b.type,
    name: String(b.name || "").slice(0, 60),
    enabled: b.enabled !== false,
    days: days.length ? (days as number[]) : [0, 1, 2, 3, 4, 5, 6],
  } as Rule
  const pickGids = (x: any) => {
    const v = (Array.isArray(x) ? x.map(Number) : []).filter((g: number) => gids.includes(g))
    if (!v.length) throw new Error("Chưa chọn router")
    return v
  }
  if (b.type === "reboot") {
    if (!HM.test(b.at)) throw new Error("Giờ không hợp lệ")
    return { ...base, at: b.at, gids: pickGids(b.gids), name: base.name || `Khởi động lại ${b.at}` }
  }
  if (b.type === "wifi") {
    if (!HM.test(b.offAt) || !HM.test(b.onAt) || b.offAt === b.onAt) throw new Error("Giờ tắt/bật không hợp lệ")
    const targets = (Array.isArray(b.targets) ? b.targets : [])
      .map((t: any) => ({ gid: Number(t.gid), ssidIds: (t.ssidIds || []).map(Number).filter(Boolean) }))
      .filter((t: any) => gids.includes(t.gid) && t.ssidIds.length)
    if (!targets.length) throw new Error("Chưa chọn WiFi nào")
    return { ...base, offAt: b.offAt, onAt: b.onAt, targets, name: base.name || `Tắt WiFi ${b.offAt}–${b.onAt}` }
  }
  if (b.type === "block") {
    if (!HM.test(b.from) || !HM.test(b.to) || b.from === b.to) throw new Error("Giờ chặn/mở không hợp lệ")
    if (!isMac(b.mac)) throw new Error("Chưa chọn thiết bị")
    const macName = String(b.macName || b.mac).slice(0, 60)
    return {
      ...base,
      from: b.from,
      to: b.to,
      mac: R.macKey(b.mac),
      macName,
      gids: pickGids(b.gids),
      name: base.name || `Chặn ${macName} ${b.from}–${b.to}`,
    }
  }
  throw new Error("Loại lịch không hợp lệ")
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/"
  const method = req.method
  const body = method === "GET" || method === "DELETE" ? {} : await req.json().catch(() => ({}))

  try {
    if (path === "/health") {
      return json({
        ok: true,
        configured: {
          ruijie: !!(Netlify.env.get("RUIJIE_USER") && Netlify.env.get("RUIJIE_PASS")),
          pin: !!Netlify.env.get("APP_PIN"),
          secret: !!Netlify.env.get("APP_SECRET"),
        },
      })
    }
    if (path === "/login" && method === "POST") {
      const r = await tryPin(String(body.pin ?? ""))
      if (!r.ok) return json({ error: r.wait ? `Sai quá nhiều lần, thử lại sau ${r.wait} phút` : "Sai mã PIN" }, 401)
      return json({ ok: true }, 200, { "Set-Cookie": setCookie(makeToken()) })
    }
    if (path === "/logout") return json({ ok: true }, 200, { "Set-Cookie": clearCookie })

    if (!checkToken(tokenFrom(req))) return json({ error: "Cần đăng nhập" }, 401)

    if (path === "/me") return json({ ok: true })
    if (path === "/overview") return json(await overview())
    if (path === "/log") return json({ log: await getLog() })

    if (path === "/reboot" && method === "POST") {
      const gids = await allGids()
      const target = body.gid === "all" ? gids : [Number(body.gid)].filter((g) => gids.includes(g))
      if (!target.length) return json({ error: "Router không hợp lệ" }, 400)
      const log = await exec({ kind: "reboot", gids: target, label: body.label || "thủ công" }, "Bấm tay")
      await addLog([log])
      return log.ok ? json({ ok: true, msg: log.text }) : json({ error: log.text }, 502)
    }

    if (path === "/wifi" && method === "POST") {
      const gid = Number(body.gid)
      if (!(await allGids()).includes(gid)) return json({ error: "Router không hợp lệ" }, 400)
      const ids = (body.ssidIds || []).map(Number).filter(Boolean)
      const log = await exec(
        { kind: "wifi", enable: !!body.enable, targets: [{ gid, ssidIds: ids }], label: body.label || "thủ công" },
        "Bấm tay",
      )
      await addLog([log])
      return log.ok ? json({ ok: true }) : json({ error: log.text }, 502)
    }

    if (path === "/block" && method === "POST") {
      if (!isMac(body.mac)) return json({ error: "MAC không hợp lệ" }, 400)
      const mac = R.macKey(body.mac)
      const name = String(body.name || mac).slice(0, 60)
      const gids = await allGids()
      const errs = await blockEverywhere(mac, gids)
      const minutes = Number(body.minutes) || 0
      const s = await loadState()
      s.temps = s.temps.filter((x) => x.mac !== mac)
      if (minutes > 0) s.temps.push({ mac, name, gids, until: Date.now() + minutes * 60000 })
      s.names[mac] = name
      await saveState(s)
      await addLog([
        {
          t: Date.now(),
          ok: true,
          by: "Bấm tay",
          text: `Chặn ${name}${minutes ? ` trong ${minutes >= 60 ? `${+(minutes / 60).toFixed(1)}h` : `${minutes}′`}` : ""}`,
        },
      ])
      return json({ ok: true, warnings: errs })
    }

    if (path === "/unblock" && method === "POST") {
      if (!isMac(body.mac)) return json({ error: "MAC không hợp lệ" }, 400)
      const mac = R.macKey(body.mac)
      await unblockEverywhere(mac, await allGids())
      const s = await loadState()
      s.temps = s.temps.filter((x) => x.mac !== mac)
      await saveState(s)
      await addLog([{ t: Date.now(), ok: true, by: "Bấm tay", text: `Mở chặn ${s.names[mac] || mac}` }])
      return json({ ok: true })
    }

    if (path === "/rules" && method === "GET") return json({ rules: (await loadState()).rules })
    if (path === "/rules" && method === "POST") {
      const rule = cleanRule(body, await allGids())
      const s = await loadState()
      const i = s.rules.findIndex((r) => r.id === rule.id)
      if (i >= 0) s.rules[i] = rule
      else s.rules.push(rule)
      await saveState(s)
      return json({ ok: true, rule })
    }
    const m = path.match(/^\/rules\/([\w-]+)(\/toggle)?$/)
    if (m) {
      const s = await loadState()
      const r = s.rules.find((x) => x.id === m[1])
      if (!r) return json({ error: "Không tìm thấy lịch" }, 404)
      if (method === "DELETE") s.rules = s.rules.filter((x) => x.id !== m[1])
      else if (m[2] && method === "POST") r.enabled = !r.enabled
      else return json({ error: "Không hỗ trợ" }, 405)
      await saveState(s)
      return json({ ok: true })
    }

    if (path === "/tick" && method === "POST") return json(await tick())

    return json({ error: "Không tìm thấy" }, 404)
  } catch (e: any) {
    console.error(path, e)
    const status = e instanceof R.RuijieError ? 502 : 400
    return json({ error: e.message || "Lỗi không xác định", code: e.code }, status)
  }
}

export const config: Config = { path: "/api/*" }
