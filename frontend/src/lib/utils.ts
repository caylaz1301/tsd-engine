import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/** 2643 -> "2.643" (format Indonesia) */
export function num(n: number | null | undefined): string {
	if (n === null || n === undefined) return "–"
	return n.toLocaleString("id-ID")
}

/** Memisahkan nama tabel berkualifikasi jadi bagian database dan nama tabel. */
export function splitTableName(full: string): {
	prefix: string | null
	name: string
} {
	const parts = full.split(".").filter((p) => p.length > 0)
	if (parts.length <= 1) return { prefix: null, name: full }
	return {
		prefix: parts.slice(0, -1).join("."),
		name: parts[parts.length - 1],
	}
}
