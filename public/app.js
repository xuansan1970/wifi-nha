/* WiFi Nhà — giao diện. Vanilla JS, không phụ thuộc thư viện. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P = (d) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const I = {
  home: P('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  devices: P('<rect x="3" y="4" width="13" height="10" rx="1.5"/><path d="M1 18h17"/><rect x="18" y="8" width="5" height="12" rx="1.2"/>'),
  family: P('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>'),
  wifi: P('<path d="M5 12.55a11 11 0 0 1 14 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r=".8"/>'),
  clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  db: P('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  log: P('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  router: P('<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 13l-2-6M16 13l2-6M9.5 8.5a3.5 3.5 0 0 1 5 0"/>'),
  power: P('<path d="M12 3v9M18.4 6.6a9 9 0 1 1-12.8 0"/>'),
  lock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  edit: P('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>'),
  x: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  chev: P('<path d="m9 18 6-6-6-6"/>'),
  alert: P('<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  out: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  dl: P('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  // loại thiết bị
  phone: P('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  tablet: P('<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  laptop: P('<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>'),
  pc: P('<rect x="3" y="3" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 16v5"/>'),
  tv: P('<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>'),
  camera: P('<path d="M15 10l5-3v10l-5-3z"/><rect x="2" y="6" width="13" height="12" rx="2"/>'),
  speaker: P('<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h.01"/>'),
  watch: P('<circle cx="12" cy="12" r="6"/><path d="M9 3h6l1 3H8zM8 18l1 3h6l1-3"/>'),
  console: P('<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="6"/>'),
  iot: P('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  fan: P('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7s3 4-2 7M14 12c4 0 7 1 7 4s-4 3-7-2M12 14c0 4-1 7-4 7s-3-4 2-7M10 12c-4 0-7-1-7-4s4-3 7 2"/>'),
  light: P('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  ac: P('<rect x="2" y="5" width="20" height="9" rx="2"/><path d="M6 18c0 1 1 2 2 2M12 17v3M18 18c0 1-1 2-2 2M6 10h12"/>'),
  printer: P('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  unknown: P('<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
};
const kindIc = (k) => I[k] || (k === "router" ? I.router : I.unknown);
const FLOOR_C = { "Tầng trệt": "var(--f0)", "Tầng 1": "var(--f1)", "Tầng 2": "var(--f2)" };
const floorC = (f) => FLOOR_C[f] || "var(--f3)";
const PEOPLE_C = ["#3366ff", "#f97316", "#10b981", "#8b5cf6", "#ec4899", "#0ea5e9"];
const DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const ini = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();

/* ---------- Trạng thái ---------- */
const S = { me: null, d: null, tab: "home", q: "", floor: "all", busy: false, log: [], inv: null, at: 0, err: null, lastHidden: 0 };
const ADMIN_TABS = [["home", "Tổng quan", "home"], ["devices", "Thiết bị", "devices"], ["family", "Gia đình", "family"], ["wifi", "WiFi", "wifi"], ["rules", "Hẹn giờ", "clock"], ["data", "Dữ liệu", "db"], ["log", "Nhật ký", "log"], ["settings", "Cài đặt", "gear"]];
const PARENT_TABS = [["home", "Gia đình", "family"], ["devices", "Thiết bị", "devices"], ["log", "Nhật ký", "log"], ["settings", "Tài khoản", "user"]];
const MOBILE_ADMIN = ["home", "devices", "family", "wifi", "more"];
const isAdmin = () => S.me?.role === "admin";
const tabs = () => (isAdmin() ? ADMIN_TABS : PARENT_TABS);

/* ---------- API ---------- */
async function api(path, opt = {}) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), opt.timeout || 30000);
  try {
    const r = await fetch("/api" + path, {
      method: opt.method || (opt.body ? "POST" : "GET"),
      headers: opt.body ? { "Content-Type": "application/json" } : {},
      body: opt.body ? JSON.stringify(opt.body) : undefined,
      credentials: "same-origin",
      signal: ctl.signal,
    });
    let j = {};
    try { j = await r.json(); } catch {}
    if (r.status === 401 && !path.startsWith("/login") && path !== "/me") { S.me = null; renderLogin(); throw new Error("Phiên đăng nhập đã hết"); }
    if (!r.ok) throw new Error(j.error || "Lỗi " + r.status);
    return j;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Máy chủ phản hồi chậm, thử lại nhé");
    if (e instanceof TypeError) throw new Error("Mất kết nối mạng");
    throw e;
  } finally { clearTimeout(to); }
}
function toast(m, err) {
  const t = $("#toast"); t.textContent = m; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = "toast"), err ? 4500 : 2400);
}
async function act(btn, fn, ok) {
  const old = btn ? btn.innerHTML : ""; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try { const r = await fn(); if (ok) toast(ok); return r; }
  catch (e) { toast(e.message, 1); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

/* ---------- Tiện ích hiển thị ---------- */
function ago(ms) { if (!ms) return "—"; const s = Math.round((Date.now() - ms) / 1000); if (s < 45) return "vừa xong"; const m = Math.round(s / 60); if (m < 60) return m + " phút trước"; const h = Math.round(m / 60); if (h < 24) return h + " giờ trước"; return Math.round(h / 24) + " ngày trước"; }
function dur(min) { min = Math.max(0, Math.round(min)); return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min}′`; }
const left = (ms) => dur((ms - Date.now()) / 60000);
function bytes(b) { if (!b) return "0 B"; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return b.toFixed(b < 10 && i ? 1 : 0) + " " + u[i]; }
function sig(r) { if (r == null) return ""; const n = r >= -55 ? 4 : r >= -65 ? 3 : r >= -75 ? 2 : 1; return `<span class="sig" title="${r} dBm">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? "f" : ""}"></i>`).join("")}</span>`; }
const fmtMac = (m) => String(m).toUpperCase().match(/.{2}/g).join(":");
const timeVN = (t) => new Date(t).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/* ---------- Dữ liệu suy ra ---------- */
function clients() { const out = []; (S.d?.routers || []).forEach((r) => r.clients.forEach((c) => out.push({ ...c, floor: r.floor, gid: r.gid }))); return out; }
const blockedSet = () => new Set((S.d?.blocked || []).map((b) => b.mac));
const person = (id) => (S.d?.people || []).find((p) => p.id === id);
const pColor = (p) => PEOPLE_C[(p?.color ?? 0) % PEOPLE_C.length];
function devName(mac) { const c = clients().find((x) => x.mac === mac); if (c) return c.name; const k = (S.d?.known || []).find((x) => x.mac === mac); return k?.name || fmtMac(mac); }
function personDevices(pid) { const on = clients().filter((c) => c.owner === pid); const onSet = new Set(on.map((c) => c.mac)); const off = (S.d?.known || []).filter((k) => k.owner === pid && !onSet.has(k.mac)); return { on, off, all: [...on.map((c) => c.mac), ...off.map((k) => k.mac)] }; }
function personBlocked(pid) { const { all } = personDevices(pid); const b = blockedSet(); return all.length > 0 && all.every((m) => b.has(m)); }
function tempOf(key) { return (S.d?.temps || []).find((t) => t.key === key); }
const usedMin = (macs) => macs.reduce((a, m) => Math.max(a, S.d?.usage?.[m] || 0), 0);
function quotaOf(pid) { return (S.d?.rules || []).find((r) => r.type === "quota" && r.enabled && r.target?.kind === "person" && r.target.id === pid); }

/* ---------- Tải dữ liệu (nhanh trước, mới sau) ---------- */
let inflight = null;
async function load(mode) {
  if (inflight && mode !== "force") return inflight;
  const path = mode === "fast" ? "/view?fast=1" : mode === "force" ? "/refresh" : "/view";
  inflight = (async () => {
    try {
      const d = await api(path, mode === "force" ? { method: "POST", timeout: 45000 } : {});
      S.d = d; S.me = d.me; S.err = null; S.at = Date.now();
    } catch (e) { S.err = e.message; if (!S.d) throw e; }
    finally { inflight = null; }
    render();
  })();
  return inflight;
}
function startPolling() {
  clearInterval(S.poll);
  S.poll = setInterval(() => { if (!document.hidden && S.me && !$("#scrim").classList.contains("show")) load(); }, 15000);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { S.lastHidden = Date.now(); return; }
  if (!S.me) return;
  // Tài khoản Ba Mẹ (mọi tài khoản trừ Xuân San): rời app > 5 phút thì khoá lại, tránh các em cầm máy vào được
  if (S.me.uid !== "san" && S.lastHidden && Date.now() - S.lastHidden > 5 * 60000) { lockNow(); return; }
  if (Date.now() - S.at > 10000) load();
});
async function lockNow() { const uid = S.me?.uid; try { await api("/logout", { method: "POST" }); } catch {} S.me = null; S.d = null; renderLogin(uid); }

