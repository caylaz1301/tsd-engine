import { cookies } from "next/headers"
import { BANK_COOKIE, BANKS, DEFAULT_BANK } from "@/lib/bank"

export async function getSelectedBank(): Promise<string> {
	const value = (await cookies()).get(BANK_COOKIE)?.value ?? ""
	try {
		const decoded = decodeURIComponent(value)
		return BANKS.find((bank) => bank === decoded) ?? DEFAULT_BANK
	} catch {
		return DEFAULT_BANK
	}
}
