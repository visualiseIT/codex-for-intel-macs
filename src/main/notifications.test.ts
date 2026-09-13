import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationForEvent,
} from "./notifications";

describe("notificationForEvent", () => {
  it("notifies for a completed background turn", () => {
    expect(
      notificationForEvent(
        {
          type: "turn",
          phase: "completed",
          threadId: "thread-1",
          turnId: "turn-1",
          status: "completed",
        },
        DEFAULT_NOTIFICATION_PREFERENCES,
        false,
      ),
    ).toMatchObject({ title: "Codex finished", threadId: "thread-1" });
  });

  it("stays quiet while the app is focused", () => {
    expect(
      notificationForEvent(
        {
          type: "interaction",
          interaction: {
            requestId: 1,
            kind: "command",
            threadId: "thread-1",
            turnId: "turn-1",
            title: "Allow command?",
            detail: "Approval needed",
          },
        },
        DEFAULT_NOTIFICATION_PREFERENCES,
        true,
      ),
    ).toBeNull();
  });
});