/* ---------- Đăng nhập ---------- */
async function renderLogin(pre) {
  clearInterval(S.poll);
  let users = [];
  try { users = (await api("/users")).users; } catch (e) { users = []; }
  let uid = pre || localStorage.getItem("wn_uid") || users[0]?.id || "";
  if (!users.some((u) => u.id === uid)) uid = users[0]?.id || "";
  let pin = "";
  const root = $("#root");
  const draw = () => {
    root.innerHTML = `<div class="login"><div class="card">
      <img src="/icon.svg" width="56" height="56" alt="" style="border-radius:16px">
      <h1>WiFi Nhà</h1><div class="sub">Chọn tài khoản và nhập mã PIN</div>
      <div class="who">${users.map((u, i) => `<button data-u="${u.id}" class="${u.id === uid ? "on" : ""}"><span class="av round" style="background:${PEOPLE_C[i % 6]}">${esc(ini(u.name))}</span>${esc(u.name)}</button>`).join("") || '<div class="err">Không tải được danh sách tài khoản</div>'}</div>
      <div class="pinbox" id="pb">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? "f" : ""}"></i>`).join("")}</div>
      <div class="err" id="le"></div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join("")}<button class="k-ghost" data-k="c">Xoá</button><button data-k="0">0</button><button class="k-ghost" data-k="b">⌫</button></div>
    </div></div>`;
    $$("[data-u]").forEach((b) => (b.onclick = () => { uid = b.dataset.u; pin = ""; draw(); }));
    $$("[data-k]").forEach((b) => (b.onclick = () => key(b.dataset.k)));
  };
  const key = async (k) => {
    if (k === "c") pin = ""; else if (k === "b") pin = pin.slice(0, -1); else if (pin.length < 8) pin += k;
    $$("#pb i").forEach((x, i) => x.classList.toggle("f", i < pin.length));
    if (pin.length === 4) {
      try {
        const r = await api("/login", { body: { uid, pin } });
        localStorage.setItem("wn_uid", uid); S.me = r.me; document.removeEventListener("keydown", kb); boot();
      } catch (e) { $("#le").textContent = e.message; const pb = $("#pb"); pb.classList.remove("shake"); void pb.offsetWidth; pb.classList.add("shake"); pin = ""; setTimeout(() => $$("#pb i").forEach((x) => x.classList.remove("f")), 300); }
    }
  };
  const kb = (e) => { if (S.me) return; if (/^\d$/.test(e.key)) key(e.key); else if (e.key === "Backspace") key("b"); };
  document.addEventListener("keydown", kb);
  draw();
}

/* ---------- Khung app ---------- */
function shell() {
  const T = tabs();
  const blockedN = S.d?.blocked?.length || 0;
  const mob = isAdmin() ? MOBILE_ADMIN.map((k) => (k === "more" ? ["more", "Thêm", "gear"] : T.find((t) => t[0] === k))) : T;
  const moreOn = isAdmin() && !MOBILE_ADMIN.includes(S.tab);
  $("#root").innerHTML = `<div class="shell ${isAdmin() ? "" : "simple"}">
    <aside class="side">
      <div class="brand"><img src="/icon.svg" alt=""><div><b>WiFi Nhà</b><small>3 tầng · Ruijie</small></div></div>
      ${T.map(([k, l, ic]) => `<button class="nav ${S.tab === k ? "on" : ""}" data-tab="${k}" data-tip="${l}">${I[ic]}<span>${l}</span>${k === "devices" && blockedN ? `<span class="badge">${blockedN}</span>` : ""}</button>`).join("")}
      <div class="grow"></div>
      <div class="me"><span class="av round" style="background:var(--pri)">${esc(ini(S.me.name))}</span><div><b>${esc(S.me.name)}</b><small>${isAdmin() ? "Quản trị" : "Phụ huynh"}</small></div><button class="btn ghost sm icon" id="lo" title="Đăng xuất">${I.out}</button></div>
    </aside>
    <div>
      <header class="mtop" id="mtop"><img src="/icon.svg" alt=""><b id="mt">WiFi Nhà</b><button class="btn ghost icon" id="rf2" aria-label="Làm mới">${I.refresh}</button></header>
      <main class="main"><div class="page" id="page"></div></main>
    </div>
    <nav class="tabbar">${mob.map(([k, l, ic]) => `<button class="${S.tab === k || (k === "more" && moreOn) ? "on" : ""}" data-tab="${k}">${I[ic]}${l}${k === "devices" && blockedN ? `<span class="badge">${blockedN}</span>` : ""}</button>`).join("")}</nav>
  </div>`;
  $$("[data-tab]").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  $("#lo").onclick = lockNow;
  $("#rf2").onclick = () => refresh($("#rf2"));
  window.onscroll = () => $("#mtop")?.classList.toggle("scrolled", scrollY > 4);
}
function go(t) {
  if (t === "more") return moreSheet();
  S.tab = t; shell(); render(); scrollTo({ top: 0 });
  if (t === "log") loadLog();
  if (t === "data" && !S.inv) loadInv();
}
function moreSheet() {
  sheet(`<div class="sheet-h"><div class="t"><h3>Thêm</h3></div></div><div class="list">${ADMIN_TABS.filter((t) => !MOBILE_ADMIN.includes(t[0])).map(([k, l, ic]) => `<button class="row" data-go="${k}"><span class="av soft">${I[ic]}</span><span class="nm">${l}</span>${I.chev}</button>`).join("")}</div>`);
  $$("[data-go]").forEach((b) => (b.onclick = () => { closeSheet(); go(b.dataset.go); }));
}
async function refresh(btn) { await act(btn, () => load("force"), "Đã cập nhật dữ liệu mới nhất").catch(() => {}); }

function header(title, extra = "") {
  const stale = !S.d || Date.now() - S.d.at > 90000;
  const t = $("#mt"); if (t) t.textContent = title;
  return `<div class="top"><div><h1>${title}</h1><div class="sub"><span class="live ${stale || S.err ? "stale" : ""}"></span>${S.err ? esc(S.err) : S.d ? `Cập nhật ${ago(S.d.at)}` : "Đang tải…"}</div></div><div class="grow"></div>${extra}<button class="btn hide-m" id="rf">${I.refresh}Làm mới</button></div>`;
}

function render() {
  if (!S.me) return;
  if (!$("#page")) shell();
  const pg = $("#page");
  if (!S.d) { pg.innerHTML = header("Đang tải") + `<div class="grid g3"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`; return; }
  const V = isAdmin()
    ? { home: vHome, devices: vDevices, family: vFamily, wifi: vWifi, rules: vRules, data: vData, log: vLog, settings: vSettings }
    : { home: vFamily, devices: vDevices, log: vLog, settings: vSettings };
  const fn = V[S.tab] || V.home;
  const keepQ = document.activeElement?.id === "q" ? document.activeElement.selectionStart : null;
  pg.innerHTML = fn();
  const rf = $("#rf"); if (rf) rf.onclick = () => refresh(rf);
  bind(pg);
  if (keepQ != null) { const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(keepQ, keepQ); } }
  // cập nhật badge
  const n = S.d.blocked.length; $$('[data-tab="devices"] .badge').forEach((b) => (b.textContent = n));
}

/* ---------- Trang: Tổng quan (admin) ---------- */
function vHome() {
  const R = S.d.routers, cl = clients();
  const on = R.filter((r) => r.online).length;
  const err = S.d.errors?.length ? `<div class="alert bad">${I.alert}<div><b>Một số dữ liệu chưa tải được</b><br>${esc(S.d.errors[0])}</div></div>` : "";
  return header("Tổng quan") + err + `
  <div class="grid g4" style="margin-bottom:16px">
    ${kpi(I.router, "Router online", `${on}/${R.length}`, on === R.length ? "Tất cả hoạt động" : "Có router mất kết nối", on === R.length ? "var(--ok)" : "var(--bad)")}
    ${kpi(I.devices, "Thiết bị online", cl.length, `${cl.filter((c) => c.kind !== "iot" && c.kind !== "camera").length} máy dùng · ${cl.filter((c) => c.kind === "iot" || c.kind === "camera").length} IoT`, "var(--pri)")}
    ${kpi(I.lock, "Đang chặn", S.d.blocked.length, S.d.temps.length ? `${S.d.temps.length} chặn tạm thời` : "thiết bị", "var(--bad)")}
    ${kpi(I.clock, "Hẹn giờ", S.d.rules.filter((r) => r.enabled).length, "lịch đang bật", "var(--f2)")}
  </div>
  <div class="split"><div class="grid g${Math.min(R.length, 3) === 3 ? 3 : 2}" style="align-items:start">${R.map(routerCard).join("")}</div>
  <div class="stack">${blockedCard()}${familyMini()}</div></div>`;
}
const kpi = (ic, l, n, d, c) => `<div class="kpi"><div class="l"><span style="color:${c}">${ic}</span>${l}</div><div class="n">${n}</div><div class="d">${d}</div></div>`;
function routerCard(r) {
  const d = r.device || {};
  const ssOn = r.ssids.filter((s) => s.enable).length;
  return `<div class="card rt">
    <div class="rt-h"><div class="floor-ic" style="background:${floorC(r.floor)}">${I.router}</div><div class="t"><b>${esc(r.floor)}</b><div class="meta nowrap">${esc(r.name)} · ${esc(d.model || "—")}</div></div>
      <span class="chip ${r.online ? "ok" : "bad"}"><span class="dot"></span>${r.online ? "Online" : "Offline"}</span></div>
    <div class="stats"><div><b>${r.clients.length}</b><span>thiết bị</span></div><div><b>${ssOn}/${r.ssids.length}</b><span>WiFi bật</span></div><div><b>${r.blocked.length}</b><span>bị chặn</span></div></div>
    <div class="meta">LAN ${esc(d.localIp || "—")} · WAN ${esc(d.wanIp || "—")}${!r.online && d.lastOnline ? ` · online lần cuối ${ago(d.lastOnline)}` : ""}</div>
    ${d.newFirmware ? `<div><span class="chip warn">Có firmware mới ${esc(d.newFirmware.replace("ReyeeOS ", ""))}</span></div>` : ""}
    ${r.errors?.length ? `<div class="meta" style="color:var(--bad)">${esc(r.errors[0])}</div>` : ""}
    <div style="display:flex;gap:8px"><button class="btn sm" data-go="wifi" style="flex:1">${I.wifi}WiFi</button><button class="btn sm red" data-reboot="${r.gid}" data-label="${esc(r.floor)}" style="flex:1">${I.power}Khởi động lại</button></div>
  </div>`;
}
function blockedCard() {
  const B = S.d.blocked;
  return `<div class="card"><div class="card-h"><h2>Đang bị chặn</h2><div class="grow"></div><span class="chip ${B.length ? "bad" : ""}">${B.length}</span></div>
    ${B.length ? `<div class="list fade-list">${B.map((b) => `<div class="row" data-dev="${b.mac}"><span class="av" style="background:var(--bad)">${kindIc(b.kind)}</span><div style="min-width:0"><div class="nm">${esc(b.name)}</div><div class="meta">${b.temp ? `Tự mở sau <b class="num">${left(b.temp.until)}</b>` : "Chặn đến khi mở"}${b.owner && person(b.owner) ? ` · ${esc(person(b.owner).name)}` : ""}</div></div><div class="rr"><button class="btn sm green" data-unblock-dev="${b.mac}">${I.unlock}<span class="lbl">Mở</span></button></div></div>`).join("")}</div>`
    : `<div class="empty"><b>Không có thiết bị nào bị chặn</b>Bấm vào một thiết bị để chặn hoặc giới hạn giờ.</div>`}</div>`;
}
function familyMini() {
  const ps = S.d.people;
  if (!ps.length) return isAdmin() ? `<div class="card"><div class="card-h"><h2>Gia đình</h2></div><div class="empty"><b>Chưa có thành viên</b>Thêm các em và gán thiết bị để khoá mạng theo người.<br><br><button class="btn pri sm" data-go="family">${I.plus}Thêm thành viên</button></div></div>` : "";
  return `<div class="card"><div class="card-h"><h2>Gia đình</h2><div class="grow"></div><button class="btn ghost sm" data-go="family">Xem ${I.chev}</button></div><div class="list">${ps.map((p) => { const pd = personDevices(p.id); const bl = personBlocked(p.id); return `<button class="row" data-go="family"><span class="av round" style="background:${pColor(p)}">${esc(ini(p.name))}</span><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="meta">${pd.on.length} online · hôm nay ${dur(usedMin(pd.all))}</div></div><span class="chip ${bl ? "bad" : pd.on.length ? "ok" : ""}">${bl ? "Đang khoá" : pd.on.length ? "Online" : "Offline"}</span></button>`; }).join("")}</div></div>`;
}

/* ---------- Trang: Thiết bị ---------- */
function vDevices() {
  const R = S.d.routers; const bs = blockedSet();
  let cl = clients();
  if (!isAdmin()) cl = cl.filter((c) => c.owner);
  if (S.floor !== "all") cl = cl.filter((c) => String(c.gid) === S.floor);
  const q = S.q.trim().toLowerCase();
  if (q) cl = cl.filter((c) => [c.name, c.ip, c.mac, fmtMac(c.mac), c.ssid, c.vendor, c.kindVi, person(c.owner)?.name].join(" ").toLowerCase().includes(q));
  cl.sort((a, b) => (a.kind === "iot" || a.kind === "camera") - (b.kind === "iot" || b.kind === "camera") || a.name.localeCompare(b.name, "vi"));
  const groups = {};
  cl.forEach((c) => (groups[c.floor] = groups[c.floor] || []).push(c));
  const blocked = S.d.blocked.filter((b) => isAdmin() || b.owner);
  return header("Thiết bị") + `
  ${blocked.length ? blockedCard().replace('<div class="card">', '<div class="card" style="margin-bottom:16px">') : ""}
  <div class="toolbar"><input class="search" id="q" placeholder="Tìm tên, IP, MAC, hãng…" value="${esc(S.q)}" autocomplete="off">
    <div class="seg"><button data-fl="all" class="${S.floor === "all" ? "on" : ""}">Tất cả</button>${R.map((r) => `<button data-fl="${r.gid}" class="${S.floor === String(r.gid) ? "on" : ""}">${esc(r.floor)}</button>`).join("")}</div></div>
  ${!isAdmin() && !cl.length ? `<div class="empty"><b>Chưa có thiết bị nào của các con</b>Xuân San cần gán thiết bị cho từng người trước.</div>` : ""}
  ${Object.keys(groups).length ? R.filter((r) => groups[r.floor]).map((r) => `<div class="card" style="margin-bottom:16px"><div class="card-h"><span class="floor-ic" style="background:${floorC(r.floor)};width:32px;height:32px;border-radius:10px">${I.router}</span><h2>${esc(r.floor)}</h2><small>${groups[r.floor].length} thiết bị</small></div><div class="list fade-list">${groups[r.floor].map((c) => devRow(c, bs)).join("")}</div></div>`).join("")
    : isAdmin() ? `<div class="empty"><b>Không tìm thấy thiết bị</b>${q ? "Thử từ khoá khác" : "Thiết bị sẽ hiện khi kết nối WiFi nhà"}</div>` : ""}`;
}
function devRow(c, bs) {
  const p = person(c.owner);
  const iot = c.kind === "iot" || c.kind === "camera";
  return `<button class="row" data-dev="${c.mac}">
    <span class="av" style="background:${bs.has(c.mac) ? "var(--bad)" : iot ? "#94a3b8" : floorC(c.floor)}">${kindIc(c.kind)}</span>
    <div style="min-width:0"><div class="nm">${esc(c.name)}${c.guess ? '<span class="chip" style="height:20px;font-size:11px">đoán</span>' : ""}</div>
      <div class="meta nowrap">${p ? `<b style="color:${pColor(p)}">${esc(p.name)}</b> · ` : ""}${esc(c.kindVi)}${c.vendor ? " · " + esc(c.vendor) : ""} · ${c.wired ? "Có dây" : `${esc(c.ssid)} ${esc(c.band)} ${sig(c.rssi)}`}</div></div>
    <div class="rr">${bs.has(c.mac) ? '<span class="chip bad">Chặn</span>' : `<span class="meta hide-m num">${bytes(c.traffic)}</span>`}${I.chev}</div></button>`;
}

/* ---------- Sheet chi tiết thiết bị ---------- */
function devSheet(mac) {
  const c = clients().find((x) => x.mac === mac);
  const k = (S.d.known || []).find((x) => x.mac === mac);
  const b = S.d.blocked.find((x) => x.mac === mac);
  const name = c?.name || b?.name || k?.name || fmtMac(mac);
  const kind = c?.kind || b?.kind || k?.kind || "unknown";
  const owner = c?.owner ?? b?.owner ?? k?.owner ?? null;
  const used = S.d.usage?.[mac] || 0;
  const tmp = tempOf("device:" + mac);
  sheet(`<div class="sheet-h"><span class="av" style="background:${b ? "var(--bad)" : floorC(c?.floor || k?.floor)};width:48px;height:48px">${kindIc(kind)}</span><div class="t"><h3>${esc(name)}</h3><p>${c ? `<span class="chip ok"><span class="dot"></span>Online · ${esc(c.floor)}</span>` : `<span class="chip">Offline</span>`} ${b ? `<span class="chip bad">${tmp ? "Mở sau " + left(tmp.until) : "Đang chặn"}</span>` : ""}</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    ${isAdmin() ? `<div class="field two"><div><label class="lbl">Tên thiết bị</label><input class="inp" id="dn" maxlength="40" value="${esc(c?.guess ? "" : name)}" placeholder="${esc(name)}"></div>
      <div><label class="lbl">Của ai</label><select class="inp" id="do"><option value="">— Chưa gán —</option>${S.d.people.map((p) => `<option value="${p.id}" ${owner === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div></div>
      <button class="btn sm" id="ds" style="margin:-4px 0 16px">Lưu tên & chủ sở hữu</button>` : ""}
    <dl class="kv">
      <dt>Loại</dt><dd>${esc(c?.kindVi || S.d.kinds?.[kind] || "—")}${c?.vendor || k?.vendor ? " · " + esc(c?.vendor || k?.vendor) : ""}${c?.random ? " · MAC riêng tư" : ""}</dd>
      ${c ? `<dt>Kết nối</dt><dd>${c.wired ? "Có dây" : `${esc(c.ssid)} · ${esc(c.band)} · ${c.rssi} dBm`}</dd><dt>IP</dt><dd>${esc(c.ip)}</dd><dt>Dữ liệu</dt><dd>${bytes(c.traffic)} · online từ ${c.since ? timeVN(c.since) : "—"}</dd>` : `<dt>Thấy lần cuối</dt><dd>${k ? ago(k.lastSeen) + " · " + esc(k.floor) : "—"}</dd>`}
      <dt>Online hôm nay</dt><dd>${dur(used)}</dd>
      <dt>MAC</dt><dd class="num">${fmtMac(mac)}</dd>
    </dl>
    ${c?.random && isAdmin() ? `<div class="alert" style="font-size:13px">${I.alert}<div>Máy này dùng <b>MAC riêng tư</b> nên không đọc được hãng. Mẹo: tắt WiFi trên máy nghi ngờ → thiết bị biến mất khỏi danh sách là đúng máy. Trên iPhone tắt "Địa chỉ Wi-Fi riêng tư" cho mạng nhà để nhận diện ổn định.</div></div>` : ""}
    <div class="lbl">${b ? "Thiết bị đang bị chặn" : "Chặn truy cập mạng"}</div>
    ${b ? `<button class="btn green lg block" id="dub">${I.unlock}Mở chặn ngay</button>` : blockOpts()}
    ${isAdmin() ? `<div class="lbl" style="margin-top:18px">Giới hạn thông minh</div><div class="opts"><button class="btn sm" id="dq">${I.clock}Giới hạn giờ/ngày</button><button class="btn sm" id="dw">${I.lock}Giờ nghỉ hằng ngày</button></div>` : ""}`);
  $("[data-close]").onclick = closeSheet;
  if ($("#ds")) $("#ds").onclick = () => act($("#ds"), async () => { await api("/device", { body: { mac, name: $("#dn").value.trim(), owner: $("#do").value || null } }); await load(); closeSheet(); }, "Đã lưu");
  if ($("#dub")) $("#dub").onclick = () => act($("#dub"), async () => { await api("/unblock", { body: { target: { kind: "device", id: mac } } }); await load(); closeSheet(); }, `Đã mở chặn ${name}`);
  bindBlockOpts({ kind: "device", id: mac }, name);
  if ($("#dq")) $("#dq").onclick = () => ruleSheet({ type: "quota", target: { kind: owner ? "person" : "device", id: owner || mac }, minutes: 120 });
  if ($("#dw")) $("#dw").onclick = () => ruleSheet({ type: "block", target: { kind: owner ? "person" : "device", id: owner || mac }, from: "22:00", to: "06:00" });
}
const BLOCK_OPTS = [[30, "30 phút"], [60, "1 giờ"], [120, "2 giờ"], ["mid", "Đến 0h"], [0, "Đến khi mở"]];
function blockOpts() { return `<div class="qa">${BLOCK_OPTS.map(([m, l]) => `<button class="btn red" data-bm="${m}">${l}</button>`).join("")}</div>`; }
function bindBlockOpts(target, label) {
  $$("[data-bm]").forEach((b) => (b.onclick = async () => {
    let m = b.dataset.bm;
    if (m === "mid") { const d = new Date(); const vnNow = new Date(Date.now() + 7 * 3600e3); m = Math.max(1, Math.round((24 * 60) - (vnNow.getUTCHours() * 60 + vnNow.getUTCMinutes()))); }
    m = Number(m);
    await act(b, async () => { await api("/block", { body: { target, minutes: m } }); await load(); closeSheet(); }, `Đã chặn ${label}${m ? " · tự mở sau " + dur(m) : ""}`).catch(() => {});
  }));
}

