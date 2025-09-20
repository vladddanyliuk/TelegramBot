import { NextResponse } from "next/server";

const PROTECTED_PATHS = ["/upload"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    path => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("accessToken")?.value;
  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next|static|favicon.ico).*)"]
};
