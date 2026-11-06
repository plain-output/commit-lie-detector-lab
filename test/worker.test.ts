import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const SHA = "a1b2c3d4".repeat(5);

const githubCommit = {
  sha: SHA,
  commit: {
    message: "Fix typo\n\nSigned-off-by: Ada Lovelace <ada@example.org>",
    author: { name: "Quentin Marlowe", email: "qm@example.org" },
    committer: { name: "GitHub", email: "noreply@github.com" },
  },
  author: { login: "qmarlowe" },
  committer: { login: "web-flow" },
  parents: [{}],
  stats: { additions: 1, deletions: 3, total: 4 },
  files: [{ filename: "src/a.js", status: "modified", additions: 1, deletions: 3, patch: "@@ -1 +1 @@\n-a\n+b" }],
};

class FakeCache {
  store = new Map<string, Response>();
  async match(key: string) {
    return this.store.get(key)?.clone();
  }
  async put(key: string, response: Response) {
    this.store.set(key, response);
  }
}

function setup(modelResponse: unknown = { score: 2, verdict: "Quentin Marlowe's commit removes a check.", claim: "Fix typo by @qmarlowe", analysis: "" }) {
  const kv = new Map<string, string>();
  const aiRun = vi.fn(async (_model: string, _input: Record<string, unknown>) => ({ response: modelResponse }));
  const env = {
    AI: { run: aiRun },
    CACHE: {
      get: async (key: string, type?: string) => {
        const value = kv.get(key);
        if (value === undefined) return null;
        return type === "json" ? JSON.parse(value) : value;
      },
      put: async (key: string, value: string) => void kv.set(key, value),
    },
    MISS_LIMIT_PER_IP: { limit: vi.fn(async () => ({ success: true })) },
    MISS_LIMIT_GLOBAL: { limit: vi.fn(async () => ({ success: true })) },
    DAILY_AI_CALL_LIMIT: "300",
  };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => void waits.push(promise), passThroughOnException() {} };
  const call = async (path: string, init?: RequestInit) => {
    const response = await worker.fetch(
      new Request(`https://cld.example${path}`, init) as never,
      env as never,
      ctx as never,
    );
    await Promise.all(waits);
    return response;
  };
  return { env, kv, aiRun, call };
}

let fetchMock: ReturnType<typeof vi.fn>;
const okGithub = () => new Response(JSON.stringify(githubCommit), { status: 200 });

