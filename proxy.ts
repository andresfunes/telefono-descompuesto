import { NextResponse, type NextRequest } from "next/server";
import { isAdminAnalyticsAuthorized } from "@/lib/product-analytics/admin-auth";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin/analytics")) {
    const secret = process.env.ADMIN_ANALYTICS_SECRET;
    if (!secret?.trim()) {
      return new NextResponse("ADMIN_ANALYTICS_SECRET no está configurado.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (!isAdminAnalyticsAuthorized(request.headers.get("authorization"), secret)) {
      return new NextResponse("Autenticación requerida.", {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Basic realm="Analítica interna", charset="UTF-8"',
        },
      });
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
