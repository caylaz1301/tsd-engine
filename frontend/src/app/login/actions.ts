"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
	AUTH_COOKIE,
	createSessionToken,
	safeRedirect,
	SESSION_SECONDS,
	validCredentials,
} from "@/lib/auth"

export type LoginState = { error: string | null }

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
	const username = String(formData.get("username") ?? "").trim()
	const password = String(formData.get("password") ?? "")
	const next = safeRedirect(formData.get("next"))

	if (!username || !password) return { error: "Masukkan nama pengguna dan kata sandi." }
	if (!validCredentials(username, password)) {
		await new Promise((resolve) => setTimeout(resolve, 450))
		return { error: "Nama pengguna atau kata sandi tidak sesuai." }
	}

	const store = await cookies()
	store.set(AUTH_COOKIE, await createSessionToken(username), {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.TSD_COOKIE_SECURE === "true",
		path: "/",
		maxAge: SESSION_SECONDS,
	})
	redirect(next)
}
