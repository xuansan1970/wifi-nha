#!/bin/bash
# Kết nối chức năng "Chặn game & chat" với NextDNS. API key gõ ẩn, không lưu ở đâu ngoài secret của Worker.
# API key nằm ở cuối trang https://my.nextdns.io/account ; Profile ID là mã 6 ký tự trên trang Setup (vd de526b).
cd "$(dirname "$0")/.." || exit 1
read -r -p "Profile ID NextDNS: " PID
read -rs -p "API key NextDNS: " KEY; echo
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Api-Key: $KEY" "https://api.nextdns.io/profiles/$PID/parentalControl")
if [ "$CODE" != "200" ]; then echo "API key hoặc Profile ID chưa đúng (HTTP $CODE). Chưa lưu gì."; unset KEY; exit 1; fi
printf '%s' "$PID" | npx wrangler secret put NEXTDNS_PROFILE && printf '%s' "$KEY" | npx wrangler secret put NEXTDNS_API_KEY
unset KEY
echo "Xong. Mở app WiFi Nhà: thẻ 'Chặn game & chat' sẽ hiện 5 công tắc."
