export type ErrorCode =
  | "invalid_request"
  | "not_found"
  | "method_not_allowed"
  | "commit_not_found"
  | "commit_too_large"
  | "no_claim"
  | "rate_limited"
  | "github_rate_limited"
  | "github_unavailable"
  | "ai_unavailable"
  | "ai_quota_exhausted"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
