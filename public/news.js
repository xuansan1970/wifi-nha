/* WiFi Nhà — mục "Tính năng mới" (thanh bên) + bảng bật lên: mỗi lần có cập nhật, ai mở app cũng thấy 1 bảng ngắn, lời lẽ dễ hiểu, có ví dụ.
   Bấm "Đã hiểu" thì server ghi lại theo từng người (Xuân San / Ba / Mẹ), lần sau không hiện lại.
   THÊM TÍNH NĂNG MỚI: thêm 1 mục lên ĐẦU danh sách NEWS (id không trùng). admin: true = chỉ Xuân San thấy. */
"use strict";
const NEWS = [
  { id: "2026-11-24-chan-game", date: "24/11/2026", title: "Chặn game, mạng xã hội và nội dung xấu cho cả nhà",
    text: "Trang đầu có thẻ “Chặn game & nội dung”: gạt để chặn Liên Quân, Roblox, Discord, mọi game khác; bấm “Chặn thêm” để chặn TikTok, YouTube, web người lớn… Có thể đặt giờ chặn tự động.",
    eg: "Đặt giờ chặn 19:00–21:00 từ thứ Hai đến thứ Sáu: tới giờ học, game tự bị chặn, 21:00 tự mở lại.",
    how: "Chặn ở đây là chặn mọi máy dùng WiFi nhà, kể cả máy người lớn. Máy bật 4G thì không chặn được." },
  { id: "2026-11-24-hoat-dong", admin: true, date: "24/11/2026", title: "Mục “Hoạt động”: ai đã vào mạng, dùng bao nhiêu",
    text: "Xem từng tầng: máy nào đã vào mạng từ hôm qua tới giờ (kể cả máy đã rời đi), dùng bao nhiêu dữ liệu, sóng tốt hay yếu, WiFi nào tải nặng, kênh có nghẽn không.",
    eg: "Thấy một máy lạ dùng 3 GB ở Tầng 1 dù giờ đã offline: bấm vào để đặt tên, gán chủ hoặc chặn." },
  { id: "2026-11-24-an-danh", date: "24/11/2026", title: "Máy giấu tên được gọi đúng hơn",
    text: "Máy tự giấu thông tin giờ hiện là “Thiết bị ẩn danh” thay vì luôn bị gọi là điện thoại. Máy nào router biết hãng thì hiện hãng.",
    eg: "Một chiếc laptop giấu tên trước đây bị ghi nhầm là “Điện thoại ẩn danh”. Giờ không còn nhầm." },
  { id: "2026-11-24-muc-moi", date: "24/11/2026", title: "Có mục “Tính năng mới”",
    text: "Mọi cập nhật của app được ghi lại ở một chỗ, lời lẽ ngắn gọn, dễ hiểu.",
    eg: "Thấy số đỏ cạnh mục “Tính năng mới” nghĩa là app vừa có thứ mới. Bấm vào đọc xong là số đỏ biến mất." },
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
  return header("Tính năng mới") + `<p class="meta" style="margin:-4px 0 14px">Mỗi lần app có thêm tính năng sẽ được ghi lại ở đây: ngắn gọn, có ví dụ.</p><div class="news" style="max-width:720px">${newsFor().map((n) => newsItem(n, (S.newsFresh || []).includes(n.id) || (S.newsSeen && !seen.includes(n.id)))).join("") || '<div class="meta">Chưa có cập nhật nào.</div>'}</div>`;
}
// Mở mục này = đã xem: xoá số đỏ (các nhãn "Mới" vẫn giữ cho lần xem này)
function newsOpened() { const ids = newsFor().filter((n) => S.newsSeen && !S.newsSeen.includes(n.id)).map((n) => n.id); S.newsFresh = ids; if (ids.length) newsMark(ids).then(() => { if (S.me) shell(), render(); }); }
// Bảng bật lên khi vào app nếu còn cập nhật chưa xem
function newsSheet(items) {
  sheet(`<div class="grab"></div><div class="sheet-h"><div class="t"><h3>Tính năng mới</h3><p>App vừa được cập nhật. Đọc nhanh 1 phút là nắm. Xem lại bất cứ lúc nào ở mục “Tính năng mới”.</p></div><button class="btn ghost icon" data-close aria-label="Đóng">${I.x}</button></div>
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
