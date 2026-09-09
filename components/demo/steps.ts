export const DEMO_STEPS = [
  {
    id: "chat",
    label: "Chat",
    clicks: ["chat-review"],
    duration: 8000,
  },
  {
    id: "review",
    label: "Review",
    clicks: ["workspace", "change-file"],
    duration: 7000,
  },
  {
    id: "tools",
    label: "Tools",
    clicks: ["chat-emails"],
    duration: 8000,
  },
  {
    id: "build",
    label: "Build",
    clicks: ["chat-stripe"],
    duration: 8000,
  },
  {
    id: "plan",
    label: "Plan",
    clicks: ["chat-ratelimit"],
    duration: 7000,
  },
] as const;

export type DemoStepId = (typeof DEMO_STEPS)[number]["id"];
