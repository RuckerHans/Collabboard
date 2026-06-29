import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type RouteContext = { params: { path: string[] } };

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
]);

async function proxyApiRequest(request: NextRequest, context: RouteContext) {
  const apiBaseUrl = process.env.API_INTERNAL_URL;
  if (!apiBaseUrl) {
    return NextResponse.json(
      {
        statusCode: 503,
        error: 'api_proxy_not_configured',
        message: 'The frontend API proxy is not configured. Set API_INTERNAL_URL.',
        method: request.method,
        path: request.nextUrl.pathname,
      },
      { status: 503 },
    );
  }

  const { path } = context.params;
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join('/')}`,
    apiBaseUrl,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: METHODS_WITHOUT_BODY.has(request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        statusCode: 502,
        error: 'api_unreachable',
        message: `The frontend could not reach the API service at ${apiBaseUrl}.`,
        method: request.method,
        path: request.nextUrl.pathname,
      },
      { status: 502 },
    );
  }
}

export const dynamic = 'force-dynamic';

export const GET = proxyApiRequest;
export const POST = proxyApiRequest;
export const PUT = proxyApiRequest;
export const PATCH = proxyApiRequest;
export const DELETE = proxyApiRequest;
export const OPTIONS = proxyApiRequest;
export const HEAD = proxyApiRequest;
