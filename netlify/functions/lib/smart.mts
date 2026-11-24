// Nhận diện thiết bị: tên do người đặt > tên Ruijie hợp lệ > nhận diện từ hostname/hãng/loại
import { store } from "./store.mts"

export type Kind =
  | "phone" | "tablet" | "laptop" | "pc" | "tv" | "camera" | "speaker" | "watch" | "console"
  | "iot" | "fan" | "light" | "ac" | "router" | "printer" | "unknown"

export const KIND_VI: Record<Kind, string> = {
  phone: "Điện thoại", tablet: "Máy tính bảng", laptop: "Laptop", pc: "Máy tính", tv: "TV", camera: "Camera",
  speaker: "Loa", watch: "Đồng hồ", console: "Máy chơi game", iot: "Thiết bị thông minh", fan: "Quạt",
  light: "Đèn", ac: "Máy lạnh", router: "Thiết bị mạng", printer: "Máy in", unknown: "Chưa rõ",
}

const LABEL_KIND: Record<string, Kind> = {
  PHONE: "phone", IPHONE: "phone", PAD: "tablet", WATCH: "watch", WRISTBAND: "watch",
  WINPC: "pc", LINUXPC: "pc", MACPC: "laptop", WINLAPTOP: "laptop",
  CAMERA: "camera", IPC: "camera", NVR: "camera", TV: "tv", PROJECTOR: "tv", DISPLAYSCREEN: "tv",
  SOUNDBOX: "speaker", TVAUDIO: "speaker", AMPLIFIER: "speaker", AMUSEMENT: "console",
  FAN: "fan", LIGHT: "light", LAMP: "light", AIRCONDITIONER: "ac", CUSACDEVICE: "ac",
  ROUTER: "router", AP: "router", SWITCH: "router", GATEWAY: "router", WIFIEXTENDER: "router", NAS: "router",
  PRINTER: "printer", AIDEVICE: "iot",
}

// Tên hệ thống vô nghĩa — không dùng làm tên hiển thị
const JUNK = /^(\*|-|unknown|localhost|android(-[0-9a-f]+)?|wlan\d*|lwip\d*|esp[_-]?[0-9a-f]*|espressif|realtek|mxchip|beken|linux|tuya.*|[0-9a-f]{12}|([0-9a-f]{2}[:.-]?){6}|([0-9a-f]{4}\.){2}[0-9a-f]{4})$/i

const VENDOR_HINT: [RegExp, string, Kind?][] = [
  [/apple/i, "Apple"], [/samsung/i, "Samsung"], [/xiaomi|redmi|beijing xiaomi/i, "Xiaomi"],
  [/oppo|guangdong oppo/i, "OPPO", "phone"], [/vivo/i, "vivo", "phone"], [/realme/i, "realme", "phone"],
  [/huawei/i, "Huawei"], [/honor/i, "Honor", "phone"], [/oneplus/i, "OnePlus", "phone"], [/google/i, "Google"],
  [/sony/i, "Sony"], [/lg electronics|lg innotek/i, "LG"], [/tcl/i, "TCL", "tv"], [/hisense/i, "Hisense", "tv"],
  [/nintendo/i, "Nintendo", "console"], [/microsoft/i, "Microsoft"], [/dell/i, "Dell", "laptop"],
  [/hewlett|hp inc/i, "HP"], [/lenovo/i, "Lenovo", "laptop"], [/asustek|asus/i, "ASUS"], [/acer/i, "Acer", "laptop"],
  [/intel corp/i, "Intel (laptop/PC)", "laptop"], [/liteon|lite-on|azurewave|hon hai|foxconn|cloud network/i, "Laptop/PC", "laptop"],
  [/hangzhou ezviz|ezviz/i, "EZVIZ", "camera"], [/hikvision/i, "Hikvision", "camera"], [/dahua|imou/i, "Imou", "camera"],
  [/tp-?link/i, "TP-Link"], [/ruijie/i, "Ruijie", "router"], [/espressif/i, "Espressif (IoT)", "iot"],
  [/tuya/i, "Tuya (IoT)", "iot"], [/beken/i, "Beken (IoT)", "iot"], [/realtek/i, "Realtek"], [/mediatek/i, "MediaTek"],
  [/ai-?link|sichuan ai/i, "AI-Link (IoT)", "iot"], [/amazon/i, "Amazon", "speaker"], [/roku/i, "Roku", "tv"],
  [/garmin/i, "Garmin", "watch"], [/canon/i, "Canon", "printer"], [/epson/i, "Epson", "printer"], [/brother/i, "Brother", "printer"],
  [/daikin/i, "Daikin", "ac"], [/panasonic/i, "Panasonic"], [/sharp/i, "Sharp"], [/philips|signify/i, "Philips"],
]

export const isRandomMac = (mac: string) => /^[0-9a-f]([26ae])/i.test(mac)

let ouiCache: Record<string, string> | null = null
export async function loadOui(): Promise<Record<string, string>> {
  if (ouiCache) return ouiCache
  ouiCache = ((await store().get("oui", { type: "json" })) as any) ?? {}
  return ouiCache!
}

