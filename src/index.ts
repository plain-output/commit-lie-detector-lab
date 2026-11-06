import { scoreBadge, statusBadge } from "./badge";
import { ApiError, type ErrorCode } from "./errors";
import { fetchCommit, type CommitSource } from "./github";
import { judgeCommit, MODEL, type Judgement, type RunModel } from "./judge";

/** Bump when the prompt or model changes, so old judgements are not served as new ones. */
const CACHE_VERSION = "v4";
const FULL_SHA_TTL = 60 * 60 * 24 * 30;
const SHORT_SHA_TTL = 60 * 60 * 24;
const NOT_FOUND_TTL = 60 * 5;
const LOCAL_CACHE_TTL = 60 * 60;
const CLIENT_MAX_AGE = 60 * 60 * 24;
const BUDGET_KEY_TTL = 60 * 60 * 48;

const ROUTE = /^\/(check|badge)\/([^/]+)\/([^/]+)\/([^/]+)\/?$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-fA-F]{7,40}$/;

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

interface StoredResult extends Judgement {
  sha: string;
  model: string;
  source: CommitSource;
  checked_at: string;
}

interface CommitRef {
  owner: string;
  repo: string;
  sha: string;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const response = await route(request, env, ctx);
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" },
    });
  }

  const url = new URL(request.url);
  const match = ROUTE.exec(url.pathname);
  const kind = match?.[1];
  const isBadge = kind === "badge";

  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      throw new ApiError("method_not_allowed", 405, "Use GET.");
    }
    if (url.pathname === "/") return usage(url.origin);
    if (!match) throw new ApiError("not_found", 404, "Unknown route. See / for usage.");

    const ref = parseRef(match[2] ?? "", match[3] ?? "", match[4] ?? "");
    const { result, cached } = await getJudgement(ref, request, env, ctx, url.origin);
    return isBadge ? badgeResponse(result, cached) : checkResponse(result, cached);
  } catch (error) {
    const apiError = toApiError(error);
    return isBadge ? badgeError(apiError) : jsonError(apiError);
  }
}

function parseRef(owner: string, repo: string, sha: string): CommitRef {
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    throw new ApiError("invalid_request", 400, "That is not a valid GitHub owner and repository.");
  }
  if (!SHA.test(sha)) {
    throw new ApiError(
      "invalid_request",
      400,
      "The commit must be a hexadecimal SHA of 7 to 40 characters. Branch names are not accepted because they move.",
    );
  }
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase(), sha: sha.toLowerCase() };
}

async function getJudgement(
  ref: CommitRef,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  origin: string,
): Promise<{ result: StoredResult; cached: boolean }> {
  const requestedKey = cacheKey(ref, ref.sha);

  const hit = await readCache(requestedKey, env, origin);
  if (hit) return { result: hit, cached: true };

  const notFoundUrl = cacheUrl(origin, `${requestedKey}:missing`);
  if (await caches.default.match(notFoundUrl)) {
    throw new ApiError("commit_not_found", 404, "No such commit is readable in a public GitHub repository.");
  }

  await enforceMissLimits(request, env);

  let fetched;
  try {
    fetched = await fetchCommit(ref.owner, ref.repo, ref.sha, env.GITHUB_TOKEN);
  } catch (error) {
    if (error instanceof ApiError && error.code === "commit_not_found") {
      ctx.waitUntil(
        caches.default.put(
          notFoundUrl,
          new Response("missing", { headers: { "Cache-Control": `public, max-age=${NOT_FOUND_TTL}` } }),
        ),
      );
    }
    throw error;
  }

  const fullSha = fetched.commit.sha.toLowerCase();
  const fullKey = cacheKey(ref, fullSha);
  // A short SHA may resolve to a commit somebody has already paid to judge.
  if (fullKey !== requestedKey) {
    const existing = await readCache(fullKey, env, origin);
    if (existing) {
      ctx.waitUntil(writeCache(requestedKey, existing, SHORT_SHA_TTL, env, origin));
      return { result: existing, cached: true };
    }
  }

  await enforceDailyBudget(env, ctx);

  const runModel: RunModel = (model, input) => env.AI.run(model as keyof AiModels, input as never);
  const judgement = await judgeCommit(fetched, runModel);
  const result: StoredResult = {
    sha: fullSha,
    ...judgement,
    model: MODEL,
    source: fetched.source,
    checked_at: new Date().toISOString(),
  };

  ctx.waitUntil(writeCache(fullKey, result, FULL_SHA_TTL, env, origin));
  if (fullKey !== requestedKey) {
    ctx.waitUntil(writeCache(requestedKey, result, SHORT_SHA_TTL, env, origin));
  }
  return { result, cached: false };
}

function cacheKey(ref: CommitRef, sha: string): string {
  return `${CACHE_VERSION}:${ref.owner}/${ref.repo}/${sha}`;
}

function cacheUrl(origin: string, key: string): string {
  return `${origin}/__edge/${encodeURIComponent(key)}`;
}

