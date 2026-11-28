/* WiFi Nhà · các màn hình dùng chung cho mọi tài khoản (Xuân San có thêm phần nâng cao):
   - "WiFi trong nhà": công tắc từng WiFi + giờ dùng (bấm vào WiFi để đặt giờ) + dòng "Tất cả WiFi" (giờ nghỉ cả nhà)
   - Thiết bị: chia theo tầng, tự xếp cột theo màn hình, IoT thu gọn, lọc nhanh
   - Nhật ký: gom theo ngày, gộp thông báo lặp lại, lọc theo loại */

/* ---------- WiFi trong nhà ---------- */
function wifiHomeCard() {
  const G = wifiGroups(); if (!G.length) return "";
  const n = S.d.net || {}, lv = n.live || { on: 0, total: 0 };
  const R = (n.rules || []).filter((r) => r.enabled);
  const allOn = n.scene === "on" || n.on;
  const allSub = n.scene === "ghost" ? `<span style="color:var(--warn)">Đang giả mạng hỏng</span>` : `${lv.on}/${lv.total} WiFi đang phát`;
  const famTxt = R.length ? R.map((r) => `nghỉ ${r.offAt}–${r.onAt}`).join(", ") : "Chưa đặt giờ nghỉ chung";
  return `<div class="card wf-card" style="margin-bottom:16px"><div class="card-h"><span style="color:var(--pri)">${I.wifi}</span><h2>WiFi trong nhà</h2><div class="grow"></div><small class="hide-m">Gạt để bật/tắt · bấm tên để đặt giờ</small></div>
  <div class="list">
    <div class="row wf-row wf-all" data-famsheet="1"><div style="min-width:0"><div class="nm">Tất cả WiFi</div><div class="meta">${allSub} · ${esc(famTxt)}</div></div>
      <button class="sw ${allOn ? "on" : ""}" role="switch" aria-checked="${allOn}" aria-label="Bật/tắt tất cả WiFi" data-allsw="1"></button></div>
    ${G.map((g) => wifiRow(g)).join("")}
  </div></div>`;
}
function wifiRow(g) {
  const air = g.items.filter((x) => onAir(x.s)).length, on = air > 0;
  const l = lim(g.name), st = limitState(g.name);
  const floors = [...new Set(g.items.map((x) => x.r.floor))].join(", ");
  const sched = !on && g.items.some((x) => offBySched(x.s));
  const status = !on && st && !st.ok ? `<span style="color:var(--warn)">Ngoài giờ dùng</span>${st.next ? ` · mở ${hmVN(st.next)}${dayWord(st.next) === "hôm nay" ? "" : " " + dayWord(st.next)}` : ""}`
    : on ? `<span style="color:var(--ok)">Đang phát</span>${air < g.items.length ? ` · ${air}/${g.items.length} tầng` : ""}${st?.ok && st.next ? ` · tắt ${hmVN(st.next)}` : ""}`
    : sched ? `<span style="color:var(--warn)">Tắt theo lịch router</span>` : "Đang tắt";
  const timeTxt = g.private ? "" : l ? `<div class="meta">Giờ dùng: ${esc(winTxt(l))} · ${dayTxt(l.days)}</div>${dayBar(l.wins)}` : `<div class="meta">Dùng cả ngày · <u>đặt giờ</u></div>`;
  return `<div class="row wf-row" ${g.private ? "" : `data-lim="${esc(g.name)}"`}><div style="min-width:0">
      <div class="nm"><span class="ell">${esc(g.name)}</span>${g.private ? '<span class="chip pri" style="height:20px">Riêng</span>' : ""}</div>
      <div class="meta">${esc(floors)} · ${status}</div>${timeTxt}</div>
    <button class="sw ${on ? "on" : ""}${sched ? " sched" : ""}" role="switch" aria-checked="${on}" aria-label="Bật/tắt ${esc(g.name)}" data-wqn="${esc(g.name)}"></button></div>`;
}
async function toggleWifiGroup(b) {
  const g = wifiGroups().find((x) => x.name === b.dataset.wqn); if (!g) return;
  const on = b.classList.contains("on"), ls = limitState(g.name);
  if (!on && ls && !ls.ok) return confirmBox(`“${esc(g.name)}” đang ngoài giờ dùng`, `WiFi này chỉ phát <b>${esc(winTxt(lim(g.name)))}</b> (${dayTxt(lim(g.name).days)})${ls.next ? `, tự mở lại lúc <b>${hmVN(ls.next)}</b> ${dayWord(ls.next)}` : ""}.<br><br>Muốn dùng ngay: bấm <b>Cho dùng thêm giờ</b>, hoặc bấm vào tên WiFi để sửa giờ dùng.`, "Đã hiểu");
  if (b.classList.contains("sched")) return confirmBox(`“${esc(g.name)}” đang tắt theo lịch router`, "Lịch này cài trong eWeb của router. Muốn bỏ thì Xuân San vào eWeb tắt lịch đó.", "Đã hiểu");
  if (on && !(await confirmBox(`Tắt “${esc(g.name)}”?`, `Tắt ở ${g.items.length} tầng. Máy đang dùng WiFi này sẽ mất mạng tới khi bật lại.`, "Tắt WiFi", true))) return;
  const want = !on, todo = g.items.filter((x) => x.s.enable !== want);
  b.classList.add("busy"); b.classList.toggle("on", want);
  const res = await Promise.allSettled(todo.map((x) => api("/wifi/toggle", { body: { gid: x.r.gid, ssidId: x.s.id, enable: want, name: g.name } }).then(() => (x.s.enable = want))));
  const bad = res.filter((r) => r.status === "rejected");
  b.classList.remove("busy");
  if (bad.length) toast(`${bad.length}/${todo.length} tầng chưa đổi được: ${bad[0].reason?.message || ""}`, 1);
  else toast(`${want ? "Đã bật" : "Đã tắt"} ${g.name} · router áp dụng sau ~30 giây`);
  render(); load();
}
// Giờ nghỉ chung cho cả nhà (tắt mọi WiFi gia đình theo giờ + ngày)
function familySheet() {
  const draw = () => {
    const R = S.d.net?.rules || [];
    sheet(`<div class="grab"></div><div class="sheet-h"><span class="av soft">${I.clock}</span><div class="t"><h3>Giờ nghỉ cả nhà</h3><p>Tới giờ nghỉ, <b>mọi WiFi</b> tự tắt; hết giờ tự mở lại. Được ưu tiên hơn giờ dùng của từng WiFi.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
      ${R.length ? `<div class="list">${R.map((r) => `<div class="row lim-row" style="cursor:default;opacity:${r.enabled ? 1 : .55}"><div style="min-width:0"><div class="nm" style="white-space:normal;display:block">Tắt ${esc(r.offAt)} → mở ${esc(r.onAt)}</div>
        <div class="meta">${esc(r.name)} · ${dayTxt(r.days)}${r.mode === "ghost" ? " · <b>giả mạng hỏng</b>" : ""}</div>${r.enabled ? dayBar(ruleWins(r)) : '<div class="meta">Đang tạm tắt</div>'}</div>
        <div class="rr" style="flex-direction:column;align-items:flex-end;gap:6px"><button class="sw ${r.enabled ? "on" : ""}" role="switch" aria-checked="${r.enabled}" aria-label="Bật/tắt giờ nghỉ" data-fr-t="${r.id}"></button>
        <div style="display:flex"><button class="btn ghost sm icon" data-fr-e="${r.id}" aria-label="Sửa">${I.edit}</button><button class="btn ghost sm icon" data-fr-d="${r.id}" aria-label="Xoá">${I.trash}</button></div></div></div>`).join("")}</div>`
        : `<div class="empty"><b>Chưa có giờ nghỉ chung</b>Ví dụ: tắt cả nhà 21:00 → mở 6:30 mỗi ngày.</div>`}
      <div class="foot"><button class="btn" data-close>Đóng</button><button class="btn pri" id="fradd">${I.plus}Thêm giờ nghỉ</button></div>`);
    $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
    $("#fradd").onclick = () => netRuleSheet();
    const R2 = (id) => S.d.net.rules.find((x) => x.id === id);
    $$("[data-fr-e]").forEach((b) => (b.onclick = () => netRuleSheet(R2(b.dataset.frE))));
    $$("[data-fr-t]").forEach((b) => (b.onclick = async () => { b.classList.add("busy"); try { const x = await api("/net/rules", { body: { ...R2(b.dataset.frT), enabled: !R2(b.dataset.frT).enabled } }); S.d.net = x.net; draw(); render(); } catch (e) { toast(e.message, 1); b.classList.remove("busy"); } }));
    $$("[data-fr-d]").forEach((b) => (b.onclick = async () => { if (!(await confirmBox("Xoá giờ nghỉ này?", "WiFi sẽ không tự tắt theo giờ nghỉ này nữa.", "Xoá", true))) return; try { const x = await api("/net/rules/" + b.dataset.frD, { method: "DELETE" }); S.d.net = x.net; render(); familySheet(); toast("Đã xoá"); } catch (e) { toast(e.message, 1); } }));
  };
  draw();
}
function bindWifiHome(root) {
  $$("[data-wqn]", root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); toggleWifiGroup(b); }));
  $$("[data-allsw]", root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); runScene(b.classList.contains("on") ? "off" : "on", b); }));
  $$("[data-famsheet]", root).forEach((b) => (b.onclick = () => familySheet()));
}

