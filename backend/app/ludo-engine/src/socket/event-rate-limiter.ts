// Token bucket for inbound Socket.IO events, one bucket per socket. Tokens
// refill continuously rather than on a fixed window, so a client cannot spend
// the whole budget at the end of one window and again at the start of the next.
export class EventRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = limit;
    this.lastRefill = now();
  }

  // Spends one token. False means the socket is over budget and must be closed.
  allow(): boolean {
    const t = this.now();
    const elapsed = t - this.lastRefill;
    if (elapsed < 0) {
      // The clock stepped backwards: re-base instead of freezing the bucket.
      this.lastRefill = t;
    } else if (elapsed > 0) {
      this.tokens = Math.min(this.limit, this.tokens + (elapsed * this.limit) / this.windowMs);
      this.lastRefill = t;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