/* ---------- Trang: Gia đình ---------- */
function vFamily() {
  const ps = S.d.people;
  const add = isAdmin() ? `<button class="btn pri" id="padd">${I.plus}<span>Thêm người</span></button>` : "";
  const routers = !isAdmin() ? `<div class="card" style="margin-top:16px"><div class="card-h"><h2>Router các tầng</h2></div><div class="list">${S.d.routers.map((r) => `<div class="row" style="cursor:default"><span class="floor-ic" style="background:${floorC(r.floor)}">${I.router}</span><div><div class="nm">${esc(r.floor)}</div><div class="meta">${r.clients.length} thiết bị · <span style="color:${r.online ? "var(--ok)" : "var(--bad)"}">${r.online ? "đang chạy" : "mất kết nối"}</span></div></div><div class="rr"><button class="btn sm red" data-reboot="${r.gid}" data-label="${esc(r.floor)}">${I.power}<span class="lbl">Khởi động lại</span></button></div></div>`).join("")}</div></div>` : "";
  return header(isAdmin() ? "Gia đình" : `Chào ${esc(S.me.name)}`, add) + (ps.length ? `<div class="grid g3 fade-list">${ps.map(personCard).join("")}</div>`
    : `<div class="empty"><b>Chưa có thành viên</b>${isAdmin() ? "Thêm từng em, rồi gán điện thoại / laptop / máy chơi game cho em đó. Sau đó có thể khoá mạng theo người, đặt giờ nghỉ, giới hạn số giờ mỗi ngày." : "Xuân San chưa thêm thành viên nào."}</div>`) + routers;
}
function personCard(p) {
  const pd = personDevices(p.id); const bl = personBlocked(p.id); const t = tempOf("person:" + p.id);
  const used = usedMin(pd.all); const q = quotaOf(p.id);
  const pct = q ? Math.min(100, (used / q.minutes) * 100) : 0;
  return `<div class="card person">
    <div class="person-h"><span class="av round" style="background:${pColor(p)};width:48px;height:48px;font-size:17px">${esc(ini(p.name))}</span><div class="t"><b>${esc(p.name)}</b><div class="meta">${pd.all.length} thiết bị · ${pd.on.length} đang online</div></div>
      ${isAdmin() ? `<button class="btn ghost sm icon" data-pedit="${p.id}" aria-label="Sửa">${I.edit}</button>` : ""}</div>
    <div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span class="meta">Online hôm nay</span><b class="num">${dur(used)}${q ? ` / ${dur(q.minutes)}` : ""}</b></div>${q ? `<div class="bar"><i style="width:${pct}%;background:${pct >= 100 ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--pri)"}"></i></div>` : ""}</div>
    ${bl ? `<div class="alert bad" style="margin:0">${I.lock}<div><b>Đang khoá mạng</b>${t ? ` · tự mở sau ${left(t.until)}${t.reason ? ` (${esc(t.reason)})` : ""}` : ""}</div></div>` : ""}
    ${pd.all.length ? `<div class="meta">${[...pd.on, ...pd.off].slice(0, 4).map((x) => esc(x.name)).join(" · ")}${pd.all.length > 4 ? ` +${pd.all.length - 4}` : ""}</div>` : `<div class="meta" style="color:var(--warn)">Chưa gán thiết bị — vào Thiết bị để gán</div>`}
    ${bl ? `<button class="btn green lg block" data-punblock="${p.id}">${I.unlock}Mở mạng cho ${esc(p.name)}</button>`
      : `<div class="qa" style="grid-template-columns:repeat(3,1fr)">${[[30, "30′"], [60, "1 giờ"], [0, "Khoá"]].map(([m, l]) => `<button class="btn red" data-pblock="${p.id}" data-m="${m}" ${pd.all.length ? "" : "disabled"}>${l}</button>`).join("")}</div>`}
  </div>`;
}
function personSheet(p) {
  const pd = p ? personDevices(p.id) : null;
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>${p ? "Sửa thành viên" : "Thêm thành viên"}</h3><p>Gán thiết bị trong trang Thiết bị (bấm vào thiết bị → Của ai).</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    <div class="field"><label class="lbl">Tên</label><input class="inp" id="pn" maxlength="30" value="${esc(p?.name || "")}" placeholder="vd: Bé Na"></div>
    ${p ? `<div class="lbl">Thiết bị của ${esc(p.name)}</div><div class="list" style="margin-bottom:8px">${[...pd.on, ...pd.off].map((x) => `<button class="row" data-dev="${x.mac}"><span class="av soft">${kindIc(x.kind)}</span><div class="nm">${esc(x.name)}</div>${I.chev}</button>`).join("") || '<div class="meta">Chưa có</div>'}</div>
      <div class="opts"><button class="btn sm" id="pq">${I.clock}Giới hạn giờ/ngày</button><button class="btn sm" id="pw">${I.lock}Giờ nghỉ</button></div>` : ""}
    <div class="foot">${p ? `<button class="btn red" id="pdel">${I.trash}Xoá</button>` : ""}<button class="btn pri" id="psave">Lưu</button></div>`);
  $("[data-close]").onclick = closeSheet;
  $$("[data-dev]", $("#sheet")).forEach((b) => (b.onclick = () => devSheet(b.dataset.dev)));
  $("#psave").onclick = () => act($("#psave"), async () => { await api("/people", { body: { id: p?.id, name: $("#pn").value } }); await load(); closeSheet(); }, "Đã lưu");
  if (p) {
    $("#pdel").onclick = async () => { if (await confirmBox(`Xoá ${esc(p.name)}?`, "Thiết bị sẽ bỏ gán và các lịch theo người này cũng bị xoá.", "Xoá", true)) act(null, async () => { await api("/people/" + p.id, { method: "DELETE" }); await load(); }, "Đã xoá"); };
    $("#pq").onclick = () => ruleSheet({ type: "quota", target: { kind: "person", id: p.id }, minutes: 120 });
    $("#pw").onclick = () => ruleSheet({ type: "block", target: { kind: "person", id: p.id }, from: "22:00", to: "06:00" });
  }
}

