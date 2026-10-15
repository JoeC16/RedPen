import { currentUser, type SessionUser } from "./session";
import { ForbiddenError } from "./tenancy";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const notFound = () => json(404, { error: "Not found" });

/**
 * Wrap a route handler: resolve the session user (401 if none), map role
 * errors to 403, and never leak internal error detail. Cross-tenant ids return
 * 404 from the handler so the existence of other schools' data is not revealed.
 */
export function withUser<A extends unknown[]>(
  fn: (user: SessionUser, req: Request, ...rest: A) => Promise<Response>,
) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const user = await currentUser();
    if (!user) return json(401, { error: "Not signed in" });
    try {
      return await fn(user, req, ...rest);
    } catch (err) {
      if (err instanceof ForbiddenError) return json(403, { error: "Forbidden" });
      console.error("api error", { route: new URL(req.url).pathname, name: (err as Error)?.name });
      return json(500, { error: "Something went wrong" });
    }
  };
}

export const ok = (body: unknown) => json(200, body);

export type RouteParams<P> = { params: Promise<P> };
