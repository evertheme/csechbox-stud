/**
 * ChatBox component tests.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ChatBox } from "../../components/game/ChatBox";
import type { ChatMessage } from "../../store/game-store";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "user-1";

function makeMsg(id: string, userId: string, username: string, message: string): ChatMessage {
  return { id, userId, username, message, timestamp: Date.now() };
}

const MESSAGES: ChatMessage[] = [
  makeMsg("m1", "user-2", "Bob",   "Nice hand!"),
  makeMsg("m2", USER_ID, "Alice",  "Thanks 😎"),
  makeMsg("m3", "user-3", "Carol", "All in!"),
];

const BASE = {
  messages:      [] as ChatMessage[],
  currentUserId: USER_ID,
  onSend:        jest.fn(),
};

function renderChat(overrides: Partial<typeof BASE> = {}) {
  return render(<ChatBox {...BASE} {...overrides} />);
}

afterEach(() => jest.clearAllMocks());

// ─── Collapsed state ──────────────────────────────────────────────────────────

describe("ChatBox — collapsed", () => {
  it("renders the toggle button", () => {
    renderChat();
    expect(screen.getByTestId("chat-toggle")).toBeTruthy();
  });

  it("shows placeholder text when no messages", () => {
    renderChat({ messages: [] });
    expect(screen.getByText("Chat…")).toBeTruthy();
  });

  it("shows preview of latest message when messages exist", () => {
    renderChat({ messages: MESSAGES });
    // The last message preview should be visible
    expect(screen.getByText(/All in!/)).toBeTruthy();
  });

  it("does NOT show message list when collapsed", () => {
    renderChat({ messages: MESSAGES });
    expect(screen.queryByTestId("message-list")).toBeNull();
  });
});

// ─── Expanded state ───────────────────────────────────────────────────────────

describe("ChatBox — expanded", () => {
  function renderExpanded(overrides: Partial<typeof BASE> = {}) {
    const result = renderChat(overrides);
    fireEvent.press(screen.getByTestId("chat-toggle"));
    return result;
  }

  it("shows message list when expanded", () => {
    renderExpanded({ messages: MESSAGES });
    expect(screen.getByTestId("message-list")).toBeTruthy();
  });

  it("renders each message", () => {
    renderExpanded({ messages: MESSAGES });
    expect(screen.getByTestId("message-m1")).toBeTruthy();
    expect(screen.getByTestId("message-m2")).toBeTruthy();
    expect(screen.getByTestId("message-m3")).toBeTruthy();
  });

  it("shows chat input and send button", () => {
    renderExpanded();
    expect(screen.getByTestId("chat-input")).toBeTruthy();
    expect(screen.getByTestId("chat-send")).toBeTruthy();
  });

  it("collapses again when toggle pressed twice", () => {
    renderExpanded({ messages: MESSAGES });
    fireEvent.press(screen.getByTestId("chat-toggle"));
    expect(screen.queryByTestId("message-list")).toBeNull();
  });
});

// ─── Sending messages ─────────────────────────────────────────────────────────

describe("ChatBox — sending", () => {
  function renderExpanded(onSend: jest.Mock = jest.fn()) {
    render(<ChatBox {...BASE} onSend={onSend} />);
    fireEvent.press(screen.getByTestId("chat-toggle"));
    return onSend;
  }

  it("calls onSend with typed message when Send pressed", () => {
    const onSend = renderExpanded();
    fireEvent.changeText(screen.getByTestId("chat-input"), "Hello!");
    fireEvent.press(screen.getByTestId("chat-send"));
    expect(onSend).toHaveBeenCalledWith("Hello!");
  });

  it("clears the input after sending", () => {
    renderExpanded();
    fireEvent.changeText(screen.getByTestId("chat-input"), "Test message");
    fireEvent.press(screen.getByTestId("chat-send"));
    expect(screen.getByTestId("chat-input").props.value).toBe("");
  });

  it("does NOT call onSend when message is empty", () => {
    const onSend = renderExpanded();
    fireEvent.press(screen.getByTestId("chat-send"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does NOT call onSend for whitespace-only input", () => {
    const onSend = renderExpanded();
    fireEvent.changeText(screen.getByTestId("chat-input"), "   ");
    fireEvent.press(screen.getByTestId("chat-send"));
    expect(onSend).not.toHaveBeenCalled();
  });
});

// ─── Quick emoji buttons ──────────────────────────────────────────────────────

describe("ChatBox — quick emojis", () => {
  it("calls onSend with emoji when quick emoji pressed", () => {
    const onSend = jest.fn();
    render(<ChatBox {...BASE} onSend={onSend} />);
    fireEvent.press(screen.getByTestId("chat-toggle"));
    fireEvent.press(screen.getByTestId("emoji-😄"));
    expect(onSend).toHaveBeenCalledWith("😄");
  });
});
