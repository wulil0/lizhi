// LRC 解析单元测试：node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLRC, lineAt } = require("../js/lrc.js");

test("基本时间标签与排序", () => {
  const r = parseLRC("[00:05.50]第二行\n[00:01.00]第一行\n[01:02.123]第三行");
  assert.deepEqual(r, [{ t: 1, text: "第一行" }, { t: 5.5, text: "第二行" }, { t: 62.123, text: "第三行" }]);
});

test("一行多个时间标签", () => {
  const r = parseLRC("[00:10.00][00:30.00]副歌");
  assert.deepEqual(r.map((l) => l.t), [10, 30]);
  assert.ok(r.every((l) => l.text === "副歌"));
});

test("忽略信息标签与无时间的行", () => {
  const r = parseLRC("[ti:标题]\n[ar:李志]\n纯文本\n[00:02]有词");
  assert.deepEqual(r, [{ t: 2, text: "有词" }]);
});

test("offset 为正时歌词整体提前，且不小于 0", () => {
  const r = parseLRC("[offset:500]\n[00:01.00]a\n[00:00.20]b");
  assert.deepEqual(r.map((l) => l.t), [0, 0.5]);
});

test("冒号分隔的百分秒与空行", () => {
  const r = parseLRC("[00:03:50]x\r\n[00:04.00]");
  assert.deepEqual(r, [{ t: 3.5, text: "x" }, { t: 4, text: "" }]);
});

test("lineAt 找到当前行", () => {
  const lines = parseLRC("[00:01]a\n[00:03]b\n[00:05]c");
  assert.equal(lineAt(lines, 0.5), -1);
  assert.equal(lineAt(lines, 1), 0);
  assert.equal(lineAt(lines, 4.9), 1);
  assert.equal(lineAt(lines, 99), 2);
  assert.equal(lineAt([], 3), -1);
});
