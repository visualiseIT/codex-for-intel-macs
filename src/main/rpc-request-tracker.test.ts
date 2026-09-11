import { describe, expect, it } from "vitest";
import { RpcRequestTracker } from "./rpc-request-tracker";

describe("RpcRequestTracker", () => {
  it("correlates out-of-order responses by id", async () => {
    const tracker = new RpcRequestTracker();
    const first = tracker.wait<string>(1, "first");
    const second = tracker.wait<string>(2, "second");

    tracker.settle({ id: 2, result: "two" });
    tracker.settle({ id: 1, result: "one" });

    await expect(first).resolves.toBe("one");
    await expect(second).resolves.toBe("two");
  });

  it("turns JSON-RPC failures into rejected requests", async () => {
    const tracker = new RpcRequestTracker();
    const result = tracker.wait(7, "broken");
    tracker.settle({ id: 7, error: { code: -1, message: "Nope" } });
    await expect(result).rejects.toThrow("Nope");
  });
});