/* ---------- Thiết bị: chia tầng, xếp cột theo màn hình ---------- */
const DEV_FILTERS = [["all", "Tất cả"], ["use", "Đang dùng mạng"], ["iot", "Camera & IoT"], ["blocked", "Đang chặn"]];
const isIotC = (c) => c.kind === "iot" || c.kind === "camera" || /iot/i.test(c.ssid || "");
function devPage(parentMode) {
  const R = S.d.routers, bs = blockedSet();
  S.devF = S.devF || "all";
  let cl = clients();
  const q = (S.q || "").trim().toLowerCase();
  if (q) cl = cl.filter((c) => [c.name, c.ip, c.mac, fmtMac(c.mac), c.ssid, c.vendor, c.kindVi, person(c.owner)?.name].join(" ").toLowerCase().includes(q));
  if (S.devF === "use") cl = cl.filter((c) => !isIotC(c));
  if (S.devF === "iot") cl = cl.filter(isIotC);
  if (S.devF === "blocked") cl = cl.filter((c) => bs.has(c.mac));
  const by = {}; cl.forEach((c) => (by[c.floor] = by[c.floor] || []).push(c));
  const row = (c) => parentMode ? parentDevRow(c, bs) : devRow(c, bs);
  const floorCard = (r) => {
    const arr = (by[r.floor] || []).sort((a, b) => a.name.localeCompare(b.name, "vi"));
    const main = S.devF === "all" ? arr.filter((c) => !isIotC(c)) : arr, iot = S.devF === "all" ? arr.filter(isIotC) : [];
    return `<div class="card dev-floor"><div class="card-h"><span class="floor-ic" style="background:${floorC(r.floor)};width:32px;height:32px;border-radius:10px">${I.router}</span><h2>${esc(r.floor)}</h2><div class="grow"></div><span class="chip">${arr.length}</span></div>
      ${main.length ? `<div class="list">${main.map(row).join("")}</div>` : `<div class="meta">${arr.length ? "" : "Không có thiết bị"}</div>`}
      ${iot.length ? `<details class="dev-iot"><summary>${I.camera}<span>${iot.length} camera & thiết bị thông minh</span>${I.chev}</summary><div class="list">${iot.map(row).join("")}</div></details>` : ""}</div>`;
  };
  const counts = { all: clients().length, use: clients().filter((c) => !isIotC(c)).length, iot: clients().filter(isIotC).length, blocked: clients().filter((c) => bs.has(c.mac)).length };
  return `<div class="toolbar"><input class="search" id="q" placeholder="Tìm tên, IP, hãng, của ai…" value="${esc(S.q || "")}" autocomplete="off">
    <div class="seg dev-seg">${DEV_FILTERS.filter(([k]) => !parentMode || k !== "iot").map(([k, l]) => `<button data-devf="${k}" class="${S.devF === k ? "on" : ""}">${l} <span class="num">${counts[k]}</span></button>`).join("")}</div></div>
  ${S.d.blocked.length && S.devF !== "blocked" ? blockedCard().replace('<div class="card">', '<div class="card" style="margin-bottom:16px">') : ""}
  <div class="dev-grid">${R.filter((r) => (by[r.floor] || []).length || S.devF === "all").map(floorCard).join("")}</div>`;
}
function parentDevRow(c, bs) {
  return `<div class="row" data-dev="${c.mac}"><span class="av" style="background:${bs.has(c.mac) ? "var(--bad)" : floorC(c.floor)}">${kindIc(c.kind)}</span><div style="min-width:0"><div class="nm"><span class="ell">${esc(c.name)}</span></div><div class="meta">${esc(c.kindVi)}${person(c.owner) ? " · " + esc(person(c.owner).name) : ""}${c.since ? " · vào " + ago(c.since) : ""}</div></div>
    <div class="rr">${bs.has(c.mac) ? `<button class="btn sm green" data-unblock-dev="${c.mac}">${I.unlock}Mở</button>` : `<button class="btn sm red" data-pdev="${c.mac}" data-name="${esc(c.name)}">${I.lock}Khoá</button>`}</div></div>`;
}
// Xuân San: tab Thiết bị gồm 2 phần — Thiết bị | Các con
function vDevices() {
  S.devTab = S.devTab || "dev";
  const seg = `<div class="seg" style="margin-bottom:14px"><button data-devtab="dev" class="${S.devTab === "dev" ? "on" : ""}">Thiết bị</button><button data-devtab="people" class="${S.devTab === "people" ? "on" : ""}">Các con (${S.d.people.length})</button></div>`;
  if (S.devTab === "people") return vFamily(seg);
  return header("Thiết bị") + seg + devPage(false);
}
function vParentDevices() {
  return header("Thiết bị") + `<div class="alert" style="background:var(--pri-soft);color:var(--text2)">${I.eye}<div>Tên máy do hệ thống tự nhận diện nên có thể chưa đúng. Bấm vào máy để đặt tên hoặc gán cho các con.</div></div>` + devPage(true);
}

