import { ApiError } from "./errors";
import { parsePatch } from "./patch";

export interface GithubUser {
  login?: string | null;
}

export interface GitIdentity {
  name?: string | null;
  email?: string | null;
}

export interface GithubFile {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author?: GitIdentity | null;
    committer?: GitIdentity | null;
  };
  author?: GithubUser | null;
  committer?: GithubUser | null;
  parents?: unknown[];
  stats?: { total?: number; additions?: number; deletions?: number };
  files?: GithubFile[];
}

export interface FetchedCommit {
  commit: GithubCommit;
  /** True when GitHub paginated the file list and we only read the first page. */
  moreFiles: boolean;
}

export type CommitSource = "github_api" | "github_patch";

const NOT_FOUND_MESSAGE = "No such commit is readable in a public GitHub repository.";
const FILES_PER_PAGE = 100;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
// The model only sees about 20 KB of diff, so there is no value in reading more of a huge patch.
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const USER_AGENT = "commit-lie-detector";

/**
 * Reads from the REST API. Without a token that shares a 60-per-hour quota with every other Worker
 * on the same Cloudflare IP, which runs out unpredictably. When the API refuses on quota, this falls
 * back to the same commit's public .patch URL, which has no such quota.
 */
export async function fetchCommit(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
): Promise<FetchedCommit & { source: CommitSource }> {
  try {
    return { ...(await fetchFromApi(owner, repo, sha, token)), source: "github_api" };
  } catch (error) {
    if (error instanceof ApiError && error.code === "github_rate_limited") {
      return { ...(await fetchFromPatch(owner, repo, sha, error)), source: "github_patch" };
    }
    throw error;
  }
}

async function fetchFromPatch(
  owner: string,
  repo: string,
  sha: string,
  apiError: ApiError,
): Promise<FetchedCommit> {
  let res: Response;
  try {
    res = await fetch(`https://github.com/${owner}/${repo}/commit/${sha}.patch`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw apiError;
  }
  if (res.status === 404) {
    await res.body?.cancel();
    throw new ApiError("commit_not_found", 404, NOT_FOUND_MESSAGE);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw apiError;
  }
  const { text, clipped } = await readUpTo(res, MAX_PATCH_BYTES);
  if (!text.startsWith("From ")) throw new ApiError("commit_not_found", 404, NOT_FOUND_MESSAGE);
  // A merge commit's .patch is the series of commits it merged, not the merge itself. Judging that
  // would score a different commit, so report the quota problem and let the caller retry.
  const parsed = parsePatch(text, clipped, sha);
  if (!parsed) throw apiError;
  return parsed;
}

async function fetchFromApi(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
): Promise<FetchedCommit> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}?per_page=${FILES_PER_PAGE}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new ApiError("github_unavailable", 502, "GitHub did not respond in time.", 30);
  }

  if (!res.ok) {
    await res.body?.cancel();
    throw mapGithubError(res);
  }

  if (Number(res.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await res.body?.cancel();
    throw tooLarge();
  }
  const { text: body, clipped } = await readUpTo(res, MAX_RESPONSE_BYTES);
  if (clipped) throw tooLarge();

  let commit: GithubCommit;
  try {
    commit = JSON.parse(body) as GithubCommit;
  } catch {
    throw new ApiError("github_unavailable", 502, "GitHub returned an unreadable response.", 30);
  }
  if (typeof commit.sha !== "string" || typeof commit.commit?.message !== "string") {
    throw new ApiError("github_unavailable", 502, "GitHub returned an unexpected response.", 30);
  }
  return { commit, moreFiles: /rel="next"/.test(res.headers.get("link") ?? "") };
}

function tooLarge(): ApiError {
  return new ApiError("commit_too_large", 422, "This commit's diff is too large to judge.");
}

function mapGithubError(res: Response): ApiError {
  const { status, headers } = res;
  const isRateLimit =
    status === 429 ||
    (status === 403 && (headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after")));
  if (isRateLimit) {
    return new ApiError(
      "github_rate_limited",
      503,
      "GitHub's API rate limit was reached. Try again later.",
      retryAfterSeconds(headers),
    );
  }
  // 404 unknown, 409 empty repository, 422 unknown or ambiguous SHA,
  // 403 and 451 repository blocked. Private repositories also answer 404.
  if ([403, 404, 409, 422, 451].includes(status)) {
    return new ApiError("commit_not_found", 404, NOT_FOUND_MESSAGE);
  }
  return new ApiError("github_unavailable", 502, "GitHub could not serve this commit right now.", 30);
}

function retryAfterSeconds(headers: Headers): number {
  const retryAfter = Number(headers.get("retry-after"));
  if (retryAfter > 0) return Math.ceil(retryAfter);
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (reset > 0) return Math.max(1, Math.ceil(reset - Date.now() / 1000));
  return 60;
}

/** Reads a body as text, refusing to buffer more than maxBytes into Worker memory. */
async function readUpTo(res: Response, maxBytes: number): Promise<{ text: string; clipped: boolean }> {
  if (!res.body) return { text: "", clipped: false };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received > maxBytes) {
      await reader.cancel();
      return { text, clipped: true };
    }
  }
  return { text: text + decoder.decode(), clipped: false };
}
