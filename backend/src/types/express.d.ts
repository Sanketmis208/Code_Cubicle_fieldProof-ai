declare global {
  namespace Express {
    interface Request {
      userId?: string;
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export {};
