import type { NotificationPreferences, UiEvent } from "../shared/types";

export interface DesktopNotificationSpec {
  key: string;
  title: string;
  body: string;
  threadId: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  turnCompleted: true,
  attentionRequired: true,
};

export function notificationForEvent(
  event: UiEvent,
  preferences: NotificationPreferences,
  windowFocused: boolean,
): DesktopNotificationSpec | null {
  if (windowFocused) return null;
  if (event.type === "interaction" && preferences.attentionRequired) {
    return {
      key: `interaction:${event.interaction.requestId}`,
      title: "Codex needs your attention",
      body: event.interaction.title,
      threadId: event.interaction.threadId,
    };
  }
  if (
    event.type === "turn" &&
    event.phase === "completed" &&
    preferences.turnCompleted
  ) {
    return {
      key: `turn:${event.threadId}:${event.turnId}:${event.status}`,
      title: event.error ? "Codex stopped with an error" : "Codex finished",
      body: event.error ?? `Turn ${event.status || "completed"}.`,
      threadId: event.threadId,
    };
  }
  return null;
}
