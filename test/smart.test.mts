import { test } from "node:test"
import assert from "node:assert/strict"
import { identify } from "../netlify/functions/lib/smart.mts"
import { chanLevel } from "../netlify/functions/lib/insight.mts"

const RND = "4e0ed396a46b" // MAC riêng tư (ký tự thứ 2 là e)

test("MAC riêng tư không tên: không còn bị gọi là điện thoại", () => {
  const id = identify({ mac: RND, rawName: "*" }, undefined, {})
  assert.equal(id.kind, "unknown")
  assert.equal(id.name, "Thiết bị ẩn danh ·A46B")
  assert.equal(id.guess, true)
})
test("tên tự đặt quyết định loại máy", () => {
  assert.equal(identify({ mac: RND }, "MacBook Pro của Alex", {}).kind, "laptop")
  assert.equal(identify({ mac: RND }, "iPhone ·C2F3", {}).kind, "phone")
})
test("hãng do Ruijie nhận dùng khi không tra được theo MAC", () => {
  assert.equal(identify({ mac: RND, maker: "Apple" }, undefined, {}).vendor, "Apple")
  assert.equal(identify({ mac: "64ff0adf9e20", maker: "Sony" }, undefined, { "64ff0a": "WNC" }).vendor, "WNC")
})
test("mức tải kênh", () => {
  assert.deepEqual(chanLevel({ channel: 149, lowUtiCount: 1, mediumUtiCount: 0, highUtiCount: 0 }), { channel: 149, level: "low" })
  assert.equal(chanLevel({ channel: 6, highUtiCount: 1 })!.level, "high")
  assert.equal(chanLevel(undefined), null)
})
