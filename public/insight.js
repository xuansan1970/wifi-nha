/* WiFi Nhà · mục "Hoạt động" (chỉ Xuân San): số liệu Ruijie Cloud theo từng tầng.
   Máy nào đã vào mạng gần đây (kể cả máy đã rời đi), dùng bao nhiêu, sóng tốt/yếu, WiFi nào tải nặng, kênh có nghẽn không, cảnh báo router. */
"use strict";
async function loadInsight(force) {
  if (S.insBusy || (!force && S.ins && !S.ins.error && Date.now() - S.ins.at < 120000)) return;
  S.insBusy = true; if (S.tab === "insight") render();
  try { S.ins = await api("/insight", { timeout: 60000 }); } catch (e) { S.ins = { error: e.message, at: Date.now() }; }
  S.insBusy = false; if (S.tab === "insight") render();
}
const insQual = (x) => x.score == null ? (x.online ? "—" : '<span class="meta">đã rời</span>')
  : `<span class="chip ${x.score >= 85 ? "ok" : x.score >= 70 ? "" : "bad"}" style="height:22px">${x.score >= 85 ? "Tốt" : x.score >= 70 ? "Tạm" : "Yếu"} · ${x.score}</span>`;
const insChan = (band, c) => !c || !c.channel ? "" : `<span class="chip ${c.level === "high" ? "bad" : c.level === "low" ? "ok" : ""}" style="height:24px">${band} kênh ${c.channel} · ${c.level === "high" ? "đang nghẽn" : c.level === "medium" ? "tải vừa" : "thoáng"}</span>`;
function insFloor(f) {
  const rows = [...f.seen].sort((a, b) => b.bytes - a.bytes);
  const anon = rows.filter((x) => x.guess && x.random).length;
  return `<div class="card" style="margin-bottom:16px"><div class="card-h"><span class="floor-ic" style="background:${floorC(f.floor)};width:36px;height:36px;border-radius:10px">${I.router}</span><h2>${esc(f.floor)}</h2><div class="grow"></div><small>${rows.length} máy · ${rows.filter((x) => x.online).length} đang online${anon ? ` · ${anon} chưa rõ tên` : ""}</small></div>
    ${f.failed ? `<div class="alert bad">${I.alert}Ruijie Cloud không trả số liệu cho tầng này, thử làm mới sau.</div>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">${insChan("2.4G", f.chan["2.4G"])}${insChan("5G", f.chan["5G"])}${f.ssids.map((s) => `<span class="chip" style="height:24px">${esc(s.ssid)}: ${s.total} máy · ${bytes(s.bytes)}</span>`).join("")}</div>
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Thiết bị</th><th class="hide-m">Của ai</th><th>Online</th><th>Dữ liệu</th><th>Sóng</th></tr></thead><tbody>${rows.map((x) => { const p = S.d.people.find((q) => q.id === x.owner); return `<tr data-dev="${x.mac}" style="cursor:pointer"><td><b>${esc(x.name)}</b>${x.guess ? ' <span class="chip" style="height:18px;font-size:11px">đoán</span>' : ""}<div class="meta num">${fmtMac(x.mac)}${x.online ? "" : " · offline"}</div></td><td class="hide-m">${p ? `<b style="color:${pColor(p)}">${esc(p.name)}</b>` : '<span class="meta">Chưa gán</span>'}</td><td class="num nowrap">${dur(x.sec / 60)}</td><td class="num nowrap">${bytes(x.bytes)}</td><td>${insQual(x)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="meta">Chưa có máy nào.</div>`}
    ${f.alarms.length ? `<div class="lbl" style="margin-top:12px">Cảnh báo router gần nhất</div>${f.alarms.map((a) => `<div class="meta">${timeVN(a.t)} · ${esc(a.desc)}${a.dev ? " (" + esc(a.dev) + ")" : ""}${a.end ? ` · hết sau ${dur((a.end - a.t) / 60000)}` : " · chưa hết"}</div>`).join("")}` : ""}
  </div>`;
}
function vInsight() {
  const d = S.ins;
  return header("Hoạt động mạng", `<button class="btn" id="insRf" ${S.insBusy ? "disabled" : ""}>${I.refresh}<span>${S.insBusy ? "Đang lấy…" : "Lấy số liệu mới"}</span></button>`) +
    `<p class="meta" style="margin:-4px 0 14px">Số liệu do Ruijie Cloud cộng dồn từ hôm qua tới giờ, gồm cả máy đã rời mạng. Bấm vào một máy để đặt tên, gán chủ hoặc chặn.</p>` +
    (!d ? `<div class="grid g3"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>` : d.error ? `<div class="alert bad">${I.alert}${esc(d.error)}</div>` : d.floors.map(insFloor).join(""));
}
document.addEventListener("click", (e) => { if (e.target.closest("#insRf")) loadInsight(true); });
