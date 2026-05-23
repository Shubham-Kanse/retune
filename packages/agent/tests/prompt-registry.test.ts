import assert from "node:assert/strict";
import test from "node:test";
import {
  _resetPromptRegistryForTests,
  getPrompt,
  listPrompts,
  register,
  renderPrompt,
} from "../src/prompts/registry";

test.beforeEach(() => {
  _resetPromptRegistryForTests();
});

test("register + get returns the highest version", () => {
  register({ name: "p", version: 1, body: "v1" });
  register({ name: "p", version: 3, body: "v3" });
  register({ name: "p", version: 2, body: "v2" });
  const head = getPrompt("p");
  assert.equal(head.version, 3);
  assert.equal(head.body, "v3");
});

test("get with explicit version pins", () => {
  register({ name: "p", version: 1, body: "v1" });
  register({ name: "p", version: 2, body: "v2" });
  const v1 = getPrompt("p", 1);
  assert.equal(v1.body, "v1");
});

test("get throws on unknown prompt", () => {
  assert.throws(() => getPrompt("nope"));
});

test("get throws on unknown version", () => {
  register({ name: "p", version: 1, body: "v1" });
  assert.throws(() => getPrompt("p", 99));
});

test("re-register same (name, version) is a no-op", () => {
  register({ name: "p", version: 1, body: "first" });
  register({ name: "p", version: 1, body: "duplicate" });
  assert.equal(getPrompt("p", 1).body, "first");
});

test("renderPrompt substitutes placeholders", () => {
  register({
    name: "greet",
    version: 1,
    body: "Hello {{name}}, your score is {{score}}.",
  });
  const out = renderPrompt("greet", { name: "Ada", score: 99 });
  assert.equal(out, "Hello Ada, your score is 99.");
});

test("renderPrompt throws on missing placeholder", () => {
  register({ name: "g", version: 1, body: "Hi {{name}}" });
  assert.throws(() => renderPrompt("g", {}));
});

test("renderPrompt with null/undefined renders empty string", () => {
  register({ name: "g", version: 1, body: "[{{x}}]" });
  assert.equal(renderPrompt("g", { x: null }), "[]");
});

test("listPrompts enumerates registered prompts and versions", () => {
  register({ name: "a", version: 1, body: "" });
  register({ name: "a", version: 2, body: "" });
  register({ name: "b", version: 1, body: "" });
  const list = listPrompts();
  const a = list.find((p) => p.name === "a");
  const b = list.find((p) => p.name === "b");
  assert.deepEqual(a?.versions, [2, 1]);
  assert.deepEqual(b?.versions, [1]);
});
