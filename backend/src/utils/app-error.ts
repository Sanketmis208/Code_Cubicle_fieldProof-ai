export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
    /** Stable machine-readable code for clients that need to branch (e.g. NO_ORGANIZATION). */
    public code?: string,
  ) {
    super(message);
  }
}
