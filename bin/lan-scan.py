#!/usr/bin/env python3
"""Quét mạng nhà để lấy tên thật / đời máy / hệ điều hành của MỌI máy đang nối (kể cả máy giấu tên mà Ruijie không biết),
rồi gửi lên app WiFi Nhà. Chạy trên một máy macOS đang nối WiFi nhà:  python3 bin/lan-scan.py
Cách dò: ping cả dải → bảng ARP (IP ↔ MAC) → mDNS ngược (tên máy) → dịch vụ Bonjour (tên hiển thị, đời máy) → cổng 62078 (iPhone/iPad)
→ SSDP/UPnP (TV, loa, thiết bị thông minh) → NetBIOS (máy Windows). Token gửi dữ liệu nằm ở file .lan-token (không đưa lên Git)."""
import concurrent.futures as cf, json, os, plistlib, re, socket, subprocess, sys, urllib.request

API = "https://wifi-nha.giadinhxuan.workers.dev/api/lan/report"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MDNS = ["@224.0.0.251", "-p", "5353", "+short", "+time=1", "+tries=1"]
TYPES = ["_companion-link._tcp", "_airplay._tcp", "_raop._tcp", "_smb._tcp", "_rfb._tcp", "_googlecast._tcp", "_hap._tcp", "_ipp._tcp",
         "_spotify-connect._tcp", "_androidtvremote2._tcp", "_sleep-proxy._udp", "_device-info._tcp", "_ssh._tcp", "_http._tcp", "_miio._udp", "_ewelink._tcp"]

def sh(cmd, t=4):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=t).stdout
    except subprocess.TimeoutExpired as e:
        return (e.stdout or b"").decode("utf-8", "ignore") if isinstance(e.stdout, bytes) else (e.stdout or "")
    except Exception:
        return ""

def unesc(s):  # dns-sd in tên dạng \032 (dấu cách) và \226\128\153 (dấu ’)
    b = re.sub(rb"\\(\d{3})", lambda m: bytes([int(m.group(1))]), s.encode("utf-8", "ignore")).replace(b"\\", b"")
    return b.decode("utf-8", "ignore").strip()

def port_open(ip, p):
    s = socket.socket(); s.settimeout(0.6)
    try:
        s.connect((ip, p)); return True
    except Exception:
        return False
    finally:
        s.close()

