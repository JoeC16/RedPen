import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "@/server/csrf";

// Not an authentication boundary: every page and route checks the session
// itself. This only rejects cross-site writes.
export function proxy(req: NextRequest) {
  if (isCrossSiteWrite(req)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