// Tải bảng hãng (IEEE OUI) 1 lần, lưu vào Blobs; gọi từ tick khi chưa có
export async function ensureOui() {
  const cur: any = await store().getMetadata("oui").catch(() => null)
  if (cur && Date.now() - Number(cur.metadata?.at ?? 0) < 30 * 86400_000) return false
  const res = await fetch("https://standards-oui.ieee.org/oui/oui.csv", { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error("OUI " + res.status)
  const text = await res.text()
  const map: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^MA-L,([0-9A-F]{6}),(?:"([^"]*)"|([^,]*))/)
    if (!m) continue
    const name = (m[2] ?? m[3] ?? "")
      .replace(/\b(co\.?,?\s*ltd\.?|corporation|corp\.?|inc\.?|limited|ltd\.?|llc|gmbh|technologies|technology|electronics|communication(s)?|company|co\.)\b/gi, "")
      .replace(/[.,\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    if (name) map[m[1].toLowerCase()] = name.slice(0, 40)
  }
  await store().setJSON("oui", map, { metadata: { at: Date.now() } })
  ouiCache = map
  return true
}

export function vendorOf(mac: string, oui: Record<string, string>) {
  if (isRandomMac(mac)) return ""
  return oui[mac.slice(0, 6)] ?? ""
}

export type Identity = { name: string; kind: Kind; kindVi: string; vendor: string; random: boolean; guess: boolean }

export function identify(
  c: { mac: string; alias?: string; rawName?: string; label?: string; os?: string; ssid?: string; band?: string; maker?: string; model?: string },
  custom: string | undefined,
  oui: Record<string, string>,
): Identity {
  const random = isRandomMac(c.mac)
  const vendorRaw = vendorOf(c.mac, oui) || String(c.maker || "").trim()
  let vendor = ""
  let kind: Kind = LABEL_KIND[String(c.label || "").toUpperCase()] ?? "unknown"
  for (const [re, nm, k] of VENDOR_HINT)
    if (re.test(vendorRaw)) {
      vendor = nm
      if (kind === "unknown" && k) kind = k
      break
    }
  if (!vendor && vendorRaw) vendor = vendorRaw
  const raw = String(c.rawName || "").trim()
  const alias = String(c.alias || "").trim()

  // Suy luận loại từ hostname
  const h = `${custom || ""} ${alias} ${raw} ${c.model || ""}`.toLowerCase()
  if (kind === "unknown" || kind === "iot") {
    if (/ezviz|ipc|cam|imou|hik/.test(h)) kind = "camera"
    else if (/iphone|android|galaxy|redmi|oppo|vivo|pixel|điện thoại/.test(h)) kind = "phone"
    else if (/ipad|tab/.test(h)) kind = "tablet"
    else if (/book|laptop|desktop|-pc|win/.test(h)) kind = "laptop"
    else if (/wash|dryer|fridge|refrig|aircon|vacuum|robo/.test(h)) kind = "iot"
    else if (/tv|bravia|tizen|webos|chromecast/.test(h)) kind = "tv"
    else if (/switch|playstation|ps[45]|xbox/.test(h)) kind = "console"
  }
  if (kind === "unknown" && /iot/i.test(c.ssid || "")) kind = "iot"

  const kindVi = KIND_VI[kind]
  if (custom) return { name: custom, kind, kindVi, vendor, random, guess: false }
  if (alias && !JUNK.test(alias)) return { name: alias, kind, kindVi, vendor, random, guess: false }
  if (raw && !JUNK.test(raw)) {
    const ez = raw.match(/_([A-Z]{2}\d{6,})_EZVIZ/i)
    if (ez) return { name: `Camera EZVIZ ${ez[1].slice(-4)}`, kind: "camera", kindVi: KIND_VI.camera, vendor: "EZVIZ", random, guess: true }
    const lg = raw.match(/^LG_Smart_?([A-Za-z]+)/i)
    if (lg) {
      const what = /wash/i.test(lg[1]) ? "Máy giặt" : /dry/i.test(lg[1]) ? "Máy sấy" : /refri|fridge/i.test(lg[1]) ? "Tủ lạnh" : /air/i.test(lg[1]) ? "Máy lạnh" : "Thiết bị"
      return { name: `${what} LG`, kind: what === "Máy lạnh" ? "ac" : "iot", kindVi: what, vendor: "LG", random, guess: true }
    }
    return { name: raw.replace(/_/g, " ").replace(/\s+/g, " ").trim(), kind, kindVi, vendor, random, guess: false }
  }
  const tail = c.mac.slice(-4).toUpperCase()
  // MAC riêng tư: có thể là điện thoại, máy tính bảng hoặc laptop — không đoán bừa là điện thoại
  if (random) return { name: `${kind === "unknown" ? "Thiết bị" : kindVi} ẩn danh ·${tail}`, kind, kindVi, vendor, random, guess: true }
  return { name: `${vendor ? vendor + " " : ""}${kindVi === "Chưa rõ" ? "Thiết bị" : kindVi} ·${tail}`.trim(), kind, kindVi, vendor, random, guess: true }
}
