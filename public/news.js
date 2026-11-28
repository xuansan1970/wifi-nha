/* WiFi Nhà — mục "Tính năng mới" (thanh bên) + bảng bật lên: mỗi lần có cập nhật, ai mở app cũng thấy 1 bảng ngắn, lời lẽ dễ hiểu, có ví dụ.
   Bấm "Đã hiểu" thì server ghi lại theo từng người (Xuân San / Ba / Mẹ), lần sau không hiện lại.
   THÊM TÍNH NĂNG MỚI: thêm 1 mục lên ĐẦU danh sách NEWS (id không trùng). admin: true = chỉ Xuân San thấy. */
"use strict";
const NEWS = [
  // 28/11/2026: viết lại toàn bộ cho ngắn (id mới "n2-…" → bảng bật lên hiện lại 1 lần cho mọi tài khoản, mọi máy)
  { id: "n2-5-tab", date: "28/11/2026", title: "Điện thoại: 5 mục ở thanh dưới",
    text: "Mạng · WiFi · Chặn · Thiết bị · Thêm. Mỗi mục một việc, dễ tìm." },
  { id: "n2-chan-game", date: "28/11/2026", title: "Chặn game: bấm 1 lần",
    text: "Mục Mạng → bấm “Chặn game” là chặn hết game; bấm lại là mở. TV vẫn xem YouTube, Netflix bình thường." },
  { id: "n2-chan-them", date: "24/11/2026", title: "Chặn mạng xã hội, đặt giờ chặn",
    text: "Mục Chặn: gạt để chặn TikTok, YouTube…; đặt giờ để tự chặn, tự mở. Máy dùng 4G thì không chặn được." },
  { id: "n2-chan-may", date: "24/11/2026", title: "Chặn một máy là chặn hẳn",
    text: "Máy bị chặn không vào được WiFi nào trong nhà, đổi sang WiFi khác cũng không lách được." },
  { id: "n2-ten-may", date: "24/11/2026", title: "Tên máy đúng hơn",
    text: "Camera, TV, laptop hiện đúng tên và loại. Máy giấu tên ghi là “Thiết bị ẩn danh”." },
  { id: "n2-hoat-dong", admin: true, date: "24/11/2026", title: "Mục Hoạt động",
    text: "Xem máy nào đã vào mạng, dùng bao nhiêu dữ liệu, sóng mạnh hay yếu." },
  { id: "n2-faceid", date: "24/11/2026", title: "Mở app bằng khuôn mặt, tự khoá sau 15 phút",
    text: "Bật ở Cài đặt → “Bật trên máy này”. Để máy 15 phút không dùng, app tự khoá." },
  { id: "n2-may-tinh", date: "28/11/2026", title: "Máy tính: trang đầu thấy hết một lần",
    text: "Các ô xếp cạnh nhau. Mở trong Nhà Mình thì menu nằm ngang phía trên." },
];
I.spark = P('<path d="M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M19 16v4M17 18h4"/>');
const newsFor = () => NEWS.filter((n) => !n.admin || isAdmin());
const newsUnseen = () => (S.newsSeen ? newsFor().filter((n) => !S.newsSeen.includes(n.id)).length : 0);
const newsItem = (n, fresh) => `<div class="news-i"><div class="news-t">${esc(n.title)}${fresh ? ' <span class="badge" style="vertical-align:2px">Mới</span>' : ""}</div><div class="news-d">${esc(n.date)}</div><p>${esc(n.text)}</p>${n.eg ? `<p class="news-eg"><b>Ví dụ:</b> ${esc(n.eg)}</p>` : ""}${n.how ? `<p class="news-eg"><b>Cách dùng:</b> ${esc(n.how)}</p>` : ""}</div>`;
async function newsMark(ids) {
  if (!ids.length) return;
  S.newsSeen = [...new Set([...(S.newsSeen || []), ...ids])];
  try { await api("/news", { body: { ids } }); } catch {}
}
/* Mục "Tính năng mới" ở thanh bên: toàn bộ thông báo cập nhật, mới nhất ở trên */
function vNews() {
  const seen = S.newsSeen || [];
  return header("Tính năng mới") + `<p class="meta" style="margin:-4px 0 14px">Các cập nhật của app, mới nhất ở trên.</p><div class="news" style="max-width:720px">${newsFor().map((n) => newsItem(n, (S.newsFresh || []).includes(n.id) || (S.newsSeen && !seen.includes(n.id)))).join("") || '<div class="meta">Chưa có cập nhật nào.</div>'}</div>`;
}
// Mở mục này = đã xem: xoá số đỏ (các nhãn "Mới" vẫn giữ cho lần xem này)
function newsOpened() { const ids = newsFor().filter((n) => S.newsSeen && !S.newsSeen.includes(n.id)).map((n) => n.id); S.newsFresh = ids; if (ids.length) newsMark(ids).then(() => { if (S.me) shell(), render(); }); }
// Bảng bật lên khi vào app nếu còn cập nhật chưa xem
function newsSheet(items) {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>Tính năng mới</h3><p>App vừa cập nhật. Đọc 30 giây là nắm.</p></div><button class="btn ghost icon" data-close aria-label="Đóng">${I.x}</button></div>
    <div class="news">${items.map((n) => newsItem(n, false)).join("")}</div>
    <div class="foot"><button class="btn pri block" id="newsOk" style="height:48px">Đã hiểu</button></div>`);
  $$("[data-close]", $("#sheet")).forEach((b) => (b.onclick = closeSheet));
  $("#newsOk").onclick = () => { closeSheet(); newsMark(items.map((n) => n.id)).then(() => { if (S.me) shell(), render(); }); };
}
// Gọi sau khi vào app (mỗi phiên đăng nhập hỏi server 1 lần): nạp danh sách đã xem, hiện số đỏ và bảng bật lên
async function newsCheck() {
  if (!S.me || S._news === S.me.uid) return;
  S._news = S.me.uid; S.newsSeen = null;
  try {
    S.newsSeen = (await api("/news")).seen;
    if (!S.me) return;
    shell(); render();
    const fresh = newsFor().filter((n) => !S.newsSeen.includes(n.id));
    if (fresh.length && S.tab !== "news" && !$("#scrim").classList.contains("show")) newsSheet(fresh);
  } catch {}
}
