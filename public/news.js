/* WiFi Nhà — bảng "Có gì mới": mỗi lần có cập nhật, ai mở app cũng thấy 1 bảng ngắn, lời lẽ dễ hiểu, có ví dụ.
   Bấm "Đã hiểu" thì server ghi lại theo từng người (Xuân San / Ba / Mẹ), lần sau không hiện lại.
   THÊM TÍNH NĂNG MỚI: thêm 1 mục lên ĐẦU danh sách NEWS (id không trùng). admin: true = chỉ Xuân San thấy. */
"use strict";
const NEWS = [
  { id: "2026-11-24-faceid", date: "24/11/2026", title: "Mở app bằng khuôn mặt hoặc vân tay",
    text: "Không cần gõ mã PIN mỗi lần nữa. Mã PIN vẫn dùng được như cũ.",
    eg: "Ba mở app, đưa mặt vào điện thoại là vào ngay, giống lúc mở khoá điện thoại.",
    how: "Vào Cài đặt (hoặc Tài khoản) → bấm “Bật trên máy này”. Mỗi máy chỉ cần làm 1 lần." },
  { id: "2026-11-24-idle15", date: "24/11/2026", title: "App tự khoá sau 15 phút không dùng",
    text: "Để người khác cầm máy không tự ý chỉnh WiFi trong nhà.",
    eg: "Mẹ để điện thoại trên bàn 20 phút. Khi mở lại, app hỏi khuôn mặt hoặc mã PIN rồi mới cho vào." },
  { id: "2026-11-24-on-dinh", date: "24/11/2026", title: "App chạy ổn định hơn",
    text: "Đã sửa lỗi thỉnh thoảng bấm vào thì app hiện dòng báo lỗi màu đỏ.",
    eg: "Trước đây mở mục Cài đặt đôi khi bị kẹt chữ “Đang tải…”. Giờ mở là hiện ngay." },
];
const newsFor = () => NEWS.filter((n) => !n.admin || isAdmin());
function newsSheet(items, mark) {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>Có gì mới</h3><p>${mark ? "App vừa được cập nhật. Đọc nhanh 1 phút là nắm." : "Các cập nhật gần đây."}</p></div><button class="btn ghost icon" data-close aria-label="Đóng">${I.x}</button></div>
    <div class="news">${items.map((n) => `<div class="news-i"><div class="news-t">${esc(n.title)}</div><div class="news-d">${esc(n.date)}</div><p>${esc(n.text)}</p>${n.eg ? `<p class="news-eg"><b>Ví dụ:</b> ${esc(n.eg)}</p>` : ""}${n.how ? `<p class="news-eg"><b>Cách dùng:</b> ${esc(n.how)}</p>` : ""}</div>`).join("")}</div>
    <div class="foot"><button class="btn pri block" id="newsOk" style="height:48px">${mark ? "Đã hiểu" : "Đóng"}</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $("#newsOk").onclick = () => { if (mark) api("/news", { body: { ids: items.map((n) => n.id) } }).catch(() => {}); closeSheet(); };
}
// Gọi sau khi vào app: còn mục chưa xem thì hiện bảng (mỗi phiên đăng nhập hỏi server 1 lần)
async function newsCheck() {
  if (!S.me || S._news === S.me.uid) return;
  S._news = S.me.uid;
  try {
    const { seen } = await api("/news");
    const fresh = newsFor().filter((n) => !seen.includes(n.id));
    if (fresh.length && S.me && !$("#scrim").classList.contains("show")) newsSheet(fresh, true);
  } catch {}
}
const newsCard = () => `<div class="card"><div class="card-h"><h2>Có gì mới</h2></div><p class="meta" style="margin-bottom:12px">Xem lại các tính năng vừa cập nhật, giải thích ngắn gọn kèm ví dụ.</p><button class="btn block" id="newsAll" style="height:44px">Xem các cập nhật</button></div>`;
function newsBind() { const b = $("#newsAll"); if (b) b.onclick = () => newsSheet(newsFor(), false); }
