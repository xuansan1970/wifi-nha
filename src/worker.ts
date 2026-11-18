import { DurableObject } from "cloudflare:workers"
import apiHandler from "../netlify/functions/api.mts"
import tickHandler from "../netlify/functions/tick.mts"

export interface Env {
  KV: any
  ASSETS: { fetch: (req: Request) => Promise<Response> }
  [key: string]: any
}

// Nơi lưu dữ liệu chính (1 bản cho mọi thiết bị) — xem lib/store.mts
export class StoreDO extends DurableObject {
  async get(key: string) {
    return this.ctx.storage.get(key)
  }
  async put(key: string, value: any) {
    await this.ctx.storage.put(key, value)
  }
  // Bộ đếm nguyên tử (DO chạy tuần tự nên không bị đua khi 2 yêu cầu cùng lúc): n lần trong cửa sổ windowMs
  async bump(key: string, windowMs: number) {
    const now = Date.now()
    const c: any = await this.ctx.storage.get(key)
    const cur = c && now - c.start <= windowMs ? { n: c.n + 1, start: c.start } : { n: 1, start: now }
    await this.ctx.storage.put(key, cur)
    return cur
  }
  async peek(key: string, windowMs: number) {
    const c: any = await this.ctx.storage.get(key)
    return c && Date.now() - c.start <= windowMs ? c : { n: 0, start: 0 }
  }
  async clear(key: string) {
    await this.ctx.storage.delete(key)
  }
  // Nhật ký chỉ-thêm (append-only): chỉ có INSERT và đọc, không có sửa/xoá. Bảng nằm trong SQLite của DO.
  private auditInit() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, ok INTEGER NOT NULL, by TEXT, role TEXT, text TEXT, ip TEXT, dev TEXT, before TEXT, after TEXT)",
    )
  }
  async auditAdd(rows: any[]) {
    this.auditInit()
    for (const r of rows)
      this.ctx.storage.sql.exec(
        "INSERT INTO audit (t,ok,by,role,text,ip,dev,before,after) VALUES (?,?,?,?,?,?,?,?,?)",
        r.t, r.ok ? 1 : 0, r.by ?? null, r.role ?? null, r.text ?? null, r.ip ?? null, r.dev ?? null, r.before ?? null, r.after ?? null,
      )
  }
  async auditList(limit: number, beforeId: number) {
    this.auditInit()
    return this.ctx.storage.sql
      .exec("SELECT * FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?", beforeId || 9e15, Math.min(Math.max(limit, 1), 5000))
      .toArray()
  }
}

function initEnv(env: Env) {
  ;(globalThis as any).__CF_DO = env.STORE.get(env.STORE.idFromName("main"))
  ;(globalThis as any).__CF_KV = env.KV
  ;(globalThis as any).__CF_ENV = env
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    initEnv(env)
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) {
      return apiHandler(request)
    }
    const res = await env.ASSETS.fetch(request)
    const h = new Headers(res.headers)
    h.set("Content-Security-Policy", "frame-ancestors 'self' https://nha-minh.giadinhxuan.workers.dev")
    if (["/app.js", "/app.css", "/parent.js", "/parent.css", "/views.js", "/sw.js"].includes(url.pathname)) {
      h.set("Cache-Control", "no-cache, must-revalidate")
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  },
  async scheduled(_event: any, env: Env, ctx: { waitUntil: (p: Promise<any>) => void }) {
    initEnv(env)
    ctx.waitUntil(tickHandler())
  },
}
