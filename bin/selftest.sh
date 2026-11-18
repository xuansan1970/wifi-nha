#!/bin/bash
# Chạy thử email + cảnh báo + đọc nhật ký audit. PIN gõ ẩn, không lưu ở đâu.
B=https://wifi-nha.giadinhxuan.workers.dev/api
J=$(mktemp)
trap 'rm -f "$J"' EXIT
read -rs -p "PIN Xuân San: " PIN; echo
printf '{"uid":"san","pin":"%s"}' "$PIN" | curl -s -c "$J" -H 'content-type: application/json' --data-binary @- "$B/login"; echo
unset PIN
for k in email alert; do
  echo "== selftest $k"; curl -s -b "$J" -H 'content-type: application/json' -d "{\"kind\":\"$k\"}" "$B/selftest"; echo
done
echo "== 5 dòng audit mới nhất"; curl -s -b "$J" "$B/audit?limit=5"; echo
