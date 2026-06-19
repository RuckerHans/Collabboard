import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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

export const config = { matcher: ['/dashboard/:path*', '/boards/:path*'] };
