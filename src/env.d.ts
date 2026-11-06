// Optional secrets are not in wrangler.jsonc, so `wrangler types` cannot generate them.
interface Env {
  GITHUB_TOKEN?: string;
}