def main():
    me = sh(["ipconfig", "getifaddr", "en0"]).strip()
    if not me:
        sys.exit("Máy này chưa nối mạng (en0 không có IP).")
    base = me.rsplit(".", 1)[0]
    ips = [f"{base}.{i}" for i in range(1, 255)]
    ttl = {}
    def ping(ip):
        m = re.search(r"ttl=(\d+)", sh(["ping", "-c1", "-t1", ip], 2))
        if m: ttl[ip] = int(m.group(1))
    for _ in range(2):  # quét 2 lượt: máy đang ngủ thường trả lời ở lượt sau
        with cf.ThreadPoolExecutor(96) as ex:
            list(ex.map(ping, ips))
    dev = {}  # ip -> thông tin
    for line in sh(["arp", "-an"]).splitlines():
        m = re.search(r"\(([\d.]+)\) at ([0-9a-f:]+)", line)
        if not m or not m.group(1).startswith(base + "."): continue
        mac = "".join(x.zfill(2) for x in m.group(2).split(":"))
        if len(mac) == 12 and mac != "ffffffffffff":
            dev[m.group(1)] = {"mac": mac, "ip": m.group(1), "name": "", "model": "", "os": "", "via": []}
    my_mac = "".join(x.zfill(2) for x in (re.search(r"ether ([0-9a-f:]+)", sh(["ifconfig", "en0"])) or [0, ""])[1].split(":"))
    if len(my_mac) == 12:
        dev[me] = {"mac": my_mac, "ip": me, "name": unesc(sh(["scutil", "--get", "ComputerName"])), "model": sh(["sysctl", "-n", "hw.model"]).strip(), "os": "macOS", "via": ["máy quét"]}

    # 1) mDNS ngược: IP → tên máy
    def rev(ip):
        for l in sh(["dig", "-x", ip] + MDNS, 3).splitlines():
            if l.strip().endswith(".local."): return ip, l.strip()[:-7]
        return ip, ""
    host_ip = {}
    with cf.ThreadPoolExecutor(48) as ex:
        for ip, h in ex.map(rev, list(dev)):
            if h:
                host_ip[h.lower()] = ip
                if not dev[ip]["name"]: dev[ip]["name"] = h.replace("-", " "); dev[ip]["via"].append("mDNS")
    # 1b) Hỏi thẳng từng máy (mDNS một-một): nhiều máy không trả lời câu hỏi phát chung nhưng trả lời khi được hỏi riêng
    def rev1(ip):
        for l in sh(["dig", "-x", ip, "@" + ip, "-p", "5353", "+short", "+time=1", "+tries=1"], 3).splitlines():
            if l.strip().endswith(".local."): return ip, l.strip()[:-7]
        return ip, ""
    with cf.ThreadPoolExecutor(48) as ex:
        for ip, h in ex.map(rev1, [i for i in dev if not dev[i]["name"]]):
            if h:
                host_ip[h.lower()] = ip
                dev[ip]["name"] = h.replace("-", " "); dev[ip]["via"].append("mDNS hỏi riêng")

    # 2) Dịch vụ Bonjour: tên hiển thị + đời máy
    def browse(tp):
        out = sh(["dns-sd", "-B", tp, "local."], 3)
        return tp, {unesc(l.split(tp + ".", 1)[1]) for l in out.splitlines() if " Add " in l and tp + "." in l}
    inst = []
    with cf.ThreadPoolExecutor(16) as ex:
        for tp, names in ex.map(browse, TYPES):
            inst += [(tp, n) for n in names if n]
    def resolve(x):
        tp, n = x
        out = sh(["dns-sd", "-L", n, tp, "local."], 2)
        m = re.search(r"can be reached at ([^\s:]+?)\.local\.?:\d+", out)
        txt = dict(re.findall(r"(\w+)=((?:\\ |[^\s])*)", out))
        return tp, n, (m.group(1).lower() if m else ""), txt
    with cf.ThreadPoolExecutor(24) as ex:
        for tp, n, host, txt in ex.map(resolve, inst):
            ip = host_ip.get(host)
            if not ip:
                a = sh(["dig", host + ".local"] + MDNS, 3).strip().splitlines() if host else []
                ip = next((x for x in a if x in dev), None)
            if not ip: continue
            d = dev[ip]
            pretty = unesc(txt.get("fn", "")) or n
            if tp in ("_companion-link._tcp", "_airplay._tcp", "_googlecast._tcp", "_smb._tcp", "_rfb._tcp", "_androidtvremote2._tcp") and (not d["name"] or "mDNS" in d["via"]):
                d["name"] = re.sub(r"^[0-9A-F]{12}@", "", pretty)
            model = unesc(txt.get("model", "") or txt.get("md", "") or txt.get("rpMd", ""))
            if model and not d["model"]: d["model"] = model
            d["via"].append(tp.split(".")[0].strip("_"))

    # 3) Đời máy Apple qua _device-info (hỏi theo tên hiển thị)
    def devinfo(ip):
        n = dev[ip]["name"]
        if not n or dev[ip]["model"]: return ip, ""
        out = sh(["dig", "TXT", f"{n}._device-info._tcp.local"] + MDNS, 3)
        m = re.search(r"model=([\w,]+)", out)
        return ip, m.group(1) if m else ""
    with cf.ThreadPoolExecutor(24) as ex:
        for ip, model in ex.map(devinfo, list(dev)):
            if model: dev[ip]["model"] = model; dev[ip]["via"].append("device-info")

    # 4) Cổng đặc trưng: 62078 = iPhone/iPad; 8008 = Android TV/Chromecast; 554 = camera IP; 6668 = thiết bị Tuya
    def ports(ip):
        return ip, [p for p in (62078, 8008, 445, 7000, 554, 6668, 80, 135, 3389, 5000) if port_open(ip, p)]
    with cf.ThreadPoolExecutor(64) as ex:
        for ip, ps in ex.map(ports, list(dev)):
            d = dev[ip]
            if 62078 in ps and not d["os"]: d["os"] = "iOS"; d["via"].append("cổng 62078")
            if 8008 in ps and not d["os"]: d["os"] = "Android TV/Cast"; d["via"].append("cổng 8008")
            if (135 in ps or 3389 in ps or (445 in ps and ttl.get(ip) == 128)) and not d["os"]: d["os"] = "Windows"; d["via"].append("cổng Windows")
            if 7000 in ps and not d["model"]:
                # AirPlay tự khai tên và đời máy (Mac, Apple TV, loa, TV có AirPlay)
                try:
                    info = plistlib.loads(urllib.request.urlopen(f"http://{ip}:7000/info", timeout=3).read())
                    if info.get("name") and (not d["name"] or "mDNS" in d["via"]): d["name"] = str(info["name"])
                    if info.get("model"): d["model"] = str(info["model"])
                    d["via"].append("AirPlay")
                except Exception:
                    pass
            if 80 in ps and not d["model"] and not d["name"]:
                try:
                    r = urllib.request.urlopen(f"http://{ip}/", timeout=2)
                    body = r.read(3000).decode("utf-8", "ignore")
                    t = re.search(r"(?i)<title>([^<]{2,60})", body)
                    sv = r.headers.get("Server", "")
                    if t or sv: d["model"] = (t.group(1).strip() if t else sv)[:60]; d["via"].append("trang web của máy")
                except Exception:
                    pass
            if not d["os"] and ttl.get(ip) == 128: d["os"] = "Windows"; d["via"].append("TTL 128")
            tail = d["mac"][-4:].upper()
            # Thiết bị thông minh không tự khai tên: nhận theo cổng dịch vụ đặc trưng
            if 554 in ps and not d["name"]: d["name"] = f"Camera IP ·{tail}"; d["model"] = d["model"] or "Camera (RTSP 554)"; d["via"].append("cổng 554")
            if 6668 in ps and not d["name"]: d["name"] = f"Thiết bị Tuya ·{tail}"; d["model"] = d["model"] or "Tuya / Smart Life"; d["via"].append("cổng 6668")

    # 5) SSDP/UPnP: TV, loa, thiết bị thông minh tự khai tên và đời máy
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(3)
        s.sendto(b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n", ("239.255.255.250", 1900))
        locs = {}
        while True:
            data, addr = s.recvfrom(4096)
            m = re.search(rb"(?i)location:\s*(\S+)", data)
            if m and addr[0] in dev: locs.setdefault(addr[0], m.group(1).decode())
    except Exception:
        pass
    for ip, loc in locs.items():
        try:
            x = urllib.request.urlopen(loc, timeout=3).read().decode("utf-8", "ignore")
            fn = re.search(r"<friendlyName>([^<]+)", x); mn = re.search(r"<modelName>([^<]+)", x); mf = re.search(r"<manufacturer>([^<]+)", x)
            d = dev[ip]
            if fn and not d["name"]: d["name"] = fn.group(1).strip()
            if (mn or mf) and not d["model"]: d["model"] = " ".join(v.group(1).strip() for v in (mf, mn) if v)
            d["via"].append("UPnP")
        except Exception:
            pass

    # 6) Suy ra hệ điều hành từ đời máy
    for d in dev.values():
        m = d["model"]
        if not d["os"]:
            if re.match(r"(MacBook|iMac|Macmini|MacPro|Mac\d|MacStudio)", m): d["os"] = "macOS"
            elif re.match(r"(iPhone|iPad)", m): d["os"] = "iOS"
            elif re.match(r"AppleTV", m): d["os"] = "tvOS"

    rows = sorted(dev.values(), key=lambda d: tuple(int(x) for x in d["ip"].split(".")))
    found = [d for d in rows if d["name"] or d["model"] or d["os"]]
    print(f"Mạng {base}.0/24: {len(rows)} máy đang nối, lấy được thông tin {len(found)} máy.")
    for d in rows:
        print(f"{d['ip']:<16}{d['mac']}  {d['name'] or '(không tự khai tên)':<34}{d['model']:<22}{d['os']:<16}{','.join(dict.fromkeys(d['via']))}")
    tok_file = os.path.join(ROOT, ".lan-token")
    if "--no-send" in sys.argv or not os.path.exists(tok_file):
        print("Chưa gửi lên app (thiếu .lan-token hoặc chạy với --no-send)."); return
    body = json.dumps({"devices": [{**d, "via": ",".join(dict.fromkeys(d["via"]))} for d in found]}).encode()
    req = urllib.request.Request(API, data=body, headers={"content-type": "application/json", "x-lan-token": open(tok_file).read().strip(), "user-agent": "wifi-nha-lan-scan"})
    try:
        print("Đã gửi lên app:", urllib.request.urlopen(req, timeout=20).read().decode())
    except Exception as e:
        print("Gửi lên app lỗi:", e)

if __name__ == "__main__":
    main()
