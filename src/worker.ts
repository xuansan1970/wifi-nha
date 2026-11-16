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
    if (["/hub.js", "/app.js", "/app.css", "/parent.js", "/parent.css", "/views.js", "/sw.js"].includes(url.pathname)) {
      h.set("Cache-Control", "no-cache, must-revalidate")
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
  },
  async scheduled(_event: any, env: Env, ctx: { waitUntil: (p: Promise<any>) => void }) {
    initEnv(env)
    ctx.waitUntil(tickHandler())
  },
}
