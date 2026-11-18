#!/bin/bash
# Chạy thử email + cảnh báo + đọc nhật ký audit. PIN gõ ẩn, không lưu ở đâu.
B=https://wifi-nha.giadinhxuan.workers.dev/api
J=$(mktemp)
trap 'rm -f "$J"' EXIT
read -rs -p "PIN Xuân San: " PIN; echo
printf '{"uid":"san","pin":"%s"}' "$PIN" | curl -s -c "$J" -H 'content-type: application/json' --data-binary @- "$B/login"; echo
unset PIN
for k in backup restoretest; do
  echo "== selftest $k"; curl -s -b "$J" -H 'content-type: application/json' -d "{\"kind\":\"$k\"}" "$B/selftest"; echo
done
echo "== audit (3 dòng mới nhất)"; curl -s -b "$J" "$B/audit?limit=3"; echo
echo "== phiên bản lịch (family)"; curl -s -b "$J" "$B/versions?key=family"; echo