/* ---------- Trang: WiFi (admin) ---------- */
function vWifi() {
  return header("Mạng WiFi", `<button class="btn pri" id="wadd">${I.plus}<span>Tạo WiFi</span></button>`) + `
  <div class="alert">${I.eye}<div>WiFi <b>ẩn</b> (IoT cho camera, hub…) vẫn hoạt động bình thường, chỉ không hiện khi dò WiFi. Tắt nhầm WiFi IoT sẽ làm camera mất kết nối.</div></div>
  <div class="grid g3">${S.d.routers.map((r) => `<div class="card"><div class="card-h"><span class="floor-ic" style="background:${floorC(r.floor)};width:36px;height:36px;border-radius:11px">${I.router}</span><div><h2>${esc(r.floor)}</h2><small>${esc(r.name)}</small></div></div>
    <div class="list">${r.ssids.map((s) => `<div class="row" style="cursor:default;grid-template-columns:minmax(0,1fr) auto auto"><div style="min-width:0"><div class="nm">${esc(s.name)}</div><div class="meta">${s.bands.join(" · ")}${s.hidden ? " · <b>ẩn</b>" : ""}${s.iot ? " · IoT" : ""} · ${r.clients.filter((c) => c.ssid === s.name).length} máy</div></div>
      <div style="display:flex"><button class="btn ghost sm icon" data-wedit="${s.id}" data-gid="${r.gid}" aria-label="Cài đặt">${I.gear}</button><button class="btn ghost sm icon" data-wdel="${s.id}" data-gid="${r.gid}" data-name="${esc(s.name)}" aria-label="Xoá">${I.trash}</button></div>
      <button class="sw ${s.enable ? "on" : ""}" role="switch" aria-checked="${s.enable}" data-wt="${s.id}" data-gid="${r.gid}" data-name="${esc(s.name)}" data-iot="${s.iot ? 1 : 0}"></button></div>`).join("") || '<div class="empty">Không đọc được WiFi</div>'}</div></div>`).join("")}</div>`;
}
function wifiCreateSheet() {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>Tạo WiFi mới</h3><p>Router áp dụng trong khoảng 30–60 giây.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    <div class="field"><label class="lbl">Tên WiFi</label><input class="inp" id="wn" maxlength="32" placeholder="vd: Nha Khach"></div>
    <div class="field"><label class="lbl">Mật khẩu (8–63 ký tự)</label><input class="inp" id="wp" maxlength="63" autocomplete="new-password"></div>
    <div class="field"><label class="lbl">Băng tần</label><div class="opts" id="wb"><button class="opt on" data-b="2.4G">2.4G</button><button class="opt on" data-b="5G">5G</button></div><div class="hint">Thiết bị IoT (camera, quạt…) thường chỉ chạy 2.4G.</div></div>
    <div class="field"><label class="lbl">Router</label>${S.d.routers.map((r) => `<label class="chk"><input type="checkbox" data-wg="${r.gid}" checked>${esc(r.floor)}<small>${esc(r.name)}</small></label>`).join("")}</div>
    <label class="chk"><input type="checkbox" id="wh">Ẩn WiFi (không hiện khi dò)</label>
    <label class="chk"><input type="checkbox" id="wi">Cách ly thiết bị (khách không thấy nhau)</label>
    <div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="wc">Tạo WiFi</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $$("#wb .opt").forEach((b) => (b.onclick = () => b.classList.toggle("on")));
  $("#wc").onclick = () => act($("#wc"), async () => {
    await api("/wifi/create", { timeout: 60000, body: { name: $("#wn").value.trim(), password: $("#wp").value, bands: $$("#wb .opt.on").map((b) => b.dataset.b), gids: $$("[data-wg]:checked").map((c) => Number(c.dataset.wg)), hidden: $("#wh").checked, isolation: $("#wi").checked } });
    closeSheet(); await load();
  }, "Đã tạo WiFi").catch(() => {});
}

