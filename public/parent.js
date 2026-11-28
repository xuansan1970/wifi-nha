/* WiFi Nhà · màn hình Điều khiển cho Ba Mẹ (tối giản, nút to).
   Dùng chung hàm của app.js: S, api, act, render, sheet, closeSheet, confirmBox, toast, I, esc, hmVN, dayWord, left, wifiGroups. Màn hình dùng chung: views.js.
   Mọi nút đọc trạng thái từ S.d.net (server tính theo router thật) → bấm xong luôn vẽ lại từ dữ liệu server trả về. */

const SCENE_UI = {
  on: { t: "Mở WiFi cả nhà", s: "Mở WiFi", d: "Bật lại tất cả WiFi", c: "on", ic: "power" },
  off: { t: "Tắt WiFi cả nhà", s: "Tắt WiFi", d: "Tắt hết, cả nhà mất mạng", c: "off", ic: "power" },
  ghost: { t: "Giả mạng hỏng", s: "Giả hỏng", d: "Tắt và giấu tên WiFi, các con dò không thấy, tưởng mạng hư", c: "ghost", ic: "eyeOff" },
};
const SCENE_VERB = { on: "mở WiFi cả nhà", off: "tắt WiFi cả nhà", ghost: "giả mạng hỏng" };
if (!I.eyeOff) I.eyeOff = P('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.5A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
if (!I.timer) I.timer = P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>');

const PT = { scene: "off" }; // lựa chọn đang chọn trong khung Hẹn giờ

function sceneHero() {
  const n = S.d.net; if (!n) return "";
  const sc = n.scene || (n.on ? "on" : "off"), g = n.grant, lv = n.live || { on: 0, total: 0 };
  const st = { on: "WiFi đang mở", off: "WiFi đang tắt", ghost: "Đang giả mạng hỏng" }[sc];
  const why = sc === "ghost" ? "Các em dò WiFi sẽ không thấy tên mạng nào" : sc === "off" ? "Mọi máy trong nhà đang mất WiFi" : lv.total ? `${lv.on}/${lv.total} WiFi đang phát` : "";
  const nextT = (n.timers || [])[0];
  const sub = g ? `Đang cho dùng thêm · còn <b class="num">${left(g.until)}</b>, sau đó tự về chế độ`
    : nextT ? `Hẹn <b>${SCENE_VERB[nextT.scene]}</b> lúc <b class="num">${hmVN(nextT.at)}</b> ${dayWord(nextT.at)}`
    : n.next ? `Theo lịch: tự <b>${n.next.on ? "mở" : "tắt"}</b> lúc <b class="num">${hmVN(n.next.at)}</b> ${dayWord(n.next.at)}` : "";
  return `<section class="card pz-hero is-${g ? "grant" : sc}">
    <div class="pz-dot">${sc === "ghost" ? I.eyeOff : I.wifi}</div>
    <div style="min-width:0"><div class="pz-st">${g ? "Đang dùng thêm" : st}</div><div class="meta">${why}${why && sub ? " · " : ""}${sub}</div></div>
  </section>`;
}

function sceneKeys() {
  const sc = S.d.net?.scene;
  return `<div class="card pz-card"><div class="card-h"><h2>Bấm 1 lần</h2><div class="grow"></div><small class="hide-m">Áp dụng ngay cho cả nhà</small></div>
    <div class="pz-keys">${["on", "off"].map((k) => { const u = SCENE_UI[k]; return `<button class="pz-key ${u.c} ${sc === k && !S.d.net?.grant ? "cur" : ""}" data-scene="${k}" aria-pressed="${sc === k}">
      <span class="pz-ic">${I[u.ic]}</span><b>${u.t}</b><small>${u.d}</small>${sc === k && !S.d.net?.grant ? '<span class="pz-now">Đang dùng</span>' : ""}</button>`; }).join("")}${gameKey()}</div>
    <div class="meta" style="margin-top:10px">${isAdmin() ? sceneScope() : "Camera, thiết bị nhà thông minh và WiFi riêng của Xuân San không bị ảnh hưởng."}</div></div>`;
}

// Phím nhanh chặn game: dùng chung nút data-appall của thẻ "Chặn game & nội dung" (appblock.js) → 2 chỗ luôn cùng một trạng thái
function gameKey() {
  const st = abGameState(); if (!st) return "";
  const on = st === "all";
  return `<button class="pz-key game ${on ? "cur" : ""}" data-appall="${on ? 0 : 1}" aria-pressed="${on}">
    <span class="pz-ic">${I.console || I.clock}</span><b>${on ? "Mở lại game" : "Chặn game"}</b><small>${on ? "Đang chặn hết game · bấm để cho chơi lại" : st === "some" ? "Đang chặn một phần · bấm để chặn hết" : "Liên Quân, Roblox, Discord, mọi game khác"}</small>${on ? '<span class="pz-now">Đang chặn</span>' : ""}</button>`;
}

// Xuân San: xem rõ phím nhanh tác động lên WiFi nào, chừa WiFi nào
function sceneScope() {
  const fam = new Set(), keep = new Set();
  (S.d?.routers || []).forEach((r) => r.ssids.forEach((x) => ((x.private || ((x.iot || x.hidden) && !x.ghost)) ? keep : fam).add(x.name)));
  return `<b>Tác động:</b> ${[...fam].map(esc).join(", ") || "—"}<br><b>Không đụng:</b> ${[...keep].map(esc).join(", ") || "—"}`;
}
function timerCard() {
  const T = S.d.net?.timers || [];
  return `<div class="card pz-card"><div class="card-h"><span style="color:var(--pri)">${I.timer}</span><h2>Hẹn giờ tự làm</h2></div>
    <div class="meta" style="margin:-6px 0 10px">Chọn việc, rồi chọn lúc nào. Tới giờ hệ thống tự làm, không cần bấm lại.</div>
    <div class="lbl">Việc cần làm</div>
    <div class="seg pz-seg" id="pzs">${["off", "on"].map((k) => `<button class="${PT.scene === k ? "on" : ""}" data-ps="${k}">${SCENE_UI[k].s}</button>`).join("")}</div>
    <div class="lbl" style="margin-top:14px">Làm lúc nào</div>
    <div class="pz-when">${[[30, "Sau 30 phút"], [60, "Sau 1 tiếng"], [120, "Sau 2 tiếng"]].map(([m, l]) => `<button class="opt" data-pm="${m}">${l}</button>`).join("")}<button class="opt" id="pzat">Chọn giờ…</button></div>
    ${T.length ? `<div class="lbl" style="margin-top:16px">Đã hẹn</div><div class="list">${T.map((t) => `<div class="row" style="cursor:default;grid-template-columns:auto minmax(0,1fr) auto"><span class="av soft">${I[SCENE_UI[t.scene].ic]}</span><div style="min-width:0"><div class="nm" style="white-space:normal;display:block">${SCENE_UI[t.scene].s} · <span class="num">${hmVN(t.at)}</span> ${dayWord(t.at)}</div><div class="meta">${esc(t.by)} hẹn · còn ${left(t.at)}</div></div><button class="btn sm" data-pdel="${t.id}">Huỷ</button></div>`).join("")}</div>` : ""}
    <div class="hint" style="margin-top:10px">Có thể trễ vài phút so với giờ hẹn.</div></div>`;
}

function grantCard() {
  const n = S.d.net; if (!n) return "";
  const g = n.grant, sc = n.scene;
  if (!g && sc === "on" && !(n.rules || []).some((r) => r.enabled) && !(n.limits || []).some((l) => l.enabled)) return "";
  return `<div class="card pz-card"><div class="card-h"><h2>${g ? "Đang cho dùng thêm giờ" : "Cho dùng thêm giờ"}</h2></div>
    <div class="meta" style="margin:-6px 0 10px">${g ? `Còn ${left(g.until)} (đến ${hmVN(g.until)}). Hết giờ tự tắt lại như cũ.` : "Mở WiFi ngay, kể cả đang trong giờ nghỉ. Hết giờ tự tắt lại như cũ."}</div>
    <div class="pz-when pz-3">${[[30, "30 phút"], [60, "1 tiếng"], [120, "2 tiếng"]].map(([m, l]) => `<button class="opt" data-grant="${m}">+${l}</button>`).join("")}${g ? `<button class="opt end" id="gend">Kết thúc ngay</button>` : ""}</div></div>`;
}

function vParentHome() {
  const gc = grantCard();
  return header(`Chào ${esc(S.me.name)}`) + `<div class="dash">
    ${gc ? `<div class="d-8">${sceneHero()}</div><div class="d-4">${gc}</div>` : `<div class="d-full">${sceneHero()}</div>`}
    <div class="d-8">${sceneKeys()}</div><div class="d-4">${timerCard()}</div>
    ${dashPair(appBlockCard(), wifiHomeCard())}</div>`;
}

async function runScene(k, btn) {
  const n = S.d.net;
  if (n?.scene === k && !n.grant) return toast(`Đang “${SCENE_UI[k].t}” rồi`);
  if (k !== "on" && !(await confirmBox(k === "ghost" ? "Giả mạng hỏng?" : "Tắt WiFi cả nhà?",
    (k === "ghost" ? "Tắt toàn bộ WiFi nhà và <b>ẩn luôn tên WiFi</b>, các em dò sẽ không thấy mạng nào, trông như mạng bị hỏng." : "Mọi điện thoại, máy tính trong nhà sẽ mất WiFi tới khi mở lại.")
    + "<br><br>Điện thoại Ba Mẹ cũng mất WiFi; app này vẫn dùng được bằng 4G. Camera và thiết bị nhà thông minh vẫn chạy.", SCENE_UI[k].t, true))) return;
  btn?.classList.add("busy");
  try {
    const r = await api("/net/scene", { body: { scene: k }, timeout: 45000 });
    S.d.net = r.net; toast(`Đã ${SCENE_VERB[k]} · router áp dụng sau ~30 giây`);
    load(); // tải lại công tắc từng WiFi cho khớp
  } catch (e) { toast(e.message, 1); btn?.classList.remove("busy"); return; }
  render();
}

function timeSheet() {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>${SCENE_UI[PT.scene].t} lúc mấy giờ?</h3><p>Giờ đã qua trong hôm nay sẽ hẹn cho ngày mai.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    <div class="field"><input class="inp" type="time" id="pzt" value="21:00" style="font-size:22px;height:56px;text-align:center"></div>
    <div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="pzok">Hẹn giờ</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $("#pzok").onclick = () => addTimer({ at: $("#pzt").value }, $("#pzok"), true);
}

function addTimer(when, btn, close) {
  return act(btn, async () => { const r = await api("/net/timer", { body: { scene: PT.scene, ...when } }); S.d.net = r.net; if (close) closeSheet(); render(); load(); }, `Đã hẹn ${SCENE_VERB[PT.scene]}`).catch(() => {});
}

function bindParent(root) {
  bindLimits(root);
  $$("[data-scene]", root).forEach((b) => (b.onclick = () => runScene(b.dataset.scene, b)));
  $$("[data-ps]", root).forEach((b) => (b.onclick = () => { PT.scene = b.dataset.ps; $$("[data-ps]", root).forEach((x) => x.classList.toggle("on", x === b)); }));
  $$("[data-pm]", root).forEach((b) => (b.onclick = () => addTimer({ minutes: Number(b.dataset.pm) }, b)));
  const at = $("#pzat", root); if (at) at.onclick = timeSheet;
  $$("[data-pdel]", root).forEach((b) => (b.onclick = () => act(b, async () => { const r = await api("/net/timer/" + b.dataset.pdel, { method: "DELETE" }); S.d.net = r.net; render(); }, "Đã huỷ hẹn giờ").catch(() => {})));
}

/* ---------- Giờ dùng WiFi (thay time limit của eWeb) — dùng cho cả Xuân San và Ba Mẹ ---------- */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_PRESET = [["Mỗi ngày", [0, 1, 2, 3, 4, 5, 6]], ["Ngày đi học (T2–T6)", [1, 2, 3, 4, 5]], ["Cuối tuần", [0, 6]]];
const WIN_PRESET = [["Trưa + tối", [["12:00", "18:00"], ["21:00", "22:00"]]], ["Chiều tối", [["17:00", "21:00"]]], ["Ban ngày", [["07:00", "21:00"]]]];
const lim = (name) => (S.d?.net?.limits || []).find((l) => l.enabled && l.ssid.toLowerCase() === String(name).toLowerCase());
const limAny = (name) => (S.d?.net?.limits || []).find((l) => l.ssid.toLowerCase() === String(name).toLowerCase());
function limitState(name, ms = Date.now()) {
  const l = lim(name); if (!l) return null;
  const at = (t) => { const { dow, hm } = vnNow(t); return !l.days.includes(dow) || l.wins.some(([a, b]) => hm >= a && hm < b); };
  const now = at(ms);
  for (let t = Math.ceil(ms / 60000) * 60000; t < ms + 8 * 86400000; t += 60000) if (at(t) !== now) return { ok: now, next: t };
  return { ok: now, next: null };
}
const winTxt = (l) => l.wins.map(([a, b]) => `${a}–${b}`).join(", ");
const dayTxt = (d) => d.length === 7 ? "mỗi ngày" : d.join() === "1,2,3,4,5" ? "T2–T6" : d.join() === "0,6" ? "cuối tuần" : DAY_ORDER.filter((x) => d.includes(x)).map((x) => DAYS[x]).join(" ");
// Thanh 24 giờ: phần xanh là giờ được dùng
function dayBar(wins) {
  const p = (hm) => { const [h, m] = hm.split(":").map(Number); return ((h * 60 + m) / 1440) * 100; };
  const nowP = p(vnNow().hm);
  return `<div class="lim-wrap"><div class="lim-bar" aria-hidden="true">${wins.map(([a, b]) => `<i style="left:${p(a)}%;width:${p(b) - p(a)}%"></i>`).join("")}<b style="left:${nowP}%"></b></div><div class="lim-ax"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div></div>`;
}
// Khung giờ được dùng của 1 lịch "tắt cả nhà" (phần bù của khung tắt) — để vẽ chung kiểu thanh 24 giờ
const ruleWins = (r) => (r.offAt < r.onAt ? [["00:00", r.offAt], [r.onAt, "24:00"]] : [[r.onAt, r.offAt]]).filter(([a, b]) => a < b);
function limitSheet(name) {
  const cur = limAny(name);
  const f = cur ? JSON.parse(JSON.stringify(cur)) : { ssid: name, enabled: true, days: [0, 1, 2, 3, 4, 5, 6], wins: [["17:00", "21:00"]] };
  const draw = () => {
    sheet(`<div class="grab"></div><div class="sheet-h"><span class="av soft">${I.wifi}</span><div class="t"><h3>Giờ dùng “${esc(name)}”</h3><p>WiFi chỉ phát trong các khung giờ dưới đây. Áp dụng cho mọi tầng.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
      <label class="chk" style="margin-bottom:14px"><input type="checkbox" id="len" ${f.enabled ? "checked" : ""}><div><div><b>Bật giới hạn giờ</b></div><div class="meta" style="font-size:12px">Tắt ô này = WiFi dùng tự do cả ngày</div></div></label>
      <div class="field"><label class="lbl">1. Ngày áp dụng</label><div class="opts" id="ldp">${DAY_PRESET.map(([l, d], i) => `<button class="opt ${f.days.join() === d.join() ? "on" : ""}" data-dp="${i}">${l}</button>`).join("")}</div>
        <div class="opts" id="ldy" style="margin-top:8px">${DAY_ORDER.map((d) => `<button class="opt ${f.days.includes(d) ? "on" : ""}" data-d="${d}" style="min-width:46px">${DAYS[d]}</button>`).join("")}</div>
        <div class="hint">Ngày không chọn thì WiFi dùng tự do cả ngày.</div></div>
      <div class="field"><label class="lbl">2. Khung giờ được dùng</label>
        <div id="lws">${f.wins.map(([a, b], i) => `<div class="lim-win"><input class="inp" type="time" data-wa="${i}" value="${a}" aria-label="Từ"><span>đến</span><input class="inp" type="time" data-wb="${i}" value="${b === "24:00" ? "23:59" : b}" aria-label="Đến"><button class="btn ghost icon" data-wx="${i}" aria-label="Xoá khung giờ" ${f.wins.length < 2 ? "disabled" : ""}>${I.trash}</button></div>`).join("")}</div>
        <div class="opts" style="margin-top:8px"><button class="opt" id="lwadd">${I.plus} Thêm khung giờ</button>${WIN_PRESET.map(([l, w], i) => `<button class="opt" data-wp="${i}">${l}</button>`).join("")}</div></div>
      <div class="lbl">Xem trước</div>${dayBar(f.wins.filter(([a, b]) => a < b))}
      <div class="lbl" style="margin-top:18px">Mật khẩu WiFi</div>
      <div class="meta" id="pwcur" style="margin-bottom:8px">Bấm “Xem” để hiện mật khẩu đang dùng.</div>
      <div class="opts"><button class="opt" id="pwshow">${I.eye}Xem mật khẩu</button><button class="opt" id="pwchg">${I.edit}Đổi mật khẩu</button></div>
      <div class="foot">${cur ? `<button class="btn red" id="ldel">${I.trash}Bỏ giới hạn</button>` : ""}<button class="btn" data-close>Huỷ</button><button class="btn pri" id="lsave">Lưu</button></div>`);
    $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
    const sync = () => { f.enabled = $("#len").checked; f.wins = f.wins.map((_, i) => [$(`[data-wa="${i}"]`).value, (v => v === "23:59" ? "24:00" : v)($(`[data-wb="${i}"]`).value)]); };
    $("#ldp").onclick = (e) => { const b = e.target.closest("[data-dp]"); if (!b) return; sync(); f.days = [...DAY_PRESET[+b.dataset.dp][1]]; draw(); };
    $("#ldy").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; sync(); const d = +b.dataset.d; f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort(); draw(); };
    $("#lwadd").onclick = () => { sync(); if (f.wins.length >= 6) return toast("Tối đa 6 khung giờ", 1); f.wins.push(["19:00", "21:00"]); draw(); };
    $$("[data-wp]").forEach((b) => (b.onclick = () => { sync(); f.wins = JSON.parse(JSON.stringify(WIN_PRESET[+b.dataset.wp][1])); draw(); }));
    $$("[data-wx]").forEach((b) => (b.onclick = () => { sync(); f.wins.splice(+b.dataset.wx, 1); draw(); }));
    const items = wifiGroups().find((g) => g.name === name)?.items || [];
    $("#pwshow").onclick = () => act($("#pwshow"), async () => { const r = await api("/wifi/secret", { body: { gid: items[0].r.gid, ssidId: items[0].s.id } }); $("#pwcur").innerHTML = `Mật khẩu đang dùng: <b style="user-select:all;font-size:16px">${esc(r.password || "(không có)")}</b>`; }).catch(() => {});
    $("#pwchg").onclick = () => passwordSheet(name, items);
    $$("#lws input").forEach((x) => (x.onchange = () => { sync(); draw(); }));
    $("#lsave").onclick = () => { sync(); if (!f.days.length) return toast("Chọn ít nhất 1 ngày", 1); const bad = f.wins.find(([a, b]) => !(a < b)); if (bad) return toast(`Khung ${bad[0]}–${bad[1]}: giờ kết thúc phải sau giờ bắt đầu`, 1);
      act($("#lsave"), async () => { const r = await api("/net/limits", { body: f, timeout: 45000 }); S.d.net = r.net; closeSheet(); load(); render(); }, "Đã lưu giờ dùng WiFi").catch(() => {}); };
    if ($("#ldel")) $("#ldel").onclick = async () => { if (!(await confirmBox(`Bỏ giới hạn “${esc(name)}”?`, "WiFi sẽ dùng tự do cả ngày. Nếu đang tắt do ngoài giờ thì bấm bật lại ở mục WiFi nhanh.", "Bỏ giới hạn", true))) return;
      act(null, async () => { const r = await api("/net/limits/" + cur.id, { method: "DELETE" }); S.d.net = r.net; render(); load(); }, "Đã bỏ giới hạn").catch(() => {}); };
  };
  draw();
}
// Đổi mật khẩu 1 WiFi ở mọi tầng cùng lúc
function passwordSheet(name, items) {
  sheet(`<div class="grab"></div><div class="sheet-h"><span class="av soft">${I.lock}</span><div class="t"><h3>Đổi mật khẩu “${esc(name)}”</h3><p>Đổi cùng lúc ở ${items.length} tầng. Mọi máy đang dùng WiFi này phải nhập lại mật khẩu mới.</p></div><button class="btn ghost icon" data-close>${I.x}</button></div>
    <div class="field"><label class="lbl">Mật khẩu mới (ít nhất 8 ký tự)</label><input class="inp" id="npw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="63" style="font-size:18px"></div>
    <div class="field"><label class="lbl">Nhập lại</label><input class="inp" id="npw2" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="63" style="font-size:18px"></div>
    <div class="foot"><button class="btn" data-close>Huỷ</button><button class="btn pri" id="npws">Đổi mật khẩu</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = () => limitSheet(name)));
  $("#npws").onclick = async () => {
    const a = $("#npw").value, b = $("#npw2").value;
    if (a.length < 8) return toast("Mật khẩu phải có ít nhất 8 ký tự", 1);
    if (a !== b) return toast("Hai lần nhập không khớp", 1);
    if (!(await confirmBox(`Đổi mật khẩu “${esc(name)}”?`, `Mật khẩu mới: <b>${esc(a)}</b><br><br>Điện thoại, TV, máy tính đang dùng WiFi này sẽ rớt mạng và phải nhập lại mật khẩu mới. Camera và thiết bị thông minh không bị ảnh hưởng.`, "Đổi mật khẩu", true))) return limitSheet(name);
    const res = await Promise.allSettled(items.map((x) => api("/wifi/password", { body: { gid: x.r.gid, ssidId: x.s.id, password: a, name }, timeout: 30000 })));
    const bad = res.filter((r) => r.status === "rejected");
    if (bad.length) toast(`${bad.length}/${items.length} tầng chưa đổi được: ${bad[0].reason?.message || ""}`, 1);
    else { toast(`Đã đổi mật khẩu ${name} · router áp dụng sau ~30 giây`); closeSheet(); }
  };
}
function bindLimits(root) { $$("[data-lim]", root).forEach((b) => (b.onclick = () => limitSheet(b.dataset.lim))); }