/* ---------- Nhật ký: theo ngày, gộp lặp lại, lọc ---------- */
const LOG_F = [["main", "Quan trọng"], ["parent", "Ba Mẹ"], ["auto", "Tự động"], ["err", "Lỗi"], ["all", "Tất cả"]];
const logKind = (l) => /^Camera Gateway|Camera Gateway tự/.test(l.text) ? "cam" : !l.ok ? "err" : l.role === "parent" ? "parent" : l.role === "system" || /Hẹn giờ|Lịch|Giờ dùng|Hết giờ|Giới hạn/.test(l.by) ? "auto" : "admin";
const logSig = (l) => l.text.replace(/https?:\/\/\S+/g, "").replace(/\d+/g, "#").trim() + "|" + l.by;
function vLog() {
  S.logF = S.logF || "main";
  const L = (S.log || []).filter((l) => { const k = logKind(l); return S.logF === "all" || (S.logF === "main" ? k !== "cam" : S.logF === k); });
  const days = [];
  for (const l of L) {
    const d = new Date(l.t + 7 * 3600000).toISOString().slice(0, 10);
    let day = days[days.length - 1]; if (!day || day.d !== d) days.push((day = { d, t: l.t, items: [] }));
    const last = day.items[day.items.length - 1];
    if (last && last.sig === logSig(l)) { last.n++; last.first = l.t; } else day.items.push({ ...l, sig: logSig(l), n: 1, first: l.t });
  }
  const KC = { parent: ["var(--pri-soft)", "var(--pri)", I.user], auto: ["var(--surface2)", "var(--text2)", I.clock], err: ["var(--bad-soft)", "var(--bad)", I.alert], cam: ["var(--surface2)", "var(--mut)", I.camera], admin: ["var(--ok-soft)", "var(--ok)", I.check || I.clock] };
  const counts = Object.fromEntries(LOG_F.map(([k]) => [k, (S.log || []).filter((l) => { const x = logKind(l); return k === "all" || (k === "main" ? x !== "cam" : x === k); }).length]));
  return header("Nhật ký") + `<div class="seg" style="margin-bottom:14px;max-width:100%">${LOG_F.map(([k, l]) => `<button data-logf="${k}" class="${S.logF === k ? "on" : ""}">${l} <span class="num">${counts[k]}</span></button>`).join("")}</div>
  ${days.length ? `<div class="log-days">` + days.slice(0, 14).map((g) => `<div class="card"><div class="card-h"><h2>${dayWord(g.t) === "hôm nay" ? "Hôm nay" : dayWord(g.t) === "ngày mai" ? "" : new Date(g.t).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" })}</h2><div class="grow"></div><span class="chip">${g.items.reduce((a, x) => a + x.n, 0)}</span></div>
    <div class="list">${g.items.map((x) => { const [bg, fg, ic] = KC[logKind(x)]; return `<div class="row log-row" style="cursor:default"><span class="av" style="background:${bg};color:${fg}">${ic}</span><div style="min-width:0"><div class="log-t">${esc(x.text)}${x.n > 1 ? ` <span class="chip" style="height:20px">×${x.n}</span>` : ""}</div><div class="meta">${esc(x.by)} · ${x.n > 1 ? `${hmVN(x.first)}–${hmVN(x.t)}` : hmVN(x.t)}</div></div></div>`; }).join("")}</div></div>`).join("") + `</div>`
    : `<div class="empty"><b>Chưa có hoạt động</b>Mọi thao tác bật/tắt, khoá máy, hẹn giờ sẽ hiện ở đây.</div>`}
  ${isOwner() ? `<div class="card"><div class="card-h"><h2>Xuất dữ liệu</h2></div><div class="opts"><button class="btn sm" data-go="data">${I.db}Mở kho dữ liệu</button></div></div>` : ""}`;
}
function bindViews(root) {
  bindWifiHome(root);
  $$("[data-devf]", root).forEach((b) => (b.onclick = () => { S.devF = b.dataset.devf; render(); }));
  $$("[data-devtab]", root).forEach((b) => (b.onclick = () => { S.devTab = b.dataset.devtab; render(); }));
  $$("[data-logf]", root).forEach((b) => (b.onclick = () => { S.logF = b.dataset.logf; render(); }));
}
