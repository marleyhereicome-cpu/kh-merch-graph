// Web版の入口 Worker（web-worker/index.ts）の URL の振り分けと、問い合わせフォームの送信。
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: { from: string; to: string; raw: string }[] = [];
vi.mock("../web-worker/email.js", () => ({
  sendRawEmail: async (_b: unknown, from: string, to: string, raw: string) => {
    sent.push({ from, to, raw });
  },
}));

const { default: worker } = await import("../web-worker/index.js");
const { legacyPath } = await import("../web-worker/routes.js");
const { buildMime, validateContact } = await import("../web-worker/contact.js");

// web/ 以下のファイルの代わり。Workers の静的ファイルと同じく、x.html は /x で返し、/x.html は /x へ転送する。
const FILES = new Set([
  "/kingdomhearts/index.html",
  "/kingdomhearts/check.html",
  "/kingdomhearts/images.json",
  "/kingdomhearts/images/games/kh1-ps2-standard-jp.png",
  "/llms.txt",
  "/contact.html",
  "/kh-fallback-logo.png",
]);
const ASSETS = {
  async fetch(req: Request) {
    const u = new URL(req.url);
    const p = u.pathname;
    if (p.endsWith(".html") && FILES.has(p)) {
      const to = p.endsWith("/index.html") ? p.slice(0, -"index.html".length) : p.slice(0, -".html".length);
      return new Response(null, { status: 307, headers: { Location: to + u.search } });
    }
    if (p.endsWith("/") && FILES.has(`${p}index.html`)) return new Response(`file:${p}index.html`);
    if (FILES.has(`${p}.html`)) return new Response(`file:${p}.html`);
    if (FILES.has(p)) return new Response(`file:${p}`);
    if (FILES.has(`${p}/index.html`)) return new Response(null, { status: 307, headers: { Location: `${p}/` } });
    return new Response("not found", { status: 404 });
  },
};

const env = (extra: Record<string, unknown> = {}) => ({ ASSETS, CANONICAL_HOST: "merchgraph.app", ...extra });
const get = (url: string, e = env()) => worker.fetch(new Request(url), e as never);
const body = async (r: Response) => (r.status === 200 ? await r.text() : `${r.status} ${r.headers.get("Location")}`);

describe("URL の振り分け（merchgraph.app）", () => {
  it("ルート / は URL を変えずに /kingdomhearts/ の中身を返す", async () => {
    expect(await body(await get("https://merchgraph.app/"))).toBe("file:/kingdomhearts/index.html");
  });
  it("/kingdomhearts/ 配下はそのまま", async () => {
    expect(await body(await get("https://merchgraph.app/kingdomhearts/"))).toBe("file:/kingdomhearts/index.html");
    expect(await body(await get("https://merchgraph.app/kingdomhearts/check"))).toBe("file:/kingdomhearts/check.html");
    expect(await body(await get("https://merchgraph.app/kingdomhearts/images.json"))).toBe("file:/kingdomhearts/images.json");
  });
  it("ルート直下の相対パスも /kingdomhearts/ の同名を返す（URLは変えない）", async () => {
    expect(await body(await get("https://merchgraph.app/check?src=discover"))).toBe("file:/kingdomhearts/check.html");
    expect(await body(await get("https://merchgraph.app/images.json"))).toBe("file:/kingdomhearts/images.json");
    expect(await body(await get("https://merchgraph.app/images/games/kh1-ps2-standard-jp.png"))).toBe(
      "file:/kingdomhearts/images/games/kh1-ps2-standard-jp.png"
    );
  });
  it("別名で取り出したファイルの転送先に /kingdomhearts を出さない", async () => {
    expect(await body(await get("https://merchgraph.app/check.html?src=x"))).toBe("307 /check?src=x");
  });
  it("ルート直下に実在するファイルはそのまま返す", async () => {
    expect(await body(await get("https://merchgraph.app/llms.txt"))).toBe("file:/llms.txt");
    expect(await body(await get("https://merchgraph.app/contact"))).toBe("file:/contact.html");
    expect(await body(await get("https://merchgraph.app/kh-fallback-logo.png"))).toBe("file:/kh-fallback-logo.png");
  });
  it("無いものは 404", async () => {
    expect((await get("https://merchgraph.app/nope")).status).toBe(404);
  });
  it("旧ファイル名は新しい場所へ 301", async () => {
    expect(await body(await get("https://merchgraph.app/discover.html?src=share"))).toBe("301 https://merchgraph.app/kingdomhearts/?src=share");
    expect(await body(await get("https://merchgraph.app/index.html?src=reddit"))).toBe("301 https://merchgraph.app/kingdomhearts/check?src=reddit");
    expect(legacyPath("/kingdomhearts/")).toBeNull();
  });
});

