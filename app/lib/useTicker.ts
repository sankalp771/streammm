"use client";

import { useEffect, useMemo, useState } from "react";
import { clampWei } from "./money";

type TickerInput = {
  active: boolean;
  startTime: bigint | undefined;
  ratePerSecond: bigint | undefined;
  maxBudget: bigint | undefined;
  chainAccrued?: bigint;
};

export function useTicker({ active, startTime, ratePerSecond, maxBudget, chainAccrued }: TickerInput) {
  const [displayed, setDisplayed] = useState<bigint>(BigInt(0));

  useEffect(() => {
    if (!active || startTime === undefined || ratePerSecond === undefined || maxBudget === undefined) {
      return;
    }

    const tick = () => {
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      const elapsedSeconds = nowSeconds > startTime ? nowSeconds - startTime : BigInt(0);
      const localAccrued = clampWei(ratePerSecond * elapsedSeconds, maxBudget);

      setDisplayed((previous) => {
        const floor = chainAccrued !== undefined && chainAccrued > previous ? chainAccrued : previous;
        return localAccrued > floor ? localAccrued : floor;
      });
    };

    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [active, startTime, ratePerSecond, maxBudget, chainAccrued]);

  useEffect(() => {
    if (chainAccrued === undefined || maxBudget === undefined) {
      return;
    }

    setDisplayed((previous) => {
      const next = clampWei(chainAccrued, maxBudget);
      return next > previous ? next : previous;
    });
  }, [chainAccrued, maxBudget]);

  return useMemo(() => {
    const consumed = maxBudget === undefined ? displayed : clampWei(displayed, maxBudget);
    const remaining = maxBudget === undefined ? BigInt(0) : maxBudget - consumed;

    return { consumed, remaining };
  }, [displayed, maxBudget]);
}
