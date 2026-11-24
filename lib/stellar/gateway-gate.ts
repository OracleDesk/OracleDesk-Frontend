export interface GatewayGate {
  acquire(gateway: string): Promise<() => void>;
}

interface Bucket {
  tokens: number;
  last: number;
}

export function createGatewayGate(opts: { maxInFlight?: number; ratePerSecond?: number } = {}): GatewayGate {
  const maxInFlight = Math.max(1, opts.maxInFlight ?? 2);
  const ratePerSecond = Math.max(0.001, opts.ratePerSecond ?? 4);
  const active = new Map<string, number>();
  const buckets = new Map<string, Bucket>();
  const waiters: Array<{ gateway: string; resolve: (release: () => void) => void }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const bucketFor = (gateway: string): Bucket => {
    let bucket = buckets.get(gateway);
    if (!bucket) {
      bucket = { tokens: maxInFlight, last: Date.now() };
      buckets.set(gateway, bucket);
    }
    return bucket;
  };

  const refill = (gateway: string): Bucket => {
    const bucket = bucketFor(gateway);
    const now = Date.now();
    bucket.tokens = Math.min(maxInFlight, bucket.tokens + ((now - bucket.last) / 1000) * ratePerSecond);
    bucket.last = now;
    return bucket;
  };

  const tryStart = (gateway: string): boolean => {
    if ((active.get(gateway) ?? 0) >= maxInFlight) return false;
    const bucket = refill(gateway);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    active.set(gateway, (active.get(gateway) ?? 0) + 1);
    return true;
  };

  const nextDelay = (): number => {
    let delay = 50;
    for (const { gateway } of waiters) {
      if ((active.get(gateway) ?? 0) >= maxInFlight) continue;
      const bucket = refill(gateway);
      const wait = bucket.tokens >= 1 ? 0 : ((1 - bucket.tokens) / ratePerSecond) * 1000;
      delay = Math.min(delay, Math.max(20, Math.ceil(wait)));
    }
    return delay;
  };

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    for (let i = 0; i < waiters.length;) {
      const waiter = waiters[i];
      if (!tryStart(waiter.gateway)) {
        i += 1;
        continue;
      }
      waiters.splice(i, 1);
      let released = false;
      waiter.resolve(() => {
        if (released) return;
        released = true;
        active.set(waiter.gateway, Math.max(0, (active.get(waiter.gateway) ?? 1) - 1));
        schedule();
      });
    }
    if (waiters.length) timer = setTimeout(schedule, nextDelay());
  };

  return {
    acquire(gateway) {
      if (tryStart(gateway)) {
        let released = false;
        return Promise.resolve(() => {
          if (released) return;
          released = true;
          active.set(gateway, Math.max(0, (active.get(gateway) ?? 1) - 1));
          schedule();
        });
      }
      return new Promise((resolve) => {
        waiters.push({ gateway, resolve });
        schedule();
      });
    },
  };
}
