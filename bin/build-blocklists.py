#!/usr/bin/env python3
"""Sinh netlify/functions/lib/blocklists.mts: danh sách tên miền cần chặn theo nhóm.
Nguồn: v2fly/domain-list-community (GitHub, giấy phép MIT) + phần bổ sung tay bên dưới. Chạy lại khi muốn cập nhật: python3 bin/build-blocklists.py"""
import json, os, re, urllib.request

BASE = "https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/"
cache = {}

def fetch(name):
    if name not in cache:
        try:
            cache[name] = urllib.request.urlopen(BASE + urllib.request.quote(name), timeout=20).read().decode()
        except Exception as e:
            print("  ! thiếu nguồn", name, e); cache[name] = ""
    return cache[name]

def resolve(name, skip=(), seen=None):
    seen = seen if seen is not None else set()
    if name in seen or name in skip: return set()
    seen.add(name); out = set()
    for line in fetch(name).splitlines():
        line = line.split("#")[0].strip()
        if not line: continue
        tok = line.split()[0]
        if tok.startswith("include:"): out |= resolve(tok[8:], skip, seen)
        elif tok.startswith(("regexp:", "keyword:")): continue
        else:
            d = tok.split(":", 1)[1] if tok.startswith(("full:", "domain:")) else tok
            if re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", d): out.add(d)
    return out

# Liên Quân = Garena + hạ tầng Tencent/TiMi mà game dùng
LIENQUAN_TENCENT = {"gcloudcs.com", "gcloudsdk.com", "gcloudsvcs.com", "hkgcloudcs.com", "nagcloudcs.com", "tencent-gcloud.com", "proximabeta.com", "timibase.com", "midasbuy.com"}
EXTRA_GAMES = """mobilelegends.com moonton.com youngjoygame.com zingplay.com vnggames.com gamevui.vn poki.com crazygames.com y8.com friv.com
miniclip.com kizi.com gamedistribution.com 1v1.lol krunker.io slither.io agar.io shellshock.io now.gg bluestacks.com geforcenow.com nvidiagrid.net
haegin.kr innersloth.com freefiremobile.com levelinfinite.com pubgmobile.com igamecj.com honorofkings.com intlgame.com playtogether.game
coolmathgames.com armorgames.com kongregate.com newgrounds.com itch.io io-games.io silvergames.com gameforge.com garena.vn""".split()
EXTRA_BYPASS = """cloudflareclient.com cloudflarewarp.com one.one.one.one mask.icloud.com mask-h2.icloud.com mask.apple-dns.net
protonvpn.com protonvpn.net protonvpn.ch expressvpn.com surfshark.com cyberghostvpn.com privateinternetaccess.com windscribe.com tunnelbear.com
hotspotshield.com hsselite.com hola.org holavpn.com turbovpn.com x-vpn.com urban-vpn.com vpnbook.com hide.me ipvanish.com purevpn.com atlasvpn.com
mullvad.net ivpn.net betternet.co vpnify.com ultrasurf.us browsec.com zenmate.com touchvpn.net getlantern.org psiphon.ca psiphon3.com
torproject.org openvpn.net wireguard.com softether.org vpngate.net""".split()
# Không chặn: trang tin/quyền riêng tư bị gom chung trong nguồn "anticensorship"
BYPASS_KEEP = {"nextdns.io", "eff.org", "jitsi.org", "wikileaks.org", "privacytools.io", "browserleaks.com", "ooni.org", "turkeyblocks.org", "censorship.ai", "gfw.report", "democracy.earth", "akasha.world", "dat.foundation", "guardianproject.info", "ahmia.fi"}

roblox = resolve("roblox")
discord = resolve("discord")
lienquan = resolve("garena") | LIENQUAN_TENCENT
games = set(EXTRA_GAMES)
for src in ["category-games-!cn", "tencent-games", "pubg", "playstation", "mojang", "hoyoverse", "mihoyo", "4399", "activision", "nexon", "wargaming", "gaijin", "faceit", "origin", "gog", "zynga", "cygames"]:
    games |= resolve(src, skip=("roblox", "discord", "twitch", "unity", "category-games-cn"))
games -= roblox | discord | lienquan
bypass = set(EXTRA_BYPASS) | resolve("category-doh") | resolve("category-vpnservices")
bypass |= resolve("category-anticensorship", skip=("category-ipfs", "citizenlab", "greatfire", "haveibeenpwned", "paskoocheh", "epicbrowser", "ceno"))
bypass -= BYPASS_KEEP

groups = {"lienquan": lienquan, "roblox": roblox, "discord": discord, "games": games, "bypass": bypass}
out = os.path.join(os.path.dirname(__file__), "..", "netlify", "functions", "lib", "blocklists.mts")
with open(out, "w", encoding="utf-8") as f:
    f.write("// FILE TỰ SINH bởi bin/build-blocklists.py — không sửa tay. Nguồn: v2fly/domain-list-community (MIT) + bổ sung trong script.\n")
    f.write("export const LISTS: Record<string, string[]> = " + json.dumps({k: sorted(v) for k, v in groups.items()}, ensure_ascii=False, separators=(",", ":")) + "\n")
for k, v in groups.items(): print(k, len(v))
