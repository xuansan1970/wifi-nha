/* WiFi Nhà — mục "Tính năng mới" (thanh bên) + bảng bật lên: mỗi lần có cập nhật, ai mở app cũng thấy 1 bảng ngắn, lời lẽ dễ hiểu, có ví dụ.
   Bấm "Đã hiểu" thì server ghi lại theo từng người (Xuân San / Ba / Mẹ), lần sau không hiện lại.
   THÊM TÍNH NĂNG MỚI: thêm 1 mục lên ĐẦU danh sách NEWS (id không trùng). admin: true = chỉ Xuân San thấy. */
"use strict";
const NEWS = [
  { id: "2026-11-28-dien-thoai-4-tab", date: "28/11/2026", title: "Trên điện thoại: 4 mục ở dưới, mỗi mục một việc",
    text: "Thanh dưới cùng còn đúng 4 nút. “Mạng”: bật/tắt WiFi cả nhà, cho dùng thêm giờ, hẹn giờ. “Chặn”: chặn game, xem máy nào đang bị chặn để mở lại, xem các con. “Thiết bị”: xem máy nào đang vào mạng. “Thêm”: từng WiFi và router, nhật ký, cài đặt.",
    eg: "Muốn chặn game, Ba bấm nút “Chặn” ở dưới rồi bấm “Chặn toàn bộ”. Muốn tắt WiFi cả nhà, bấm nút “Mạng”." },
  { id: "2026-11-28-bo-cuc-moi", date: "28/11/2026", title: "Giao diện gọn hơn, nhìn một lần thấy hết",
    text: "Trang đầu xếp lại thành các ô cạnh nhau: trên cùng là số router, số máy, số máy bị chặn; giữa là nút bật/tắt mạng, Bấm 1 lần và Hẹn giờ; dưới là chặn game, WiFi trong nhà và 3 router. Mở trong app Nhà Mình thì menu nằm ngang phía trên, không còn 2 cột menu.",
    eg: "Trên máy tính, Ba vừa thấy mạng đang bật, vừa bấm được “Chặn game” và hẹn giờ tắt WiFi mà không phải kéo xuống." },
  { id: "2026-11-28-nut-chan-game", date: "28/11/2026", title: "Nút nhanh “Chặn game” ngay cạnh nút WiFi",
    text: "Ô “Bấm 1 lần” ở trang đầu có thêm nút “Chặn game”. Bấm 1 lần là chặn hết game, bấm lại là cho chơi. Nút này đi chung với 2 nút “Chặn toàn bộ” / “Gỡ toàn bộ” bên dưới, bấm chỗ nào thì chỗ kia cũng đổi theo.",
    eg: "Tới giờ học, Ba bấm “Chặn game” ở trên cùng, không cần kéo xuống. Học xong bấm “Mở lại game”." },
  { id: "2026-11-24-chan-moi-dia-chi", date: "24/11/2026", title: "Chặn một máy là chặn hẳn, không lách được bằng cách đổi WiFi",
    text: "Trước đây chặn một máy tính hay điện thoại, máy tự nối sang WiFi khác trong nhà và có mạng lại sau khoảng 10 giây. Giờ app chặn mọi “tên” mà máy đó dùng ở từng WiFi, và tự chặn tiếp nếu máy đổi tên mới.",
    eg: "Chặn MacBook của em: máy không vào được Ninesouth13, cũng không vào được WiFi TV hay WiFi nào khác trong nhà cho tới khi mở chặn." },
  { id: "2026-11-24-ten-may", date: "24/11/2026", title: "Nhận ra thêm tên và loại của nhiều máy",
    text: "Nhiều máy trước đây chỉ hiện tên vô nghĩa như “localhost”, “wlan0” nay hiện đúng là camera, thiết bị Tuya, TV, MacBook kèm đời máy.",
    eg: "Hai máy tên “localhost” ở tầng trệt giờ hiện là “Camera IP”." },
  { id: "2026-11-24-chan-het", date: "24/11/2026", title: "Hai nút: “Chặn toàn bộ” và “Gỡ toàn bộ” game",
    text: "Thẻ “Chặn game & nội dung” ở trang đầu có thêm 2 nút to. Bấm 1 lần là chặn hết game (Liên Quân, Roblox, Discord, mọi game khác) hoặc mở lại hết.",
    eg: "Tới giờ cơm, Ba bấm “Chặn toàn bộ”. Ăn xong bấm “Gỡ toàn bộ” là các em chơi lại được.",
    how: "Chặn game có tác dụng với máy dùng WiFi nhà theo cách bình thường. Máy bật 4G hoặc cài VPN thì chưa chặn được." },
  { id: "2026-11-24-canh-chan", date: "24/11/2026", title: "Chặn mạng một máy: app tự kiểm tra lại",
    text: "Sau khi chặn một máy, app kiểm tra đủ cả 3 tầng. Tầng nào chưa nhận lệnh thì app tự chặn bù. Máy đã chặn mà vẫn vào được mạng quá 5 phút thì app báo cho Xuân San.",
    eg: "Chặn máy của em ở tầng trệt nhưng tầng 1 bị rớt lệnh: 5 phút sau app tự chặn nốt ở tầng 1." },
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