const DAYK = [["mon", "T2"], ["tue", "T3"], ["wed", "T4"], ["thu", "T5"], ["fri", "T6"], ["sat", "T7"], ["sun", "CN"]];
function wifiEditSheet(gid, id) {
  const r = S.d.routers.find((x) => x.gid === gid); const w = r?.ssids.find((x) => x.id === id);
  if (!w) return toast("Không tìm thấy WiFi", 1);
  const sw = (k, on, label, hint) => `<label class="chk"><input type="checkbox" data-k="${k}" ${on ? "checked" : ""}><div><div>${label}</div>${hint ? `<div class="meta" style="font-size:12px">${hint}</div>` : ""}</div></label>`;
  const sch = w.schedule?.days;
  sheet(`<div class="grab"></div><div class="sheet-h"><span class="floor-ic" style="background:${floorC(r.floor)};width:44px;height:44px">${I.wifi}</span><div class="t"><h3>${esc(w.name)}</h3><p>${esc(r.floor)} · ${w.enable ? "đang bật" : "đang tắt"}${w.hidden ? " · ẩn" : ""}</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    <div class="field"><label class="lbl">Tên WiFi</label><input class="inp" id="en" maxlength="32" value="${esc(w.name)}"></div>
    <div class="field"><label class="lbl">Mật khẩu mới</label><div style="display:flex;gap:8px"><input class="inp" id="ep" maxlength="63" autocomplete="new-password" placeholder="Để trống = giữ mật khẩu cũ"><button class="btn" id="eshow" type="button">${I.eye}<span class="hide-m">Xem hiện tại</span></button></div><div class="hint" id="ecur"></div></div>
    <div class="field"><label class="lbl">Băng tần</label><div class="opts" id="eb">${["2.4G", "5G"].map((b) => `<button class="opt ${w.bands.includes(b) ? "on" : ""}" data-b="${b}">${b}</button>`).join("")}</div></div>
    <div class="lbl">Nâng cao</div>
    ${sw("hidden", w.hidden, "Ẩn WiFi", "Không hiện khi dò WiFi — dùng cho mạng IoT")}
    ${sw("isolation", w.isolation2, "Cách ly thiết bị", "Các máy trong mạng không thấy nhau (hợp với khách / IoT)")}
    ${sw("bandSteering", w.bandSteering, "Band steering", "Tự đẩy máy mạnh lên 5G")}
    ${sw("fastRoaming", w.fastRoaming, "Chuyển vùng nhanh (802.11r)", "Đi giữa các tầng ít bị rớt — một số máy cũ không hỗ trợ")}
    ${sw("gaming", w.gaming, "Ưu tiên chơi game", "Giảm trễ cho game, có thể ảnh hưởng xem video")}
    <div class="field" style="margin-top:12px"><div><label class="lbl">Tối đa số máy</label><input class="inp" id="eul" type="number" min="0" max="256" inputmode="numeric" value="${w.usersLimit || ""}" placeholder="0 = không giới hạn"></div></div>
    <div class="field two"><div><label class="lbl">Mỗi máy · tải xuống (kbps)</label><input class="inp" id="edr" inputmode="numeric" value="${esc(w.downRate)}" placeholder="Không giới hạn"></div><div><label class="lbl">Mỗi máy · tải lên (kbps)</label><input class="inp" id="eur" inputmode="numeric" value="${esc(w.upRate)}" placeholder="Không giới hạn"></div></div>
    <div class="field two"><div><label class="lbl">Cả mạng · tải xuống (kbps)</label><input class="inp" id="ewdr" inputmode="numeric" value="${esc(w.wlanDownRate)}" placeholder="Không giới hạn"></div><div><label class="lbl">Cả mạng · tải lên (kbps)</label><input class="inp" id="ewur" inputmode="numeric" value="${esc(w.wlanUpRate)}" placeholder="Không giới hạn"></div></div>
    ${sch ? `<div class="lbl">Lịch phát WiFi có sẵn trên router</div><div class="tbl-wrap" style="margin-bottom:8px"><table class="tbl"><tbody>${DAYK.map(([k, l]) => `<tr><td><b>${l}</b></td><td>${(sch[k] || []).map((x) => x.join("–")).join(", ") || "—"}</td></tr>`).join("")}</tbody></table></div><div class="hint" style="margin-bottom:8px">Ngoài các khung giờ này router tự tắt WiFi. Muốn khung giờ mới, dùng mục Hẹn giờ.</div>` : ""}
    <div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="esave">Lưu thay đổi</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $$("#eb .opt").forEach((b) => (b.onclick = () => b.classList.toggle("on")));
  $("#eshow").onclick = () => act($("#eshow"), async () => { const r2 = await api("/wifi/secret", { body: { gid, ssidId: id } }); $("#ecur").innerHTML = `Mật khẩu hiện tại: <b style="user-select:all">${esc(r2.password || "(không có)")}</b>`; });
  $("#esave").onclick = async () => {
    const body = { gid, ssidId: id, oldName: w.name };
    const nm = $("#en").value.trim(); if (nm !== w.name) body.name = nm;
    const pw = $("#ep").value; if (pw) body.password = pw;
    const bands = $$("#eb .opt.on").map((b) => b.dataset.b); if (bands.join() !== w.bands.join()) body.bands = bands;
    const cur = { hidden: w.hidden, isolation: w.isolation2, bandSteering: w.bandSteering, fastRoaming: w.fastRoaming, gaming: w.gaming };
    $$("[data-k]", $("#sheet")).forEach((c) => { if (c.checked !== cur[c.dataset.k]) body[c.dataset.k] = c.checked; });
    const ul = Number($("#eul").value || 0); if (ul !== (w.usersLimit || 0)) body.usersLimit = ul;
    [["edr", "downRate"], ["eur", "upRate"], ["ewdr", "wlanDownRate"], ["ewur", "wlanUpRate"]].forEach(([el, k]) => { const v = $("#" + el).value.trim(); if (v !== (w[k] || "")) body[k] = v; });
    if (Object.keys(body).length === 3) return toast("Chưa thay đổi gì");
    const risky = body.name || body.password || body.bands || body.hidden !== undefined;
    if (risky && !(await confirmBox("Lưu thay đổi WiFi?", `${body.name || body.password ? "Mọi thiết bị đang dùng mạng này sẽ phải <b>kết nối lại</b>" + (body.password ? " bằng mật khẩu mới" : "") + ". " : ""}${w.iot ? "<b>Đây là WiFi IoT</b> — camera, hub cũng phải cài lại nếu đổi tên/mật khẩu." : ""} Router áp dụng sau ~30–60 giây.`, "Lưu", true))) return wifiEditSheet(gid, id);
    try { await api("/wifi/update", { body, timeout: 60000 }); toast("Đã lưu — router áp dụng sau ~30–60 giây"); closeSheet(); await load(); }
    catch (e) { toast(e.message, 1); }
  };
}

/* ---------- Trang: Hẹn giờ (admin) ---------- */
const RT = { wifi: ["Tắt/bật WiFi", "wifi", "var(--f3)"], block: ["Giờ nghỉ (khoá mạng)", "lock", "var(--f2)"], quota: ["Giới hạn giờ/ngày", "clock", "var(--f0)"], reboot: ["Khởi động lại", "power", "var(--bad)"] };
function tgtName(t) { if (!t) return "—"; return t.kind === "person" ? person(t.id)?.name || "(đã xoá)" : devName(t.id); }
function ruleTime(r) { return r.type === "reboot" ? r.at : r.type === "wifi" ? `${r.offAt} → ${r.onAt}` : r.type === "block" ? `${r.from} → ${r.to}` : `${dur(r.minutes)}/ngày`; }
function ruleDesc(r) {
  if (r.type === "reboot") return (r.gids || []).map((g) => S.d.routers.find((x) => x.gid === g)?.floor || g).join(", ");
  if (r.type === "wifi") return (r.targets || []).map((t) => { const rt = S.d.routers.find((x) => x.gid === t.gid); return t.ssidIds.map((id) => rt?.ssids.find((s) => s.id === id)?.name || "WiFi").join(", ") + " · " + (rt?.floor || ""); }).join(" | ");
  return tgtName(r.target);
}
function vRules() {
  const R = S.d.rules;
  return header("Hẹn giờ", `<button class="btn pri" id="radd">${I.plus}<span>Thêm lịch</span></button>`) + `<div class="alert" style="background:var(--pri-soft);color:#1e3a8a">${I.clock}<div>Lịch chạy trên máy chủ mỗi phút theo giờ Việt Nam — vẫn chạy khi điện thoại, MacBook tắt.</div></div>
  ${R.length ? `<div class="grid g2 fade-list">${R.map((r) => { const [l, ic, c] = RT[r.type]; return `<div class="card" style="opacity:${r.enabled ? 1 : .55};display:flex;gap:14px;align-items:flex-start"><span class="floor-ic" style="background:${c}">${I[ic]}</span><div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:700;letter-spacing:-.02em" class="num">${esc(ruleTime(r))}</div><div class="meta" style="margin:2px 0 8px">${esc(r.name)} · ${esc(ruleDesc(r))}</div><div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="${r.days.includes(d) ? "on" : ""}">${DAYS[d]}</span>`).join("")}</div></div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px"><button class="sw ${r.enabled ? "on" : ""}" role="switch" aria-checked="${r.enabled}" data-rt="${r.id}"></button><div style="display:flex"><button class="btn ghost sm icon" data-re="${r.id}" aria-label="Sửa">${I.edit}</button><button class="btn ghost sm icon" data-rd="${r.id}" aria-label="Xoá">${I.trash}</button></div></div></div>`; }).join("")}</div>`
    : `<div class="empty"><b>Chưa có lịch nào</b>Ví dụ: tắt WiFi phòng các em 23:00 → 6:00, khoá mạng giờ học, giới hạn 2 giờ chơi mỗi ngày, khởi động lại router 4:00 sáng.</div>`}`;
}
function ruleSheet(init) {
  const R = S.d.routers;
  const f = Object.assign({ type: "block", name: "", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, offAt: "23:00", onAt: "06:00", at: "04:00", from: "22:00", to: "06:00", minutes: 120, gids: R.map((r) => r.gid), targets: [], target: null }, JSON.parse(JSON.stringify(init || {})));
  const known = new Map(); (S.d.known || []).forEach((k) => known.set(k.mac, k.name)); clients().forEach((c) => known.set(c.mac, c.name));
  const draw = () => {
    const tsel = (g, id) => f.targets.some((t) => t.gid === g && t.ssidIds.includes(id));
    const tv = f.target ? `${f.target.kind}:${f.target.id}` : "";
    sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>${f.id ? "Sửa lịch" : "Thêm lịch"}</h3><p>Giờ Việt Nam. Giờ kết thúc nhỏ hơn giờ bắt đầu = kéo qua sáng hôm sau.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
      <div class="field"><div class="opts" id="ty">${Object.entries(RT).map(([k, [l]]) => `<button class="opt ${f.type === k ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div></div>
      ${f.type === "block" || f.type === "quota" ? `<div class="field"><label class="lbl">Áp dụng cho</label><select class="inp" id="tg"><option value="">— Chọn người hoặc thiết bị —</option>${S.d.people.length ? `<optgroup label="Người">${S.d.people.map((p) => `<option value="person:${p.id}" ${tv === "person:" + p.id ? "selected" : ""}>${esc(p.name)} (tất cả thiết bị)</option>`).join("")}</optgroup>` : ""}<optgroup label="Thiết bị">${[...known].sort((a, b) => a[1].localeCompare(b[1], "vi")).map(([m, n]) => `<option value="device:${m}" ${tv === "device:" + m ? "selected" : ""}>${esc(n)}</option>`).join("")}</optgroup></select></div>` : ""}
      ${f.type === "block" ? `<div class="field two"><div><label class="lbl">Khoá lúc</label><input class="inp" type="time" id="t1" value="${f.from}"></div><div><label class="lbl">Mở lúc</label><input class="inp" type="time" id="t2" value="${f.to}"></div></div>` : ""}
      ${f.type === "quota" ? `<div class="field"><label class="lbl">Tối đa mỗi ngày</label><div class="opts" id="qm">${[30, 60, 90, 120, 180, 240].map((m) => `<button class="opt ${f.minutes === m ? "on" : ""}" data-m="${m}">${dur(m)}</button>`).join("")}</div><div class="hint">Tính theo thời gian thiết bị kết nối WiFi. Hết giờ sẽ tự khoá đến 0h, sáng mai tự mở.</div></div>` : ""}
      ${f.type === "wifi" ? `<div class="field two"><div><label class="lbl">Tắt lúc</label><input class="inp" type="time" id="t1" value="${f.offAt}"></div><div><label class="lbl">Bật lại lúc</label><input class="inp" type="time" id="t2" value="${f.onAt}"></div></div><div class="field"><label class="lbl">Chọn WiFi</label>${R.map((rt) => rt.ssids.map((s) => `<label class="chk"><input type="checkbox" data-tg="${rt.gid}" data-id="${s.id}" ${tsel(rt.gid, s.id) ? "checked" : ""}>${esc(s.name)}<small>${esc(rt.floor)}${s.iot ? " · IoT" : ""}</small></label>`).join("")).join("")}</div>` : ""}
      ${f.type === "reboot" ? `<div class="field"><label class="lbl">Giờ khởi động lại</label><input class="inp" type="time" id="t1" value="${f.at}"></div><div class="field"><label class="lbl">Router</label>${R.map((rt) => `<label class="chk"><input type="checkbox" data-g="${rt.gid}" ${f.gids.includes(rt.gid) ? "checked" : ""}>${esc(rt.floor)}</label>`).join("")}</div>` : ""}
      <div class="field"><label class="lbl">Ngày lặp lại</label><div class="opts" id="dy">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="opt ${f.days.includes(d) ? "on" : ""}" data-d="${d}" style="min-width:48px">${DAYS[d]}</button>`).join("")}</div></div>
      <div class="field"><label class="lbl">Tên lịch (tuỳ chọn)</label><input class="inp" id="nm" maxlength="60" value="${esc(f.name)}" placeholder="vd: Giờ ngủ của Na"></div>
      <div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="rs">Lưu lịch</button></div>`);
    const sync = () => {
      f.name = $("#nm").value; const a = $("#t1")?.value, b = $("#t2")?.value;
      if ($("#tg")) { const v = $("#tg").value; f.target = v ? { kind: v.split(":")[0], id: v.split(":")[1] } : null; }
      if (f.type === "block") { f.from = a; f.to = b; }
      if (f.type === "wifi") { f.offAt = a; f.onAt = b; const m = {}; $$("[data-tg]:checked").forEach((c) => (m[c.dataset.tg] = m[c.dataset.tg] || []).push(Number(c.dataset.id))); f.targets = Object.entries(m).map(([g, ids]) => ({ gid: Number(g), ssidIds: ids })); }
      if (f.type === "reboot") { f.at = a; f.gids = $$("[data-g]:checked").map((c) => Number(c.dataset.g)); }
    };
    $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
    $("#ty").onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; sync(); f.type = b.dataset.t; draw(); };
    $("#dy").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; const d = Number(b.dataset.d); f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]; b.classList.toggle("on"); };
    if ($("#qm")) $("#qm").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; f.minutes = Number(b.dataset.m); $$("#qm .opt").forEach((x) => x.classList.toggle("on", x === b)); };
    $("#rs").onclick = () => { sync(); if (!f.days.length) return toast("Chọn ít nhất 1 ngày", 1); act($("#rs"), async () => { await api("/rules", { body: f }); await load(); closeSheet(); }, "Đã lưu lịch").catch(() => {}); };
  };
  draw();
}

