/* WiFi Nhà — mở khoá bằng Face ID / vân tay (passkey của máy). Dùng chung $, $$, api, act, toast, esc, ago, confirmBox, I từ app.js.
   Khuôn mặt/vân tay không rời khỏi máy; server chỉ giữ khoá công khai. PIN vẫn là đường dự phòng. */
"use strict";
const FID_KEY = "wn_fid"; // chỉ để nhớ "máy này đã bật" cho hiện nút; quyền vào app do server kiểm
const FID_IC = '<svg class="i" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9 16c1.8 1.3 4.2 1.3 6 0"/></svg>';
const fidB = (buf) => { let s = ""; new Uint8Array(buf).forEach((c) => (s += String.fromCharCode(c))); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fidU = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const fidEmbed = () => window.parent !== window;
// Nhúng trong app tổng (iframe khác nguồn) thì trình duyệt chỉ cho dùng khi trang ngoài cấp phép
const fidCan = () => !!(window.PublicKeyCredential && navigator.credentials?.create) && (!fidEmbed() || !!document.featurePolicy?.allowsFeature?.("publickey-credentials-get"));
const fidOn = () => { try { return localStorage.getItem(FID_KEY) === "1"; } catch { return false; } };
const fidSet = (v) => { try { v ? localStorage.setItem(FID_KEY, "1") : localStorage.removeItem(FID_KEY); } catch {} };
const fidUA = navigator.userAgent;
const fidName = () => (/iPhone|iPad/.test(fidUA) ? "Face ID" : /Android/.test(fidUA) ? "vân tay" : /Macintosh/.test(fidUA) ? "Touch ID" : "khoá của máy");
const fidDevice = () => (/iPhone/.test(fidUA) ? "iPhone" : /iPad/.test(fidUA) ? "iPad" : /Android/.test(fidUA) ? "Điện thoại Android" : /Macintosh/.test(fidUA) ? "MacBook" : /Windows/.test(fidUA) ? "Máy Windows" : "Thiết bị");
const fidErr = (e) => e.name === "NotAllowedError" ? `Đã huỷ, hoặc máy chưa bật ${fidName()}` : e.name === "InvalidStateError" ? "Máy này đã bật rồi" : e.name === "SecurityError" ? "Trình duyệt chặn ở chế độ nhúng — mở thẳng app WiFi Nhà" : e.message || "Không dùng được khoá của máy";

async function fidLogin() {
  const o = await api("/webauthn/login/options", { body: {} });
  let c;
  try { c = await navigator.credentials.get({ publicKey: { challenge: fidU(o.challenge), rpId: o.rpId, userVerification: "required", timeout: 60000 } }); }
  catch (e) { throw new Error(fidErr(e)); }
  const r = c.response;
  try {
    return (await api("/webauthn/login", { body: { token: o.token, id: fidB(c.rawId), clientDataJSON: fidB(r.clientDataJSON), authenticatorData: fidB(r.authenticatorData), signature: fidB(r.signature) } })).me;
  } catch (e) { if (/chưa bật Face ID/.test(e.message)) fidSet(false); throw e; }
}
async function fidEnable() {
  const o = await api("/webauthn/register/options", { body: {} });
  let c;
  try {
    c = await navigator.credentials.create({ publicKey: {
      rp: o.rp, user: { id: fidU(o.user.id), name: o.user.name, displayName: o.user.name }, challenge: fidU(o.challenge),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: o.exclude.map((id) => ({ type: "public-key", id: fidU(id) })), attestation: "none", timeout: 60000,
    } });
  } catch (e) { if (e.name === "InvalidStateError") fidSet(true); throw new Error(fidErr(e)); }
  const r = c.response;
  if (!r.getPublicKey || !r.getAuthenticatorData) throw new Error("Trình duyệt quá cũ — cập nhật rồi thử lại");
  await api("/webauthn/register", { body: { token: o.token, id: fidB(c.rawId), clientDataJSON: fidB(r.clientDataJSON), authenticatorData: fidB(r.getAuthenticatorData()), publicKey: fidB(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(), label: fidDevice() } });
  fidSet(true);
}

/* Màn hình đăng nhập: nút chỉ hiện trên máy đã bật */
const fidLoginBtn = () => (fidCan() && fidOn() ? `<button class="btn block fid-btn" id="fidGo">${FID_IC}Mở khoá bằng ${fidName()}</button>` : "");
function fidBindLogin(done, redraw) {
  const b = $("#fidGo"); if (!b) return;
  b.onclick = () => act(b, fidLogin).then(done).catch(() => { if (!fidOn()) redraw(); });
}

/* Cài đặt: bật cho máy này, xem và gỡ các máy đã bật */
function fidCard() {
  return `<div class="card"><div class="card-h"><h2>Mở khoá bằng Face ID / vân tay</h2></div>
    <p class="meta" style="margin-bottom:12px">Vào app bằng khuôn mặt hoặc vân tay của máy, không cần gõ PIN. Khuôn mặt/vân tay không rời khỏi máy. Mã PIN vẫn dùng được như cũ.</p>
    <div id="fidList" class="list"><div class="meta">Đang tải…</div></div>
    ${fidCan() ? `<button class="btn pri block" id="fidAdd" style="margin-top:12px;height:48px">${FID_IC}Bật trên máy này</button>` : `<p class="meta" style="margin-top:12px">${fidEmbed() ? "Đang mở trong app Nhà Mình nên chưa bật được ở đây. Mở thẳng app WiFi Nhà để bật." : "Trình duyệt hoặc máy này chưa hỗ trợ."}</p>`}</div>`;
}
async function fidLoadList() {
  const el = $("#fidList"); if (!el) return;
  try {
    const { keys } = await api("/webauthn/list");
    if (!$("#fidList")) return;
    el.innerHTML = keys.length ? keys.map((k) => `<div class="row" style="cursor:default"><span class="av round" style="background:var(--surface2);color:var(--ink)">${FID_IC}</span><div><div class="nm">${esc(k.label)}${k.uid !== S.me.uid ? ` · ${esc(k.owner)}` : ""}</div><div class="meta">Bật ${ago(k.at)} · ${k.last ? "dùng " + ago(k.last) : "chưa dùng"}</div></div><button class="btn sm" style="min-height:44px" data-fid="${esc(k.id)}" data-n="${esc(k.label)}">Gỡ</button></div>`).join("") : '<div class="meta">Chưa có máy nào bật.</div>';
    $$("[data-fid]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox("Gỡ máy này?", `"${b.dataset.n}" sẽ phải nhập PIN để vào app.`, "Gỡ", true))) return;
      act(b, async () => { await api("/webauthn/remove", { body: { id: b.dataset.fid } }); await fidLoadList(); }, "Đã gỡ").catch(() => {});
    }));
  } catch (e) { el.innerHTML = `<div class="meta">${esc(e.message)}</div>`; }
}
function fidBind() {
  if (!$("#fidList")) return;
  fidLoadList();
  const a = $("#fidAdd"); if (a) a.onclick = () => act(a, async () => { await fidEnable(); await fidLoadList(); }, `Đã bật — lần sau bấm "Mở khoá bằng ${fidName()}"`).catch(() => {});
}
