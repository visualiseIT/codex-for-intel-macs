import { describe, expect, it } from "vitest";
import { ActiveTurnRegistry } from "./active-turns";

describe("ActiveTurnRegistry", () => {
  it("tracks independent simultaneous conversations", () => {
    const registry = new ActiveTurnRegistry();
    registry.startObserved("thread-a", "turn-a");
    registry.startObserved("thread-b", "turn-b");
    expect(registry.activeTurn("thread-a")).toBe("turn-a");
    expect(registry.activeTurn("thread-b")).toBe("turn-b");
    expect(registry.hasAny()).toBe(true);
  });

  it("blocks competing starts only within the same conversation", () => {
    const registry = new ActiveTurnRegistry();
    expect(registry.beginStart("thread-a")).toBe(true);
    expect(registry.beginStart("thread-a")).toBe(false);
    expect(registry.beginStart("thread-b")).toBe(true);
    registry.finishStart("thread-a", "turn-a");
    expect(registry.beginStart("thread-a")).toBe(false);
    registry.completionObserved("thread-a", "turn-a");
    expect(registry.beginStart("thread-a")).toBe(true);
  });

  it("does not clear a newer turn when an older completion arrives", () => {
    const registry = new ActiveTurnRegistry();
    registry.startObserved("thread-a", "old");
    registry.startObserved("thread-a", "new");
    registry.completionObserved("thread-a", "old");
    expect(registry.activeTurn("thread-a")).toBe("new");
  });
});
