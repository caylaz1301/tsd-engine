import { NextRequest, NextResponse } from "next/server"
import { AUTH_COOKIE, safeRedirect, verifySessionToken } from "@/lib/auth"

export async function proxy(request: NextRequest) {
	const authenticated = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value)
	const loginPage = request.nextUrl.pathname === "/login"

	if (loginPage && authenticated) return NextResponse.redirect(new URL("/", request.url))
	if (loginPage) return NextResponse.next()
	if (authenticated) return NextResponse.next()

	const login = new URL("/login", request.url)
	if (request.method === "GET") login.searchParams.set("next", safeRedirect(`${request.nextUrl.pathname}${request.nextUrl.search}`))
	return NextResponse.redirect(login)
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
