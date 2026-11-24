#!/bin/bash
# Kết nối chức năng "Chặn game & chat" với Cloudflare Zero Trust. Token gõ ẩn, không lưu ở đâu ngoài secret của Worker.
# Trước khi chạy: bật Zero Trust (gói Free) trong tài khoản Cloudflare và tạo API token có quyền "Zero Trust: Edit".
cd "$(dirname "$0")/.." || exit 1
read -r -p "Account ID Cloudflare: " ACC
read -rs -p "API token (Zero Trust: Edit): " TOK; echo
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOK" "https://api.cloudflare.com/client/v4/accounts/$ACC/gateway/rules")
if [ "$CODE" != "200" ]; then echo "Token hoặc Account ID chưa đúng, hoặc chưa bật Zero Trust (HTTP $CODE). Chưa lưu gì."; unset TOK; exit 1; fi
printf '%s' "$ACC" | npx wrangler secret put CF_ACCOUNT_ID && printf '%s' "$TOK" | npx wrangler secret put CF_API_TOKEN
unset TOK
echo "Xong. Mở app WiFi Nhà: thẻ 'Chặn game & chat' sẽ hiện 3 công tắc."