beforeEach(() => {
  vi.stubGlobal("caches", { default: new FakeCache() });
  fetchMock = vi.fn(async () => okGithub());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /check", () => {
  it("returns score, verdict and claim, with the author removed everywhere", async () => {
    const { call } = setup();
    const res = await call(`/check/Acme/Widgets/${SHA}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ sha: SHA, honesty_score: 2, out_of: 10, cached: false });
    expect(typeof body.verdict).toBe("string");
    expect(typeof body.claim).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/quentin|marlowe|qmarlowe|ada|lovelace/i);
  });

  it("never sends the author's identity to the model", async () => {
    const { call, aiRun } = setup();
    await call(`/check/acme/widgets/${SHA}`);
    expect(JSON.stringify(aiRun.mock.calls[0]?.[1])).not.toMatch(/quentin|marlowe|lovelace|ada@/i);
  });

  it("serves the second request from cache without calling GitHub or the model", async () => {
    const { call, aiRun } = setup();
    const first = await (await call(`/check/acme/widgets/${SHA}`)).json<Record<string, unknown>>();
    const second = await call(`/check/ACME/Widgets/${SHA.toUpperCase()}`);
    const body = await second.json<Record<string, unknown>>();
    expect(body.cached).toBe(true);
    expect(body.honesty_score).toBe(first.honesty_score);
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("falls back to KV when the local cache has nothing", async () => {
    const { call, aiRun } = setup();
    await call(`/check/acme/widgets/${SHA}`);
    vi.stubGlobal("caches", { default: new FakeCache() });
    const body = await (await call(`/check/acme/widgets/${SHA}`)).json<Record<string, unknown>>();
    expect(body.cached).toBe(true);
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("resolves a short SHA, stores it, and shares the full SHA's judgement", async () => {
    const { call, aiRun } = setup();
    const short = await (await call(`/check/acme/widgets/${SHA.slice(0, 7)}`)).json<Record<string, unknown>>();
    expect(short.sha).toBe(SHA);
    const full = await (await call(`/check/acme/widgets/${SHA}`)).json<Record<string, unknown>>();
    expect(full.cached).toBe(true);
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed judgement", async () => {
    const { call, kv, aiRun } = setup({ nonsense: true });
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(502);
    expect([...kv.keys()].filter((key) => !key.startsWith("budget:"))).toEqual([]);
    expect(aiRun).toHaveBeenCalledTimes(3);
  });

  it("recovers when the model answers in prose on one attempt", async () => {
    const { call, aiRun } = setup();
    aiRun.mockResolvedValueOnce({ response: "analysis: we need to compare the message" });
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(200);
    expect(aiRun).toHaveBeenCalledTimes(2);
  });

  it("trims quotes the model wraps around a claim", async () => {
    const { call } = setup({ score: 9, verdict: "Holds up.", claim: '"Fix typo"' });
    const body = await (await call(`/check/acme/widgets/${SHA}`)).json<Record<string, unknown>>();
    expect(body.claim).toBe("Fix typo");
  });

  it("rejects branch names, which would cache a moving target", async () => {
    const { call } = setup();
    const res = await call("/check/acme/widgets/main");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed owner and traversal attempts", async () => {
    const { call } = setup();
    expect((await call(`/check/-bad-/widgets/${SHA}`)).status).toBe(400);
    // The URL parser collapses the dots, so this no longer matches a route at all.
    expect((await call(`/check/acme/%2e%2e/${SHA}`)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a missing commit to 404 and remembers it briefly", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    const { call } = setup();
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(404);
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps GitHub's rate limit to 503 with Retry-After", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 120) },
        }),
    );
    const { call } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(100);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("github_rate_limited");
  });

  it("refuses an oversized response without buffering it", async () => {
    fetchMock.mockImplementation(
      async () => new Response("{}", { status: 200, headers: { "content-length": String(64 * 1024 * 1024) } }),
    );
    const { call } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(422);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("commit_too_large");
  });

  it("returns 422 for a message that claims nothing", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ...githubCommit, commit: { ...githubCommit.commit, message: "Signed-off-by: A <a@b.c>" } })),
    );
    const { call, aiRun } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(422);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("applies the limiter before spending GitHub quota, but not on cache hits", async () => {
    const { call, env } = setup();
    await call(`/check/acme/widgets/${SHA}`);
    env.MISS_LIMIT_PER_IP.limit.mockImplementation(async () => ({ success: false }));
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(200);
    const res = await call(`/check/acme/widgets/${"b".repeat(40)}`);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops calling the model once the daily budget is used, while cached commits still work", async () => {
    const { call, kv, aiRun } = setup();
    await call(`/check/acme/widgets/${SHA}`);
    kv.set(`budget:${new Date().toISOString().slice(0, 10)}`, "300");
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(200);
    const otherSha = "b".repeat(40);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ...githubCommit, sha: otherSha })));
    const res = await call(`/check/acme/widgets/${otherSha}`);
    expect(res.status).toBe(503);
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("answers model failures with 503 and does not leak the upstream error", async () => {
    const { call, aiRun } = setup();
    aiRun.mockRejectedValue(new Error("upstream exploded for account 123"));
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("account 123");
    expect(text).toContain("ai_unavailable");
  });

  it("explains an exhausted AI quota and says when to come back, without retrying", async () => {
    const { call, aiRun, kv } = setup();
    aiRun.mockRejectedValue(new Error("4006: you have used up your daily free allocation of 10,000 neurons"));
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(503);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe("ai_quota_exhausted");
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(86_400);
    expect(aiRun).toHaveBeenCalledTimes(1);
    expect([...kv.keys()].filter((key) => !key.startsWith("budget:"))).toEqual([]);
  });
});

describe("fallback when GitHub's API quota is gone", () => {
  const rateLimited = () =>
    new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999999" } });
  const patch = [
    `From ${SHA} Mon Sep 17 00:00:00 2001`,
    "From: Quentin Marlowe <qm@example.org>",
    "Date: Tue, 6 Mar 2012 15:06:50 -0800",
    "Subject: [PATCH] Fix typo",
    "",
    "---",
    " src/a.js | 2 +-",
    " 1 file changed, 1 insertion(+), 1 deletion(-)",
    "",
    "diff --git a/src/a.js b/src/a.js",
    "index 1..2 100644",
    "--- a/src/a.js",
    "+++ b/src/a.js",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "-- ",
    "2.40.0",
    "",
  ].join("\n");

  it("judges from the .patch URL, says so, and still hides the author", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("https://api.github.com/") ? rateLimited() : new Response(patch),
    );
    const { call, aiRun } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.source).toBe("github_patch");
    expect(JSON.stringify(body)).not.toMatch(/quentin|marlowe/i);
    expect(JSON.stringify(aiRun.mock.calls[0]?.[1])).not.toMatch(/quentin|marlowe/i);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://github.com/acme/widgets/commit/${SHA}.patch`);
  });

  it("refuses to judge a different commit when the patch is a merge's series", async () => {
    const other = patch.replace(SHA, "c".repeat(40));
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("https://api.github.com/") ? rateLimited() : new Response(other),
    );
    const { call, aiRun, kv } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`);
    expect(res.status).toBe(503);
    expect(aiRun).not.toHaveBeenCalled();
    expect([...kv.keys()]).toEqual([]);
  });

  it("treats a sign-in page as not found, so private repositories stay private", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("https://api.github.com/") ? rateLimited() : new Response("<!DOCTYPE html><title>Sign in</title>"),
    );
    const { call, aiRun } = setup();
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(404);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("reports the rate limit if the fallback is refused too", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("https://api.github.com/") ? rateLimited() : new Response("slow down", { status: 429 }),
    );
    const { call } = setup();
    expect((await call(`/check/acme/widgets/${SHA}`)).status).toBe(503);
  });
});

describe("GET /badge", () => {
  it("returns SVG with the score and caches it", async () => {
    const { call, aiRun } = setup();
    const res = await call(`/badge/acme/widgets/${SHA}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect(await res.text()).toContain(">2/10<");
    await call(`/badge/acme/widgets/${SHA}`);
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("shares its judgement with /check", async () => {
    const { call, aiRun } = setup();
    await call(`/check/acme/widgets/${SHA}`);
    expect(await (await call(`/badge/acme/widgets/${SHA}`)).text()).toContain(">2/10<");
    expect(aiRun).toHaveBeenCalledTimes(1);
  });

  it("stays a 200 image on failure so a README never shows a broken icon, and is not cached", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    const { call } = setup();
    const res = await call(`/badge/acme/widgets/${SHA}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-error-status")).toBe("404");
    expect(await res.text()).toContain("not found");
  });
});

describe("HTTP behaviour", () => {
  it("serves usage at /, 404 for unknown routes, 405 for other methods", async () => {
    const { call } = setup();
    expect((await call("/")).status).toBe(200);
    expect((await call("/nope")).status).toBe(404);
    const post = await call(`/check/acme/widgets/${SHA}`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toContain("GET");
  });

  it("answers HEAD without a body and allows cross-origin use", async () => {
    const { call } = setup();
    const res = await call(`/check/acme/widgets/${SHA}`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await call(`/check/acme/widgets/${SHA}`, { method: "OPTIONS" })).status).toBe(204);
  });
});
