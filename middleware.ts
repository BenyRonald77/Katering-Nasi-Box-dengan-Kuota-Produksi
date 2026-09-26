import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "katering_admin_token";

// Middleware berjalan di Edge runtime (tidak mendukung modul Node seperti
// jsonwebtoken), jadi di sini hanya cek keberadaan cookie sebagai gate awal.
// Verifikasi signature JWT sebenarnya dilakukan di Server Component/API
// route (Node.js runtime) lewat getAdminSession().
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
