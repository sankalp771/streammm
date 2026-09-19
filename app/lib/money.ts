import { formatEther } from "viem";

export function formatMon(value: bigint | undefined, digits = 6) {
  if (value === undefined) {
    return Number(0).toFixed(digits);
  }

  return Number(formatEther(value)).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function clampWei(value: bigint, max: bigint) {
  if (value < BigInt(0)) {
    return BigInt(0);
  }

  return value > max ? max : value;
}
