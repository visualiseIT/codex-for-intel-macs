export class ActiveTurnRegistry {
  private readonly turns = new Set<string>();
  private readonly byThread = new Map<string, string>();
  private readonly starting = new Set<string>();

  startObserved(threadId: string, turnId: string): void {
    this.turns.add(turnId);
    this.byThread.set(threadId, turnId);
  }

  completionObserved(threadId: string, turnId: string): void {
    this.turns.delete(turnId);
    if (this.byThread.get(threadId) === turnId) this.byThread.delete(threadId);
  }

  beginStart(threadId: string): boolean {
    if (this.byThread.has(threadId) || this.starting.has(threadId))
      return false;
    this.starting.add(threadId);
    return true;
  }

  finishStart(threadId: string, turnId: string): void {
    this.starting.delete(threadId);
    this.startObserved(threadId, turnId);
  }

  abandonStart(threadId: string): void {
    this.starting.delete(threadId);
  }

  activeTurn(threadId: string): string | null {
    return this.byThread.get(threadId) ?? null;
  }

  activeThreadIds(): string[] {
    return [...this.byThread.keys()];
  }

  hasAny(): boolean {
    return this.turns.size > 0 || this.starting.size > 0;
  }

  clear(): void {
    this.turns.clear();
    this.byThread.clear();
    this.starting.clear();
  }
}
