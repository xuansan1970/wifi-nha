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
    // Giữ phiên bản cũ của lịch/cài đặt trước khi ghi đè (để quay lại được)
    if (["family", "state", "meta"].includes(key)) {
      const old = await this.ctx.storage.get(key)
      // chỉ so phần cấu hình (bỏ trạng thái chạy như lastTick, on, ghost, grant…) để không sinh phiên bản mỗi 5 phút
      const cfg = (v: any) => JSON.stringify(key === "family" ? { r: v?.rules, l: v?.limits, t: v?.timers } : key === "state" ? { r: v?.rules, t: v?.temps, p: v?.people } : v)
      const oldJ = old === undefined ? null : JSON.stringify(old)
      if (oldJ !== null && cfg(old) !== cfg(value)) {
        this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, t INTEGER NOT NULL, data TEXT NOT NULL)")
        this.ctx.storage.sql.exec("INSERT INTO versions (k,t,data) VALUES (?,?,?)", key, Date.now(), oldJ)
        this.ctx.storage.sql.exec("DELETE FROM versions WHERE k=? AND id NOT IN (SELECT id FROM versions WHERE k=? ORDER BY id DESC LIMIT 60)", key, key)
      }
    }
    await this.ctx.storage.put(key, value)
  }
  async versions(key: string, withData = false) {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, t INTEGER NOT NULL, data TEXT NOT NULL)")
    return this.ctx.storage.sql
      .exec(`SELECT id, t, ${withData ? "data" : "length(data) AS bytes"} FROM versions WHERE k=? ORDER BY id DESC LIMIT 60`, key)
      .toArray()
  }
  async versionGet(id: number) {
    const r = this.ctx.storage.sql.exec("SELECT k, data FROM versions WHERE id=?", id).toArray()[0] as any
    return r ? { k: r.k as string, value: JSON.parse(r.data) } : null
  }
  async del(key: string) {
    await this.ctx.storage.delete(key)
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
  // Mỗi lần dùng lấy 1 stub mới trong đúng request đang chạy. Trước đây cất sẵn 1 stub vào biến chung:
  // 2 request chạy chồng nhau thì request sau ghi đè stub của request trước → Workers báo
  // "Cannot perform I/O on behalf of a different request" (lỗi 500 ngẫu nhiên khi app gọi nhiều API cùng lúc).
  Object.defineProperty(globalThis, "__CF_DO", { configurable: true, get: () => env.STORE.get(env.STORE.idFromName("main")) })
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
    if (["/app.js", "/faceid.js", "/news.js", "/app.css", "/parent.js", "/parent.css", "/views.js", "/insight.js", "/appblock.js", "/sw.js"].includes(url.pathname)) {
      h.set("Cache-Control", "no-cache, must-revalidate")
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  },
  async scheduled(_event: any, env: Env, ctx: { waitUntil: (p: Promise<any>) => void }) {
    initEnv(env)
    ctx.waitUntil(tickHandler())
  },
}
