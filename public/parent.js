/* WiFi Nhà · màn hình Điều khiển cho Ba Mẹ (tối giản, nút to).
   Dùng chung hàm của app.js: S, api, act, render, sheet, closeSheet, confirmBox, toast, I, esc, hmVN, dayWord, left, quickWifiCard.
   Mọi nút đọc trạng thái từ S.d.net (server tính theo router thật) → bấm xong luôn vẽ lại từ dữ liệu server trả về. */

const SCENE_UI = {
  on: { t: "Mở hết", d: "Bật lại toàn bộ WiFi nhà", c: "on", ic: "power" },
  off: { t: "Tắt hết", d: "Tắt toàn bộ WiFi nhà", c: "off", ic: "power" },
  ghost: { t: "Giả lỗi", d: "Tắt + ẩn tên WiFi, dò không thấy", c: "ghost", ic: "eyeOff" },
};
const SCENE_VERB = { on: "mở mạng", off: "tắt mạng", ghost: "giả lỗi" };
if (!I.eyeOff) I.eyeOff = P('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.5A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');
if (!I.timer) I.timer = P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>');

const PT = { scene: "off" }; // lựa chọn đang chọn trong khung Hẹn giờ

function sceneHero() {
  const n = S.d.net; if (!n) return "";
  const sc = n.scene || (n.on ? "on" : "off"), g = n.grant, lv = n.live || { on: 0, total: 0 };
  const st = { on: "Mạng đang mở", off: "Mạng đang tắt", ghost: "Đang giả lỗi" }[sc];
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
  return `<div class="card pz-card"><div class="card-h"><h2>Phím nhanh</h2><div class="grow"></div><small class="hide-m">Bấm 1 lần là xong</small></div>
    <div class="pz-keys">${["on", "off", "ghost"].map((k) => { const u = SCENE_UI[k]; return `<button class="pz-key ${u.c} ${sc === k && !S.d.net?.grant ? "cur" : ""}" data-scene="${k}" aria-pressed="${sc === k}">
      <span class="pz-ic">${I[u.ic]}</span><b>${u.t}</b><small>${u.d}</small>${sc === k && !S.d.net?.grant ? '<span class="pz-now">Đang dùng</span>' : ""}</button>`; }).join("")}</div>
    <div class="meta" style="margin-top:10px">Camera, thiết bị nhà thông minh và WiFi riêng của Xuân San không bị ảnh hưởng.</div></div>`;
}

function timerCard() {
  const T = S.d.net?.timers || [];
  return `<div class="card pz-card"><div class="card-h"><span style="color:var(--pri)">${I.timer}</span><h2>Hẹn giờ</h2></div>
    <div class="lbl">1. Muốn làm gì</div>
    <div class="seg pz-seg" id="pzs">${["off", "ghost", "on"].map((k) => `<button class="${PT.scene === k ? "on" : ""}" data-ps="${k}">${SCENE_UI[k].t}</button>`).join("")}</div>
    <div class="lbl" style="margin-top:14px">2. Khi nào</div>
    <div class="pz-when">${[[30, "Sau 30 phút"], [60, "Sau 1 tiếng"], [120, "Sau 2 tiếng"]].map(([m, l]) => `<button class="opt" data-pm="${m}">${l}</button>`).join("")}<button class="opt" id="pzat">Chọn giờ…</button></div>
    ${T.length ? `<div class="lbl" style="margin-top:16px">Đã hẹn</div><div class="list">${T.map((t) => `<div class="row" style="cursor:default;grid-template-columns:auto minmax(0,1fr) auto"><span class="av soft">${I[SCENE_UI[t.scene].ic]}</span><div style="min-width:0"><div class="nm" style="white-space:normal">${SCENE_UI[t.scene].t} · <span class="num">${hmVN(t.at)}</span> ${dayWord(t.at)}</div><div class="meta">${esc(t.by)} hẹn · còn ${left(t.at)}</div></div><button class="btn sm" data-pdel="${t.id}">Huỷ</button></div>`).join("")}</div>` : ""}
    <div class="hint" style="margin-top:10px">Hệ thống kiểm tra mỗi 5 phút nên có thể trễ vài phút so với giờ hẹn.</div></div>`;
}

