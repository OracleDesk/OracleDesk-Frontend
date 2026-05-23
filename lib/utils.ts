import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWalletAddress(address: string, leading = 5, trailing = 4) {
  if (address.length <= leading + trailing) {
    return address;
  }

  return `${address.slice(0, leading)}...${address.slice(-trailing)}`;
}
