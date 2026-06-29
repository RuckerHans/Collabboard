import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/ap' || request.nextUrl.pathname.startsWith('/ap/')) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname.replace(/^\/ap(?=\/|$)/, '/api');
    return NextResponse.redirect(url, 307);
  }

  const token = request.cookies.get('collabboard_token')?.value;
  const protectedPath = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/boards');
  if (protectedPath && !token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/ap/:path*', '/dashboard/:path*', '/boards/:path*'] };
