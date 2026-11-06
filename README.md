# Commit Lie Detector

A public API on Cloudflare Workers that compares what a GitHub commit message claims with what the diff actually changed. It judges the commit and never names its author.

**Live:** https://commit-lie-detector.seandoc77.workers.dev

## API

### `GET /check/:owner/:repo/:sha`

```json
{
  "sha": "e3154a77b4ab1fbabb499a56515674f620e84c0a",
  "honesty_score": 9,
  "out_of": 10,
  "verdict": "The diff matches the claim that duplicated code was removed.",
  "claim": "Copter: Auto: remove duplicated loiter run-body (no functional change)",
  "diff_truncated": false,
  "cached": true,
  "model": "@cf/openai/gpt-oss-120b",
  "source": "github_patch",
  "checked_at": "2026-11-06T04:00:00.000Z"
}
```

- `diff_truncated` is `true` when the model did not see every changed line, because it reads about 20 KB of diff.
- `source` says where the commit was read from: `github_api`, or `github_patch` when GitHub's API quota had run out.
- `:sha` is 7 to 40 hex characters. Branch names are refused because they move, which would make a cached score wrong.

| Status | `error.code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Malformed owner, repository or SHA |
| 404 | `commit_not_found` | Unknown or ambiguous SHA, or a private repository |
| 422 | `no_claim`, `commit_too_large` | Nothing to check, or too big to read |
| 429 | `rate_limited` | Too many uncached commits from one client |
| 503 | `ai_quota_exhausted`, `ai_unavailable`, `github_rate_limited` | Try again after `Retry-After` |

### `GET /badge/:owner/:repo/:sha`

An SVG badge with the score, for a README:

```markdown
![honesty](https://commit-lie-detector.seandoc77.workers.dev/badge/OWNER/REPO/SHA)
```

Badge errors stay HTTP 200, with the real status in `X-Error-Status`, because GitHub's image proxy shows a broken image for anything else. They are never cached, so a badge recovers by itself.

## How it works

1. **Cache.** Results live in KV for 30 days, keyed by the full SHA, since a commit never changes. The Cache API sits in front for an hour, because KV can keep serving a miss for up to a minute after a write. Failed judgements are never cached.
2. **GitHub.** Reads the REST API. Without a token that quota is shared with everyone on the same Cloudflare IP and can run out at any time, so it falls back to the commit's public `.patch` URL. That URL returns something else for merge commits, so a merge read while the API quota is out gets a 503 instead of a judgement of the wrong commit.
3. **Author removal.** Names, logins, emails and sign-offs are removed before the model sees the commit and again from everything it writes. The response never echoes the owner or repository.
4. **Judgement.** The message and diff are treated as untrusted data, so a commit that tells the model to give it 10/10 is scored as manipulation.

## Limits

- **Workers AI free plan: 10,000 neurons a day.** That is very roughly 50 to 200 new commits, depending on diff size, and it resets at 00:00 UTC. Cached commits keep working. The Workers Paid plan removes this limit.
- **Scores are one model's opinion.** It is firm on clear lies but too harsh on honest refactors that say "no functional change": see `eval/`. Read the verdict before relying on a low score.
- **Merge commits** can return a 503 until GitHub's API quota recovers. A token avoids this and the shared quota:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Use a token with public-repository read access only. This API is public, so a token that can read private repositories would let anyone query them.

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run deploy
```

`npm run eval` starts a local harness that runs the real prompt through the real model against commits with a known right answer. It uses the same daily AI quota. After changing the prompt or model, run it and then bump `CACHE_VERSION` in `src/index.ts`.
