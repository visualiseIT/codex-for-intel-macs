interface RpcFailure {
  code?: number;
  message?: string;
}

export interface RpcResponse {
  id: number | string;
  result?: unknown;
  error?: RpcFailure;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RpcRequestTracker {
  private readonly pending = new Map<number | string, PendingRequest>();

  constructor(private readonly timeoutMs = 30_000) {}

  wait<T>(id: number | string, method: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });
  }

  settle(response: RpcResponse): boolean {
    const pending = this.pending.get(response.id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(
        new Error(
          response.error.message ??
            `Codex request failed (${response.error.code}).`,
        ),
      );
    } else {
      pending.resolve(response.result);
    }
    return true;
  }

  reject(id: number | string, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.reject(error);
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