/* ---------- Trang: Dữ liệu (admin) ---------- */
async function loadInv() { try { S.inv = await api("/inventory", { timeout: 60000 }); } catch (e) { S.inv = { error: e.message }; } if (S.tab === "data") render(); }
function vData() {
  const K = S.d.known || [];
  const byFloor = {}; K.forEach((k) => (byFloor[k.floor || "Khác"] = byFloor[k.floor || "Khác"] || []).push(k));
  const inv = S.inv;
  return header("Dữ liệu hệ thống", `<button class="btn" id="exj">${I.dl}<span>JSON</span></button><button class="btn" id="exc">${I.dl}<span>CSV</span></button>`) + `
  <div class="grid g4" style="margin-bottom:16px">${kpi(I.router, "Router", S.d.routers.length, "3 tầng", "var(--pri)")}${kpi(I.wifi, "Mạng WiFi", S.d.routers.reduce((a, r) => a + r.ssids.length, 0), `${S.d.routers.reduce((a, r) => a + r.ssids.filter((s) => s.hidden).length, 0)} mạng ẩn`, "var(--f3)")}${kpi(I.devices, "Thiết bị từng kết nối", K.length, "lưu từ khi bật hệ thống", "var(--f1)")}${kpi(I.family, "Đã gán chủ", K.filter((k) => k.owner).length, `${S.d.people.length} thành viên`, "var(--f2)")}</div>
  ${!inv ? `<div class="skel" style="min-height:120px;margin-bottom:16px"></div>` : inv.error ? `<div class="alert bad">${I.alert}${esc(inv.error)}</div>` : inv.routers.map((r) => { const hw = r.hardware?.[0] || {}; const ss = r.wifi?.ssidList || []; return `<div class="card" style="margin-bottom:16px"><div class="card-h"><span class="floor-ic" style="background:${floorC(r.floor)};width:36px;height:36px;border-radius:11px">${I.router}</span><div><h2>${esc(r.floor)} · ${esc(r.project.name)}</h2><small>${esc(hw.productClass || "")} · SN ${esc(hw.serialNumber || "")}</small></div></div>
    <dl class="kv" style="grid-template-columns:auto 1fr auto 1fr"><dt>Firmware</dt><dd>${esc(String(hw.softwareVersion || "").split(";")[0])}</dd><dt>Phần cứng</dt><dd>${esc(hw.hardwareVersion || "")}</dd><dt>MAC</dt><dd>${esc(hw.mac || "")}</dd><dt>IP LAN/WAN</dt><dd>${esc(hw.localIp || "")} / ${esc(hw.cpeIp || "")}</dd><dt>Chế độ</dt><dd>${esc(hw.devMode || "")}</dd><dt>Múi giờ</dt><dd>${esc(r.project.timezone || hw.timezone || "")}</dd></dl>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>WiFi</th><th>Bật</th><th>Ẩn</th><th>Băng tần</th><th>Bảo mật</th><th>VLAN</th><th>Chuẩn</th><th>Cách ly</th><th>Band steering</th></tr></thead><tbody>${ss.map((s) => `<tr><td><b>${esc(s.ssidName)}</b></td><td>${s.enable === "true" || s.enable === true ? "✓" : "—"}</td><td>${s.ishidden === "true" || s.ishidden === true ? "✓" : "—"}</td><td>${esc(String(s.relatedRadio || "").replace("1", "2.4G").replace("2", "5G"))}</td><td>${esc(s.encryptionModeDesc || s.encryptionMode || "")}</td><td>${esc(s.vlanId ?? "")}</td><td>${esc(s.wirelessModeType || "")}</td><td>${s.l2iso === true || s.l2iso === "true" ? "✓" : "—"}</td><td>${s.bandSelectEnable === true || s.bandSelectEnable === "true" ? "✓" : "—"}</td></tr>`).join("")}</tbody></table></div></div>`; }).join("")}
  <div class="card"><div class="card-h"><h2>Tất cả thiết bị theo tầng</h2><small>${K.length} thiết bị</small></div>${Object.entries(byFloor).map(([fl, arr]) => `<div class="lbl" style="margin-top:10px;color:${floorC(fl)}">${esc(fl)} · ${arr.length}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên</th><th>Loại</th><th>Hãng</th><th>Của ai</th><th>WiFi</th><th>MAC</th><th>Lần đầu</th><th>Lần cuối</th></tr></thead><tbody>${arr.map((k) => `<tr data-dev="${k.mac}" style="cursor:pointer"><td><b>${esc(k.name)}</b></td><td>${esc(S.d.kinds?.[k.kind] || k.kind)}</td><td>${esc(k.vendor)}</td><td>${esc(person(k.owner)?.name || "")}</td><td>${esc(k.ssid)}</td><td class="num">${fmtMac(k.mac)}</td><td>${timeVN(k.firstSeen)}</td><td>${ago(k.lastSeen)}</td></tr>`).join("")}</tbody></table></div>`).join("") || '<div class="empty">Chưa có dữ liệu</div>'}</div>`;
}
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/* ---------- Nhật ký / Cài đặt ---------- */
async function loadLog() { try { S.log = (await api("/log")).log; } catch (e) { toast(e.message, 1); } if (S.tab === "log") render(); }
function vLog() {
  return header("Nhật ký") + `<div class="card">${S.log.length ? `<div class="list fade-list">${S.log.slice(0, 150).map((l) => `<div class="row" style="cursor:default"><span class="av ${l.ok ? "" : ""}" style="background:${l.ok ? "var(--ok-soft)" : "var(--bad-soft)"};color:${l.ok ? "var(--ok)" : "var(--bad)"}">${l.ok ? I.clock : I.alert}</span><div style="min-width:0"><div style="font-weight:500">${esc(l.text)}</div><div class="meta">${esc(l.by)} · ${timeVN(l.t)} · ${ago(l.t)}</div></div><span></span></div>`).join("")}</div>` : `<div class="empty"><b>Chưa có hoạt động</b>Mọi thao tác bấm tay và hẹn giờ sẽ ghi ở đây.</div>`}</div>`;
}
function vSettings() {
  return header(isAdmin() ? "Cài đặt" : "Tài khoản") + `<div class="grid g2"><div class="card"><div class="card-h"><h2>Tài khoản đang dùng</h2></div><div class="row" style="cursor:default"><span class="av round" style="background:var(--pri)">${esc(ini(S.me.name))}</span><div><div class="nm">${esc(S.me.name)}</div><div class="meta">${isAdmin() ? "Quản trị — toàn quyền" : "Phụ huynh — khoá/mở mạng các con, khởi động lại router"}</div></div><span></span></div><button class="btn red block" id="lo2" style="margin-top:12px">${I.out}Đăng xuất</button>${S.me.uid !== "san" ? '<p class="meta" style="margin-top:12px">App tự khoá khi rời đi quá 5 phút để các em không mở được.</p>' : ""}</div>
  ${isAdmin() ? `<div class="card"><div class="card-h"><h2>Mã PIN</h2></div><p class="meta" style="margin-bottom:12px">Nên đổi PIN khác năm sinh để các em không đoán được.</p><div id="acc" class="list"><div class="meta">Đang tải…</div></div></div>
  <div class="card"><div class="card-h"><h2>Cài lên màn hình chính</h2></div><p class="meta">iPhone: Safari → Chia sẻ → <b>Thêm vào MH chính</b>. Android: Chrome → ⋮ → <b>Cài đặt ứng dụng</b>. Mở như app, toàn màn hình.</p></div>` : ""}</div>`;
}
async function loadAccounts() {
  try { const { users } = await api("/accounts"); const el = $("#acc"); if (!el) return;
    el.innerHTML = users.map((u, i) => `<div class="row" style="cursor:default"><span class="av round" style="background:${PEOPLE_C[i % 6]}">${esc(ini(u.name))}</span><div><div class="nm">${esc(u.name)}</div><div class="meta">${u.role === "admin" ? "Quản trị" : "Phụ huynh"}</div></div><button class="btn sm" data-pin="${u.id}" data-n="${esc(u.name)}">Đổi PIN</button></div>`).join("");
    $$("[data-pin]").forEach((b) => (b.onclick = () => pinSheet(b.dataset.pin, b.dataset.n)));
  } catch (e) { toast(e.message, 1); }
}
function pinSheet(uid, name) {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>Đổi PIN · ${esc(name)}</h3><p>4 chữ số.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div><div class="field"><input class="inp" id="np" inputmode="numeric" maxlength="4" pattern="\\d*" placeholder="PIN mới" style="font-size:22px;letter-spacing:.4em;text-align:center"></div><div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="sp">Lưu PIN</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $("#sp").onclick = () => { const v = $("#np").value; if (!/^\d{4}$/.test(v)) return toast("PIN gồm đúng 4 chữ số", 1); act($("#sp"), async () => { await api("/pin", { body: { uid, pin: v } }); closeSheet(); }, "Đã đổi PIN").catch(() => {}); };
}

