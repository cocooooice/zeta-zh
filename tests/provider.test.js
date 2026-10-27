import test from "node:test";
import assert from "node:assert/strict";
import { endpointURL, validateText, translateAPI } from "../extension/provider.js";

test("allows HTTPS and loopback HTTP; rejects insecure or credential-bearing endpoints", () => {
  assert.equal(endpointURL("https://api.example/v1/chat/completions").origin, "https://api.example");
  assert.equal(endpointURL("http://localhost:8080/v1/chat/completions").port, "8080");
  for (const url of ["http://example.com/v1", "https://user:secret@example.com/v1", "file:///tmp/key", "https://api.example/v1?key=secret"]) {
    assert.throws(() => endpointURL(url));
  }
});

test("rejects empty and oversized text before any network request", () => {
  assert.throws(() => validateText(" "));
  assert.throws(() => validateText("x".repeat(12001)));
  assert.equal(validateText(" Hello "), "Hello");
});

test("sends only explicit text to configured endpoint and returns plain text", async () => {
  const result = await translateAPI("Hello <script>test</script>", { endpoint: "https://api.example/v1/chat/completions", model: "test", apiKey: "test-key" }, async (url, request) => {
    assert.equal(url, "https://api.example/v1/chat/completions");
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
    assert.equal(request.headers.Authorization, "Bearer test-key");
    assert.equal(JSON.parse(request.body).messages[1].content, "Hello <script>test</script>");
    return { ok: true, json: async () => ({ choices: [{ message: { content: "你好 <script>test</script>" } }] }) };
  });
  assert.equal(result, "你好 <script>test</script>");
});

test("provider errors do not echo secrets or response bodies", async () => {
  const settings = { endpoint: "https://api.example/v1/chat/completions", model: "test", apiKey: "secret" };
  await assert.rejects(translateAPI("Hello", settings, async () => ({ ok: false, status: 401 })), /HTTP 401/);
  await assert.rejects(translateAPI("Hello", settings, async () => ({ ok: true, json: async () => ({ choices: [] }) })), /未返回有效文字/);
});