function grantCard() {
  const n = S.d.net; if (!n) return "";
  const g = n.grant, sc = n.scene;
  if (!g && sc === "on" && !(n.rules || []).some((r) => r.enabled) && !(n.limits || []).some((l) => l.enabled)) return "";
  return `<div class="card pz-card"><div class="card-h"><h2>${g ? "Đang cho dùng thêm" : sc === "on" ? "Cho dùng thêm" : "Mở tạm một lúc"}</h2></div>
    <div class="meta" style="margin:-6px 0 10px">${g ? `Còn ${left(g.until)} (đến ${hmVN(g.until)}). Hết giờ tự về lại như cũ.` : sc === "on" ? "Mở cả WiFi đang ngoài giờ dùng / bỏ qua lịch tắt trong một lúc, hết giờ tự về lại như cũ." : "Mở mạng trong một lúc, hết giờ tự tắt lại như cũ."}</div>
    <div class="pz-when">${[[30, "30 phút"], [60, "1 tiếng"], [120, "2 tiếng"]].map(([m, l]) => `<button class="opt" data-grant="${m}">${g ? "+" : ""}${l}</button>`).join("")}${g ? `<button class="opt end" id="gend">Kết thúc ngay</button>` : ""}</div></div>`;
}

function vParentHome() {
  return header(`Chào ${esc(S.me.name)}`) + sceneHero() + `<div class="pz-grid">${sceneKeys()}${timerCard()}</div>`
    + grantCard() + quickWifiCard() + limitsCard();
}

