type Cleanup = () => unknown | Promise<unknown>;

/** Stop producers, drain their work, then release stores in acquisition-reverse order. */
export class ServerResourceScope {
  private stops: Cleanup[] = [];
  private drains: Cleanup[] = [];
  private releases: Cleanup[] = [];
  private closing: Promise<void> | null = null;

  onStop(cleanup: Cleanup): void { this.stops.push(cleanup); }
  onDrain(cleanup: Cleanup): void { this.drains.push(cleanup); }
  onClose(cleanup: Cleanup): void { this.releases.push(cleanup); }

  close(): Promise<void> {
    this.closing ??= (async () => {
      const errors: unknown[] = [];
      for (const phase of [this.stops, this.drains]) {
        const results = await Promise.allSettled(phase.map(cleanup => Promise.resolve().then(cleanup)));
        for (const result of results) if (result.status === "rejected") errors.push(result.reason);
      }
      for (const release of [...this.releases].reverse()) {
        try { await release(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, "Server resource cleanup failed");
    })();
    return this.closing;
  }

  async fail(error: unknown): Promise<never> {
    try { await this.close(); }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Server startup and cleanup failed", { cause: error });
    }
    throw error;
  }
}
