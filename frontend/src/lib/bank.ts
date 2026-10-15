export const BANK_COOKIE = "tsd-bank"
export const BANKS = ["SCB", "DBS", "SMBCI"] as const
export type Bank = (typeof BANKS)[number]
export const DEFAULT_BANK: Bank = "SCB"
