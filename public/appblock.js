/* WiFi Nhà · "Chặn game & nội dung" (mọi tài khoản), chạy bằng bộ lọc NextDNS, áp dụng cho MỌI máy dùng WiFi nhà.
   - Thẻ ở trang đầu: game, Discord, đường lách (VPN, 1.1.1.1) + giờ chặn + nút mở bảng đầy đủ.
   - Bảng đầy đủ: mạng xã hội, nhắn tin, video, nội dung web, an toàn, tên miền tự thêm, số lượt đã dùng trong tháng. */
"use strict";
const abItems = (g) => S.d.apps.items.filter((x) => x.group === g);
const abSchedTxt = (s) => s.enabled ? `Tự chặn ${s.from}–${s.to} · ${typeof dayTxt === "function" ? dayTxt(s.days) : s.days.map((d) => DAYS[d]).join(", ")}` : "Chưa đặt giờ chặn";
const abRow = (x) => `<div class="row wf-row" style="cursor:default"><div style="min-width:0;flex:1"><div class="nm">${esc(x.name)}</div><div class="meta">${x.active ? `<span style="color:var(--bad)">Đang chặn</span>${x.on ? "" : x.id === "bypass" ? " (tự bật khi chặn game)" : " theo giờ"}` : "Đang cho dùng"}</div></div>
  <button class="sw ${x.on ? "on" : ""}" role="switch" aria-checked="${x.on}" aria-label="Chặn ${esc(x.name)}" data-appsw="${x.id}"></button></div>`;
