declare global {
  namespace Express {
    interface Request {
      userId?: string;
      validatedQuery?: Record<string, unknown>;
      actor?: import('../authz/actor.js').Actor;
    }
  }
}

export {};
