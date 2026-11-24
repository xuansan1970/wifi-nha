#!/bin/bash
# Kết nối chức năng "Chặn game & chat" với NextDNS. API key gõ ẩn, không lưu ở đâu ngoài secret của Worker.
# API key nằm ở cuối trang https://my.nextdns.io/account ; Profile ID là mã 6 ký tự trên trang Setup (vd de526b).
cd "$(dirname "$0")/.." || exit 1
read -r -p "Profile ID NextDNS (bấm Enter để dùng de526b): " PID; PID=${PID:-de526b}
echo "Chép API key ở trang Account của NextDNS (Cmd+C) rồi quay lại đây."
read -rs -p "Bấm Enter để lấy key từ bộ nhớ tạm (hoặc dán key rồi Enter): " KEY; echo
[ -z "$KEY" ] && KEY=$(pbpaste)
# Bỏ ký tự điều khiển do Terminal chèn khi dán, khoảng trắng và xuống dòng
KEY=$(printf '%s' "$KEY" | LC_ALL=C sed $'s/\x1b\\[20[01]~//g' | LC_ALL=C tr -cd 'A-Za-z0-9')
echo "Đã nhận key dài ${#KEY} ký tự."
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Api-Key: $KEY" "https://api.nextdns.io/profiles/$PID/parentalControl")
if [ "$CODE" != "200" ]; then echo "API key hoặc Profile ID chưa đúng (HTTP $CODE). Chưa lưu gì."; unset KEY; exit 1; fi
printf '%s' "$PID" | npx wrangler secret put NEXTDNS_PROFILE && printf '%s' "$KEY" | npx wrangler secret put NEXTDNS_API_KEY
unset KEY
echo "Xong. Mở app WiFi Nhà: thẻ 'Chặn game & chat' sẽ hiện 5 công tắc."