describe("旧ドメイン（workers.dev）からの転送", () => {
  it("同じパスで merchgraph.app へ 301（旧ファイル名は読み替え）", async () => {
    const old = "https://kh-merch-graph-web.fandex.workers.dev";
    expect(await body(await get(`${old}/`))).toBe("301 https://merchgraph.app/");
    expect(await body(await get(`${old}/discover.html?src=share`))).toBe("301 https://merchgraph.app/kingdomhearts/?src=share");
    expect(await body(await get(`${old}/index.html`))).toBe("301 https://merchgraph.app/kingdomhearts/check");
    expect(await body(await get(`${old}/llms.txt`))).toBe("301 https://merchgraph.app/llms.txt");
  });
});

describe("問い合わせフォーム POST /api/contact", () => {
  beforeEach(() => { sent.length = 0; });
  const post = (b: unknown, e = env()) =>
    worker.fetch(new Request("https://merchgraph.app/api/contact", { method: "POST", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } }), e as never);
  const configured = () => env({ CONTACT_EMAIL: { send: async () => {} }, CONTACT_TO: "owner@example.com", CONTACT_FROM: "contact-form@merchgraph.app" });
  const good = { name: "山田", email: "a@example.com", topic: "press", message: "取材のお願いです。よろしくお願いします。", elapsed_ms: 8000 };

  it("設定前は 503（送らない）", async () => {
    expect((await post(good)).status).toBe(503);
    expect(sent).toHaveLength(0);
  });
  it("正しい内容は転送先へ送る（転送先・送信者は返さない）", async () => {
    const r = await post(good, configured());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@example.com");
    expect(sent[0].raw).toContain("Reply-To: <a@example.com>");
  });
  it("見えない入力欄が埋まっている・速すぎる送信は、成功に見せて送らない", async () => {
    expect((await post({ ...good, website: "http://spam" }, configured())).status).toBe(200);
    expect((await post({ ...good, elapsed_ms: 500 }, configured())).status).toBe(200);
    expect(sent).toHaveLength(0);
  });
  it("入力の誤りは 400", async () => {
    expect((await post({ ...good, email: "x" }, configured())).status).toBe(400);
    expect((await post({ ...good, message: "短い" }, configured())).status).toBe(400);
    expect((await post({ ...good, topic: "rights" }, configured())).status).toBe(400);
  });
  it("GET は 405", async () => {
    expect((await get("https://merchgraph.app/api/contact", configured())).status).toBe(405);
  });
});

describe("メール本文", () => {
  it("ヘッダーに改行を差し込めない・日本語の件名は符号化する", () => {
    const v = validateContact({ name: "x\r\nBcc: evil@example.com", email: "a@example.com", topic: "other", message: "1234567890 hello" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const raw = buildMime("f@merchgraph.app", "t@example.com", v.value);
    expect(raw).not.toMatch(/\r\nBcc:/);
    const jp = validateContact({ name: "山田", email: "a@example.com", topic: "press", message: "こんにちは、取材の件です" });
    if (jp.ok) expect(buildMime("f@merchgraph.app", "t@example.com", jp.value)).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
});