async function runScene(k, btn) {
  const n = S.d.net;
  if (n?.scene === k && !n.grant) return toast(`Đang ở chế độ “${SCENE_UI[k].t}” rồi`);
  if (k !== "on" && !(await confirmBox(k === "ghost" ? "Giả lỗi mạng?" : "Tắt toàn bộ mạng?",
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
  return act(btn, async () => { const r = await api("/net/timer", { body: { scene: PT.scene, ...when } }); S.d.net = r.net; if (close) closeSheet(); render(); }, `Đã hẹn ${SCENE_VERB[PT.scene]}`).catch(() => {});
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
  return `<div class="lim-bar" aria-hidden="true">${wins.map(([a, b]) => `<i style="left:${p(a)}%;width:${p(b) - p(a)}%"></i>`).join("")}<b style="left:${nowP}%"></b></div><div class="lim-ax"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`;
}
// Khung giờ được dùng của 1 lịch "tắt cả nhà" (phần bù của khung tắt) — để vẽ chung kiểu thanh 24 giờ
const ruleWins = (r) => (r.offAt < r.onAt ? [["00:00", r.offAt], [r.onAt, "24:00"]] : [[r.onAt, r.offAt]]).filter(([a, b]) => a < b);
function familyRows() {
  const R = S.d?.net?.rules || [];
  return R.map((r) => `<div class="row lim-row" style="cursor:default;opacity:${r.enabled ? 1 : .55}"><div style="min-width:0">
      <div class="nm" style="white-space:normal">Tắt ${esc(r.offAt)} → mở ${esc(r.onAt)}</div>
      <div class="meta">${esc(r.name)} · ${dayTxt(r.days)}${r.mode === "ghost" ? " · <b>giả lỗi (tắt + ẩn)</b>" : ""}</div>${r.enabled ? dayBar(ruleWins(r)) : ""}</div>
    <div class="rr" style="flex-direction:column;align-items:flex-end;gap:6px"><button class="sw ${r.enabled ? "on" : ""}" role="switch" aria-checked="${r.enabled}" aria-label="Bật/tắt lịch" data-nrt="${r.id}"></button>
      <div style="display:flex"><button class="btn ghost sm icon" data-nre="${r.id}" aria-label="Sửa">${I.edit}</button><button class="btn ghost sm icon" data-nrd="${r.id}" aria-label="Xoá">${I.trash}</button></div></div></div>`).join("");
}
function limitsCard() {
  const G = typeof wifiGroups === "function" ? wifiGroups().filter((g) => !g.private) : [];
  const fam = familyRows();
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><span style="color:var(--pri)">${I.clock}</span><h2>Lịch dùng WiFi</h2></div>
  <p class="meta" style="margin:-6px 0 12px">Phần <b style="color:var(--ok)">xanh</b> là giờ được dùng, ngoài giờ WiFi tự tắt, tới giờ tự bật lại. Lịch cả nhà được ưu tiên hơn lịch từng WiFi.</p>
  <div class="lbl" style="display:flex;align-items:center;gap:8px;margin-bottom:4px">Cả nhà (mọi WiFi)<span class="grow" style="flex:1"></span><button class="btn sm" id="nradd">${I.plus}<span>Thêm giờ tắt</span></button></div>
  ${fam ? `<div class="list">${fam}</div>` : `<div class="meta" style="margin:4px 0 8px">Chưa có. Ví dụ: tắt cả nhà 22:00 → mở 6:00 mỗi ngày.</div>`}
  ${G.length ? `<div class="lbl" style="margin-top:16px">Từng WiFi</div>
  <div class="list">${G.map((g) => { const l = limAny(g.name), st = limitState(g.name);
    const chip = !l || !l.enabled ? `<span class="chip">Tự do</span>` : st.ok ? `<span class="chip ok">Trong giờ</span>` : `<span class="chip warn">Ngoài giờ</span>`;
    const nxt = l?.enabled && st?.next ? ` · ${st.ok ? "tắt" : "mở"} ${hmVN(st.next)}${dayWord(st.next) === "hôm nay" ? "" : " " + dayWord(st.next)}` : "";
    return `<button class="row lim-row" data-lim="${esc(g.name)}"><div style="min-width:0;flex:1"><div class="nm"><span class="ell">${esc(g.name)}</span></div>
      ${l ? `<div class="meta">${esc(winTxt(l))} · ${dayTxt(l.days)}${nxt}</div>${l.enabled ? dayBar(l.wins) : ""}` : `<div class="meta">Dùng cả ngày · bấm để đặt giờ</div>`}</div>
      <div class="rr" style="flex-direction:column;align-items:flex-end;gap:6px">${chip}<span class="meta" style="font-weight:600">${l ? "Sửa" : "Đặt giờ"} ${I.chev}</span></div></button>`; }).join("")}</div>` : ""}</div>`;
}
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
      <div class="foot">${cur ? `<button class="btn red" id="ldel">${I.trash}Bỏ giới hạn</button>` : ""}<button class="btn" data-close>Huỷ</button><button class="btn pri" id="lsave">Lưu</button></div>`);
    $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
    const sync = () => { f.enabled = $("#len").checked; f.wins = f.wins.map((_, i) => [$(`[data-wa="${i}"]`).value, (v => v === "23:59" ? "24:00" : v)($(`[data-wb="${i}"]`).value)]); };
    $("#ldp").onclick = (e) => { const b = e.target.closest("[data-dp]"); if (!b) return; sync(); f.days = [...DAY_PRESET[+b.dataset.dp][1]]; draw(); };
    $("#ldy").onclick = (e) => { const b = e.target.closest("[data-d]"); if (!b) return; sync(); const d = +b.dataset.d; f.days = f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort(); draw(); };
    $("#lwadd").onclick = () => { sync(); if (f.wins.length >= 6) return toast("Tối đa 6 khung giờ", 1); f.wins.push(["19:00", "21:00"]); draw(); };
    $$("[data-wp]").forEach((b) => (b.onclick = () => { sync(); f.wins = JSON.parse(JSON.stringify(WIN_PRESET[+b.dataset.wp][1])); draw(); }));
    $$("[data-wx]").forEach((b) => (b.onclick = () => { sync(); f.wins.splice(+b.dataset.wx, 1); draw(); }));
    $$("#lws input").forEach((x) => (x.onchange = () => { sync(); draw(); }));
    $("#lsave").onclick = () => { sync(); if (!f.days.length) return toast("Chọn ít nhất 1 ngày", 1); const bad = f.wins.find(([a, b]) => !(a < b)); if (bad) return toast(`Khung ${bad[0]}–${bad[1]}: giờ kết thúc phải sau giờ bắt đầu`, 1);
      act($("#lsave"), async () => { const r = await api("/net/limits", { body: f, timeout: 45000 }); S.d.net = r.net; closeSheet(); load(); render(); }, "Đã lưu giờ dùng WiFi").catch(() => {}); };
    if ($("#ldel")) $("#ldel").onclick = async () => { if (!(await confirmBox(`Bỏ giới hạn “${esc(name)}”?`, "WiFi sẽ dùng tự do cả ngày. Nếu đang tắt do ngoài giờ thì bấm bật lại ở mục WiFi nhanh.", "Bỏ giới hạn", true))) return;
      act(null, async () => { const r = await api("/net/limits/" + cur.id, { method: "DELETE" }); S.d.net = r.net; render(); }, "Đã bỏ giới hạn").catch(() => {}); };
  };
  draw();
}
function bindLimits(root) { $$("[data-lim]", root).forEach((b) => (b.onclick = () => limitSheet(b.dataset.lim))); }