/* ---------- Sheet chung ---------- */
let lastFocus = null;
function sheet(html) { lastFocus = document.activeElement; $("#sheet").innerHTML = html; $("#sheet").scrollTop = 0; const s = $("#scrim"); s.classList.add("show"); s.setAttribute("aria-hidden", "false"); }
function closeSheet() { const s = $("#scrim"); s.classList.remove("show"); s.setAttribute("aria-hidden", "true"); lastFocus?.focus?.(); }
$("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim") closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
function confirmBox(title, msg, ok, danger) {
  return new Promise((res) => {
    sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>${title}</h3><p>${msg}</p></div></div><div class="foot"><button class="btn" id="cn">Huỷ</button><button class="btn ${danger ? "red" : "pri"}" id="cy">${ok}</button></div>`);
    $("#cn").onclick = () => { closeSheet(); res(false); }; $("#cy").onclick = () => { closeSheet(); res(true); };
  });
}

/* ---------- Gắn sự kiện ---------- */
function bind(root) {
  $$("[data-go]", root).forEach((b) => (b.onclick = () => go(b.dataset.go)));
  $$("[data-dev]", root).forEach((b) => (b.onclick = (e) => { if (e.target.closest("[data-unblock-dev]")) return; devSheet(b.dataset.dev); }));
  $$("[data-unblock-dev]", root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); act(b, async () => { await api("/unblock", { body: { target: { kind: "device", id: b.dataset.unblockDev } } }); await load(); }, "Đã mở chặn").catch(() => {}); }));
  $$("[data-reboot]", root).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox(`Khởi động lại ${esc(b.dataset.label)}?`, "Mạng ở tầng này sẽ mất khoảng 1–3 phút. Camera và mọi thiết bị sẽ tự kết nối lại sau đó.", "Khởi động lại", true))) return;
    act(b, () => api("/reboot", { body: { gid: Number(b.dataset.reboot), label: b.dataset.label } }), "Đã gửi lệnh — router khởi động lại trong ~2 phút").catch(() => {});
  }));
  const q = $("#q", root); if (q) q.oninput = () => { S.q = q.value; render(); };
  $$("[data-fl]", root).forEach((b) => (b.onclick = () => { S.floor = b.dataset.fl; render(); }));
  // gia đình
  const pa = $("#padd"); if (pa) pa.onclick = () => personSheet(null);
  $$("[data-pedit]", root).forEach((b) => (b.onclick = () => personSheet(person(b.dataset.pedit))));
  $$("[data-pblock]", root).forEach((b) => (b.onclick = async () => {
    const p = person(b.dataset.pblock); const m = Number(b.dataset.m);
    if (!m && !(await confirmBox(`Khoá mạng ${esc(p.name)}?`, "Tất cả thiết bị của " + esc(p.name) + " sẽ mất mạng cho tới khi mở lại.", "Khoá", true))) return;
    act(b, async () => { await api("/block", { body: { target: { kind: "person", id: p.id }, minutes: m } }); await load(); }, `Đã khoá ${p.name}${m ? " " + dur(m) : ""}`).catch(() => {});
  }));
  $$("[data-punblock]", root).forEach((b) => (b.onclick = () => { const p = person(b.dataset.punblock); act(b, async () => { await api("/unblock", { body: { target: { kind: "person", id: p.id } } }); await load(); }, `Đã mở mạng cho ${p.name}`).catch(() => {}); }));
  // wifi
  const wa = $("#wadd"); if (wa) wa.onclick = wifiCreateSheet;
  $$("[data-wt]", root).forEach((b) => (b.onclick = async () => {
    const on = b.classList.contains("on");
    if (on && !(await confirmBox(`Tắt “${esc(b.dataset.name)}”?`, b.dataset.iot === "1" ? "<b>Đây là WiFi IoT</b> — camera, hub, quạt… dùng mạng này sẽ mất kết nối." : "Thiết bị đang dùng WiFi này sẽ mất kết nối tới khi bật lại.", "Tắt WiFi", true))) return;
    b.classList.add("busy"); b.classList.toggle("on", !on);
    try { await api("/wifi/toggle", { body: { gid: Number(b.dataset.gid), ssidId: Number(b.dataset.wt), enable: !on, name: b.dataset.name } }); const s = S.d.routers.find((r) => r.gid === Number(b.dataset.gid))?.ssids.find((x) => x.id === Number(b.dataset.wt)); if (s) s.enable = !on; toast(`${on ? "Đã tắt" : "Đã bật"} ${b.dataset.name} · router áp dụng sau ~30 giây`); }
    catch (e) { b.classList.toggle("on", on); toast(e.message, 1); }
    b.classList.remove("busy");
  }));
  $$("[data-wedit]", root).forEach((b) => (b.onclick = () => wifiEditSheet(Number(b.dataset.gid), Number(b.dataset.wedit))));
  $$("[data-wdel]", root).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox(`Xoá WiFi “${esc(b.dataset.name)}”?`, "Xoá hẳn khỏi router, không khôi phục được. Thiết bị đang dùng mạng này sẽ mất kết nối.", "Xoá WiFi", true))) return;
    act(b, async () => { await api("/wifi/delete", { body: { gid: Number(b.dataset.gid), ssidId: Number(b.dataset.wdel), name: b.dataset.name } }); await load(); }, "Đã xoá WiFi").catch(() => {});
  }));
  // hẹn giờ
  const ra = $("#radd"); if (ra) ra.onclick = () => ruleSheet();
  $$("[data-rt]", root).forEach((b) => (b.onclick = async () => { b.classList.add("busy"); try { await api(`/rules/${b.dataset.rt}/toggle`, { method: "POST" }); const r = S.d.rules.find((x) => x.id === b.dataset.rt); r.enabled = !r.enabled; render(); } catch (e) { toast(e.message, 1); b.classList.remove("busy"); } }));
  $$("[data-re]", root).forEach((b) => (b.onclick = () => ruleSheet(S.d.rules.find((x) => x.id === b.dataset.re))));
  $$("[data-rd]", root).forEach((b) => (b.onclick = async () => { if (await confirmBox("Xoá lịch này?", "Lịch sẽ không chạy nữa.", "Xoá", true)) act(b, async () => { await api("/rules/" + b.dataset.rd, { method: "DELETE" }); await load(); }, "Đã xoá lịch").catch(() => {}); }));
  // dữ liệu
  const ej = $("#exj"); if (ej) ej.onclick = () => download(`wifi-nha-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ snapshot: S.d, inventory: S.inv }, null, 2), "application/json");
  const ec = $("#exc"); if (ec) ec.onclick = () => { const rows = [["Tên", "Tầng", "Loại", "Hãng", "Của ai", "WiFi", "MAC", "Lần đầu", "Lần cuối"], ...(S.d.known || []).map((k) => [k.name, k.floor, S.d.kinds?.[k.kind] || k.kind, k.vendor, person(k.owner)?.name || "", k.ssid, fmtMac(k.mac), timeVN(k.firstSeen), timeVN(k.lastSeen)])]; download(`thiet-bi-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv"); };
  // cài đặt
  const l2 = $("#lo2"); if (l2) l2.onclick = lockNow;
  if ($("#acc")) loadAccounts();
}

/* ---------- Khởi động ---------- */
async function boot() {
  shell(); render();
  try { await load("fast"); } catch (e) { toast(e.message, 1); }
  load(); startPolling();
}
(async () => {
  try { const r = await api("/me"); S.me = r.me; boot(); } catch { if (!S.me) renderLogin(); }
})();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