/**
 * Two tiers. KV is global but caches misses for up to a minute, so a repeat request straight after
 * a judgement could miss it and pay the model again. The Cache API is local to one location and
 * sees its own writes at once, which closes that gap. It only has to outlast that minute, and entries
 * there cannot be purged from outside, so it is kept short and KV stays the source of truth.
 */
async function readCache(key: string, env: Env, origin: string): Promise<StoredResult | null> {
  const local = await caches.default.match(cacheUrl(origin, key));
  if (local) return (await local.json()) as StoredResult;
  return env.CACHE.get<StoredResult>(key, "json");
}

async function writeCache(
  key: string,
  result: StoredResult,
  ttl: number,
  env: Env,
  origin: string,
): Promise<void> {
  const body = JSON.stringify(result);
  const writes = await Promise.allSettled([
    env.CACHE.put(key, body, { expirationTtl: ttl }),
    caches.default.put(
      cacheUrl(origin, key),
      new Response(body, {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${LOCAL_CACHE_TTL}` },
      }),
    ),
  ]);
  for (const write of writes) {
    if (write.status === "rejected") {
      console.error(JSON.stringify({ message: "cache write failed", error: String(write.reason) }));
    }
  }
}

async function enforceMissLimits(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const [perIp, global] = await Promise.all([
    env.MISS_LIMIT_PER_IP.limit({ key: ip }),
    env.MISS_LIMIT_GLOBAL.limit({ key: "all" }),
  ]);
  if (!perIp.success || !global.success) {
    throw new ApiError("rate_limited", 429, "Too many uncached commits at once. Try again in a minute.", 60);
  }
}

/** Approximate by design: KV counters can undercount under concurrency, which is fine for a cost ceiling. */
async function enforceDailyBudget(env: Env, ctx: ExecutionContext): Promise<void> {
  const limit = Number(env.DAILY_AI_CALL_LIMIT);
  const key = `budget:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.CACHE.get(key)) ?? 0);
  if (used >= limit) {
    throw new ApiError("ai_unavailable", 503, "Today's quota of new judgements is used up. Cached commits still work.", 3600);
  }
  ctx.waitUntil(
    env.CACHE.put(key, String(used + 1), { expirationTtl: BUDGET_KEY_TTL }).catch((error: unknown) => {
      console.error(JSON.stringify({ message: "budget write failed", error: String(error) }));
    }),
  );
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  console.error(
    JSON.stringify({
      message: "unhandled error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  return new ApiError("internal_error", 500, "Something went wrong judging this commit.", 30);
}

function checkResponse(result: StoredResult, cached: boolean): Response {
  const { sha, honesty_score, verdict, claim, diff_truncated, model, source, checked_at } = result;
  return new Response(
    JSON.stringify(
      { sha, honesty_score, out_of: 10, verdict, claim, diff_truncated, cached, model, source, checked_at },
      null,
      2,
    ),
    {
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CLIENT_MAX_AGE}`,
        "X-Cache": cached ? "HIT" : "MISS",
      },
    },
  );
}

function svgHeaders(extra: Record<string, string>): Record<string, string> {
  return {
    ...BASE_HEADERS,
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    ...extra,
  };
}

function badgeResponse(result: StoredResult, cached: boolean): Response {
  return new Response(scoreBadge(result.honesty_score), {
    headers: svgHeaders({
      "Cache-Control": `public, max-age=${CLIENT_MAX_AGE}`,
      "X-Cache": cached ? "HIT" : "MISS",
    }),
  });
}

const BADGE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  invalid_request: "invalid",
  not_found: "not found",
  commit_not_found: "not found",
  commit_too_large: "too large",
  no_claim: "no claim",
};

/**
 * GitHub's image proxy shows a broken-image icon for any non-2xx response, so badge errors stay 200
 * with the real status in a header. They are never cached, so the badge recovers by itself.
 */
function badgeError(error: ApiError): Response {
  if (error.code === "method_not_allowed") return jsonError(error);
  return new Response(statusBadge(BADGE_MESSAGES[error.code] ?? "unavailable"), {
    headers: svgHeaders({ "Cache-Control": "no-store", "X-Error-Status": String(error.status) }),
  });
}

function jsonError(error: ApiError): Response {
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (error.retryAfter) headers["Retry-After"] = String(error.retryAfter);
  if (error.code === "method_not_allowed") headers.Allow = "GET, HEAD, OPTIONS";
  return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2), {
    status: error.status,
    headers,
  });
}

function usage(origin: string): Response {
  return new Response(
    JSON.stringify(
      {
        name: "Commit Lie Detector",
        description: "Compares what a public GitHub commit message claims with what its diff changed.",
        endpoints: {
          check: `${origin}/check/:owner/:repo/:sha`,
          badge: `${origin}/badge/:owner/:repo/:sha`,
        },
      },
      null,
      2,
    ),
    {
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
