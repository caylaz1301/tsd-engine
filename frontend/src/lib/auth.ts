export const AUTH_COOKIE = "tsd-session"
export const SESSION_SECONDS = 8 * 60 * 60

const encoder = new TextEncoder()

function secret() {
	return process.env.TSD_SESSION_SECRET ?? "tsd-engine-local-session-secret"
}

async function signature(payload: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret()),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)))
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function equal(left: string, right: string) {
	if (left.length !== right.length) return false
	let mismatch = 0
	for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
	return mismatch === 0
}

export async function createSessionToken(username: string) {
	const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS
	const payload = `${encodeURIComponent(username)}.${expires}`
	return `${payload}.${await signature(payload)}`
}

export async function verifySessionToken(token?: string | null) {
	if (!token) return false
	const parts = token.split(".")
	if (parts.length !== 3) return false
	const [username, rawExpiry, supplied] = parts
	const expiry = Number(rawExpiry)
	if (!username || !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false
	return equal(supplied, await signature(`${username}.${rawExpiry}`))
}

export function validCredentials(username: string, password: string) {
	const expectedUsername = process.env.TSD_AUTH_USERNAME ?? "admin"
	const expectedPassword = process.env.TSD_AUTH_PASSWORD ?? "change-this-password"
	return equal(username, expectedUsername) && equal(password, expectedPassword)
}

export function safeRedirect(value: FormDataEntryValue | string | null | undefined) {
	const path = typeof value === "string" ? value : "/"
	return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/login") ? path : "/"
}