const abAlerts = (a) => `${a.err ? `<div class="alert bad">${I.alert}<div>Chưa áp dụng được: ${esc(a.err)}</div></div>` : ""}${a.linkedOk ? "" : `<div class="alert">${I.alert}<div>Bộ lọc chưa nhận ra mạng nhà nên <b>chưa chặn được</b>. Mở app này bằng WiFi nhà một lần là tự nhận lại.</div></div>`}`;
// Trạng thái chặn game theo công tắc: "all" = bật hết, "some" = bật một phần, "none" = tắt hết; null = chưa kết nối bộ lọc
function abGameState() {
  const a = S.d?.apps; if (!a?.configured) return null;
  const g = abItems("game"), n = g.filter((x) => x.on).length;
  return n && n === g.length ? "all" : n ? "some" : "none";
}
function appBlockCard() {
  const a = S.d?.apps; if (!a) return "";
  const head = `<div class="card-h"><span style="color:var(--pri)">${I.console || I.clock}</span><h2>Chặn game & nội dung</h2><div class="grow"></div><small class="hide-m">Áp dụng cho mọi máy dùng WiFi nhà</small></div>`;
  if (!a.configured) return isAdmin() ? `<div class="card" style="margin-bottom:16px">${head}<div class="alert">${I.alert}<div>Chưa kết nối bộ lọc NextDNS. Chạy <b>bin/setup-appblock.sh</b> để nhập API key, rồi trỏ DNS của router về NextDNS.</div></div></div>` : "";
  const gs = abGameState();
  const others = a.items.filter((x) => x.group !== "game" && x.id !== "bypass" && x.active).length;
  return `<div class="card" style="margin-bottom:16px">${head}${abAlerts(a)}
    <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn red ab-all ${gs === "all" ? "cur" : ""}" data-appall="1" aria-pressed="${gs === "all"}" style="flex:1;height:44px">${gs === "all" ? "✓ Đang chặn toàn bộ" : "Chặn toàn bộ"}</button><button class="btn ab-all ${gs === "none" ? "cur" : ""}" data-appall="0" aria-pressed="${gs === "none"}" style="flex:1;height:44px">${gs === "none" ? "✓ Đã gỡ toàn bộ" : "Gỡ toàn bộ"}</button></div>
    <p class="meta" style="margin:-4px 0 10px">${typeof isPhone === "function" && isPhone() ? "" : "Nút “Chặn game” ở ô “Bấm 1 lần” chính là 2 nút này. "}Hai nút này không đụng tới YouTube và Netflix, để TV vẫn xem được. Muốn chặn 2 mục đó thì gạt tay trong “Chặn thêm”.</p>
    <div class="list">
      ${abItems("game").map(abRow).join("")}${abRow(a.items.find((x) => x.id === "bypass"))}
      <div class="row wf-row" data-appsched="1" style="cursor:pointer"><div style="min-width:0;flex:1"><div class="nm">Giờ chặn</div><div class="meta">${esc(abSchedTxt(a.sched))}${a.inWindow ? ' · <span style="color:var(--bad)">đang trong giờ chặn</span>' : ""}</div></div><div class="rr">${I.chev}</div></div>
      <div class="row wf-row" data-appmore="1" style="cursor:pointer"><div style="min-width:0;flex:1"><div class="nm">Chặn thêm: mạng xã hội, video, web người lớn…</div><div class="meta">${others ? `Đang chặn thêm ${others} mục` : "Chưa chặn thêm mục nào"} · tên miền tự thêm · lượt đã dùng</div></div><div class="rr">${I.chev}</div></div>
    </div>
    <p class="meta" style="margin-top:10px">Chặn ở đây là chặn cả nhà, kể cả máy của người lớn. Máy bật 4G thì không chặn được.</p></div>`;
}
function appSchedSheet() {
  const s = JSON.parse(JSON.stringify(S.d.apps.sched));
  const G = S.d.apps.groups.filter((g) => g.id !== "safe");
  const sync = () => { s.from = $("#abF").value || s.from; s.to = $("#abT").value || s.to; };
  const tog = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const draw = () => {
    sheet(`<div class="sheet-h"><div class="t"><h3>Giờ chặn</h3><p>Trong giờ này các nhóm đã chọn bị chặn cho cả nhà. Hết giờ tự mở lại.</p></div></div>
      <div class="row wf-row" style="cursor:default"><div><div class="nm">Bật giờ chặn</div></div><button class="sw ${s.enabled ? "on" : ""}" role="switch" aria-checked="${s.enabled}" aria-label="Bật giờ chặn" id="abEn"></button></div>
      <div class="field two" style="margin-top:12px"><div><label class="lbl">Chặn từ</label><input class="inp" type="time" id="abF" value="${s.from}"></div><div><label class="lbl">Mở lại lúc</label><input class="inp" type="time" id="abT" value="${s.to}"></div></div>
      <label class="lbl">Ngày áp dụng</label><div class="opts" id="abD" style="margin-bottom:16px">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="opt ${s.days.includes(d) ? "on" : ""}" data-d="${d}">${DAYS[d]}</button>`).join("")}</div>
      <label class="lbl">Chặn những nhóm nào</label><div class="opts" id="abG" style="margin-bottom:16px">${G.map((g) => `<button class="opt ${s.groups.includes(g.id) ? "on" : ""}" data-g="${g.id}">${esc(g.name)}</button>`).join("")}</div>
      <button class="btn pri" id="abS" style="width:100%">Lưu giờ chặn</button>`);
    $("#abEn").onclick = () => { sync(); s.enabled = !s.enabled; draw(); };
    $("#abD").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; sync(); s.days = tog(s.days, Number(b.dataset.d)); draw(); };
    $("#abG").onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; sync(); s.groups = tog(s.groups, b.dataset.g); draw(); };
    $("#abS").onclick = () => { sync(); act($("#abS"), async () => { await api("/apps/sched", { body: s }); await load(); closeSheet(); }, "Đã lưu giờ chặn").catch(() => {}); };
  };
  draw();
}
/* Bảng đầy đủ */
let abStats = null;
const abDomList = (list, arr) => arr.length ? arr.map((d) => `<span class="chip" style="height:30px;gap:6px">${esc(d)}<button data-abdel="${list}" data-dom="${esc(d)}" aria-label="Gỡ ${esc(d)}" style="background:none;border:0;cursor:pointer;color:inherit;font-size:16px;line-height:1;padding:0 2px">×</button></span>`).join(" ") : '<span class="meta">Chưa có</span>';
function abStatsHtml() {
  const st = abStats; if (!st) return '<div class="meta">Đang đếm…</div>';
  if (st.error) return `<div class="meta">${esc(st.error)}</div>`;
  const pct = Math.min(100, Math.round((st.used / st.quota) * 100));
  return `<div class="meta">Tháng này đã dùng <b>${st.used.toLocaleString("vi-VN")}</b> / ${st.quota.toLocaleString("vi-VN")} lượt (${pct}%), trong đó chặn ${st.blocked.toLocaleString("vi-VN")} lượt. Dùng hết thì bộ lọc ngừng chặn tới đầu tháng sau.</div>
    <div style="height:8px;border-radius:6px;background:var(--line);margin:8px 0 4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 85 ? "var(--bad)" : pct >= 60 ? "var(--warn)" : "var(--ok)"}"></div></div>
    ${st.top?.length ? `<div class="lbl" style="margin-top:12px">Bị chặn nhiều nhất 24 giờ qua</div><div class="meta">${st.top.map((t) => `${esc(t.domain)} (${t.queries})`).join(" · ")}</div>` : ""}`;
}
function appMoreSheet() {
  const a = S.d.apps, keepY = $("#sheet").scrollTop, open = $("#scrim").classList.contains("show") && $("#abMore");
  sheet(`<div class="sheet-h" id="abMore"><div class="t"><h3>Chặn thêm</h3><p>Gạt để chặn cho mọi máy dùng WiFi nhà. Gạt lại để mở.</p></div></div>${abAlerts(a)}
    ${a.groups.filter((g) => g.id !== "game").map((g) => `<div class="lbl" style="margin-top:14px">${esc(g.name)}</div><div class="list">${abItems(g.id).filter((x) => x.id !== "bypass").map(abRow).join("")}</div>`).join("")}
    <div class="lbl" style="margin-top:18px">Tên miền tự thêm để chặn</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${abDomList("deny", a.custom)}</div>
    <div style="display:flex;gap:8px"><input class="inp" id="abDn" placeholder="vd: gamevui.vn" autocapitalize="off" autocomplete="off"><button class="btn" data-abadd="deny">Chặn</button></div>
    <div class="lbl" style="margin-top:18px">Tên miền luôn cho qua (thắng mọi luật chặn)</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${abDomList("allow", a.allow)}</div>
    <div style="display:flex;gap:8px"><input class="inp" id="abAl" placeholder="vd: hocmai.vn" autocapitalize="off" autocomplete="off"><button class="btn" data-abadd="allow">Cho qua</button></div>
    <div class="lbl" style="margin-top:18px">Lượt lọc trong tháng</div><div id="abSt">${abStatsHtml()}</div>`);
  if (open) $("#sheet").scrollTop = keepY;
}
async function abLoadStats() { try { abStats = await api("/apps/stats"); } catch (e) { abStats = { error: e.message }; } const el = $("#abSt"); if (el) el.innerHTML = abStatsHtml(); }
const abRefreshSheet = () => { if ($("#abMore") && $("#scrim").classList.contains("show")) appMoreSheet(); };
document.addEventListener("click", async (e) => {
  const sw = e.target.closest("[data-appsw]");
  if (sw) {
    const x = S.d.apps.items.find((y) => y.id === sw.dataset.appsw), on = !x.on;
    if (!on && x.active && (S.d.apps.inWindow || x.id === "bypass")) toast(`${x.name} vẫn bị chặn ${x.id === "bypass" ? "khi còn chặn game" : "tới hết giờ chặn"}`);
    return act(null, async () => { await api("/apps/toggle", { body: { app: x.id, on } }); await load(); abRefreshSheet(); }, on ? `Đã chặn ${x.name}` : `Đã bỏ chặn ${x.name}`).catch(() => {});
  }
  const all = e.target.closest("[data-appall]");
  if (all) {
    const on = all.dataset.appall === "1";
    return act(all, async () => { await api("/apps/all", { body: { on } }); await load(); }, on ? "Đã chặn toàn bộ game" : S.d.apps.inWindow ? "Đã gỡ công tắc, nhưng đang trong giờ chặn nên game vẫn bị chặn tới hết giờ" : "Đã gỡ toàn bộ chặn game").catch(() => {});
  }
  if (e.target.closest("[data-appsched]")) return appSchedSheet();
  if (e.target.closest("[data-appmore]")) { appMoreSheet(); return abLoadStats(); }
  const add = e.target.closest("[data-abadd]"), del = e.target.closest("[data-abdel]");
  if (add || del) {
    const list = add ? add.dataset.abadd : del.dataset.abdel;
    const domain = add ? $(list === "deny" ? "#abDn" : "#abAl").value : del.dataset.dom;
    if (!String(domain).trim()) return toast("Nhập tên miền trước", 1);
    return act(add || null, async () => { await api("/apps/domain", { body: { list, domain, add: !!add } }); await load(); abRefreshSheet(); }, add ? "Đã thêm" : "Đã gỡ").catch(() => {});
  }
});
// Đang ở nhà mà NextDNS chưa biết IP nhà: trình duyệt gọi link cập nhật (chỉ gọi được từ trong mạng nhà), rồi báo server đọc lại
let abRelinkAt = 0;
function abRelink() {
  const u = S.d?.apps?.relink; if (!u || Date.now() - abRelinkAt < 120000) return;
  abRelinkAt = Date.now();
  fetch(u, { mode: "no-cors", cache: "no-store" }).then(() => api("/apps/relinked", { body: {} })).then(() => load()).catch(() => {});
}
setInterval(abRelink, 15000);
