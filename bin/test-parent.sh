#!/bin/bash
# Kiểm tra tài khoản Ba Mẹ KHÔNG vào được chức năng admin. PIN gõ ẩn, không lưu. Chỉ in mã trạng thái.
B=https://wifi-nha.giadinhxuan.workers.dev/api
J=$(mktemp); trap 'rm -f "$J"' EXIT
read -rs -p "PIN Ba Mẹ: " PIN; echo
printf '{"uid":"bame","pin":"%s"}' "$PIN" | curl -s -c "$J" -H 'content-type: application/json' --data-binary @- "$B/login" | head -c 120; echo
unset PIN
chk(){ printf "%-28s %s (cần 403)\n" "$1 $2" "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -X "$1" -H 'content-type: application/json' -d "${3:-{\}}" "$B$2")"; }
echo "== phải bị CHẶN (403):"
chk GET /log; chk GET /inventory; chk GET /accounts; chk GET /audit; chk GET /versions
chk POST /pin; chk POST /restore '{"id":0}'; chk POST /selftest '{"kind":"x"}'
echo "== phải vào được (200):"
for p in /me /view; do printf "%-28s %s\n" "GET $p" "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B$p")"; done
