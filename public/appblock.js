/* WiFi Nhà · thẻ "Chặn game & chat" (mọi tài khoản): Liên Quân, Roblox, Discord.
   Gạt = chặn luôn cho cả nhà. "Giờ chặn" = tự chặn cả 3 trong khung giờ đã đặt, hết giờ tự mở (trừ app đang gạt chặn tay). */
"use strict";
const abSchedTxt = (s) => s.enabled ? `Tự chặn ${s.from}–${s.to} · ${typeof dayTxt === "function" ? dayTxt(s.days) : s.days.map((d) => DAYS[d]).join(", ")}` : "Chưa đặt giờ chặn";
function appBlockCard() {
  const a = S.d?.apps; if (!a) return "";
  if (!a.configured) return isAdmin() ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><span style="color:var(--pri)">${I.console || I.clock}</span><h2>Chặn game & chat</h2></div><div class="alert">${I.alert}<div>Chưa kết nối bộ lọc Cloudflare. Cần đặt 2 secret <b>CF_API_TOKEN</b> và <b>CF_ACCOUNT_ID</b> cho Worker, rồi trỏ DNS của router về Cloudflare.</div></div></div>` : "";
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><span style="color:var(--pri)">${I.console || I.clock}</span><h2>Chặn game & chat</h2><div class="grow"></div><small class="hide-m">Gạt để chặn cho cả nhà</small></div>
    ${a.err ? `<div class="alert bad">${I.alert}<div>Chưa áp dụng được: ${esc(a.err)}</div></div>` : ""}
    <div class="list">
      ${a.apps.map((x) => `<div class="row" style="cursor:default"><div style="min-width:0"><div class="nm">${esc(x.name)}</div><div class="meta">${x.active ? `<span style="color:var(--bad)">Đang chặn</span>${x.on ? "" : " theo giờ"}` : "Đang cho dùng"}${x.applied ? "" : " · đang áp dụng…"}</div></div>
        <button class="sw ${x.on ? "on" : ""}" role="switch" aria-checked="${x.on}" aria-label="Chặn ${esc(x.name)}" data-appsw="${x.id}"></button></div>`).join("")}
      <div class="row" data-appsched="1" style="cursor:pointer"><div style="min-width:0"><div class="nm">Giờ chặn cả 3</div><div class="meta">${esc(abSchedTxt(a.sched))}${a.inWindow ? ' · <span style="color:var(--bad)">đang trong giờ chặn</span>' : ""}</div></div><div class="rr">${I.chev}</div></div>
    </div>
    <p class="meta" style="margin-top:10px">Chỉ có tác dụng với máy dùng WiFi nhà. Máy bật 4G hoặc VPN thì không chặn được.</p></div>`;
}
function appSchedSheet() {
  const s = JSON.parse(JSON.stringify(S.d.apps.sched));
  const draw = () => {
    sheet(`<div class="sheet-h"><div class="t"><h3>Giờ chặn game & chat</h3><p>Trong giờ này Liên Quân, Roblox, Discord bị chặn. Hết giờ tự mở lại.</p></div></div>
      <div class="row" style="cursor:default"><div><div class="nm">Bật giờ chặn</div></div><button class="sw ${s.enabled ? "on" : ""}" role="switch" aria-checked="${s.enabled}" aria-label="Bật giờ chặn" id="abEn"></button></div>
      <div class="field two" style="margin-top:12px"><div><label class="lbl">Chặn từ</label><input class="inp" type="time" id="abF" value="${s.from}"></div><div><label class="lbl">Mở lại lúc</label><input class="inp" type="time" id="abT" value="${s.to}"></div></div>
      <label class="lbl">Ngày áp dụng</label><div class="opts" id="abD" style="margin-bottom:16px">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="opt ${s.days.includes(d) ? "on" : ""}" data-d="${d}">${DAYS[d]}</button>`).join("")}</div>
      <button class="btn pri" id="abS" style="width:100%">Lưu giờ chặn</button>`);
    $("#abEn").onclick = () => { s.enabled = !s.enabled; sync(); draw(); };
    $("#abD").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; const d = Number(b.dataset.d); s.days = s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d]; sync(); draw(); };
    $("#abS").onclick = () => { sync(); act($("#abS"), async () => { await api("/apps/sched", { body: s }); await load(); closeSheet(); }, "Đã lưu giờ chặn").catch(() => {}); };
  };
  const sync = () => { s.from = $("#abF").value || s.from; s.to = $("#abT").value || s.to; };
  draw();
}
document.addEventListener("click", async (e) => {
  const sw = e.target.closest("[data-appsw]");
  if (sw) {
    const x = S.d.apps.apps.find((y) => y.id === sw.dataset.appsw), on = !x.on;
    if (!on && x.active && S.d.apps.inWindow) toast(`${x.name} vẫn bị chặn tới hết giờ chặn`);
    return act(null, async () => { await api("/apps/toggle", { body: { app: x.id, on } }); await load(); }, on ? `Đã chặn ${x.name}` : `Đã bỏ chặn ${x.name}`).catch(() => {});
  }
  if (e.target.closest("[data-appsched]")) appSchedSheet();
});
