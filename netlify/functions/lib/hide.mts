// Ba Mẹ ngang quyền Xuân San. Thứ duy nhất bị giấu với Ba Mẹ: WiFi riêng của Xuân San (OGA) + WiFi IoT/ẩn và các máy trên đó.
import { isFamilySsid } from "./family.mts"
import { isIotDevice } from "./state.mts"

export function hideSet(routers: any[], ghost: Set<string>, devices: Record<string, any>) {
  const names = new Set<string>()
  const fam = new Set<string>()
  for (const r of routers) for (const x of r.ssids) isFamilySsid(r.gid, x, ghost) ? fam.add(`${r.gid}:${x.id}`) : names.add(x.name)
  const mac = (m: string) => isIotDevice(devices[m], names)
  // Lịch được thấy/sửa: không nhắm vào WiFi bị giấu, không nhắm vào máy IoT
  const rule = (r: any) =>
    r.type === "wifi"
      ? (r.targets || []).every((t: any) => (t.ssidIds || []).every((id: number) => fam.has(`${t.gid}:${id}`)))
      : !(r.target?.kind === "device" && mac(r.target.id))
  // Dòng nhật ký được thấy: không nhắc tên WiFi bị giấu
  const text = (t: any) => ![...names].some((n) => n && n.length > 2 && String(t ?? "").includes(n))
  return { names, fam, mac, rule, text }
}
