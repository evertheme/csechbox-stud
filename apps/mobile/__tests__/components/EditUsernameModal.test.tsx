import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../../lib/usernameCheck", () => ({
  checkUsernameAvailable: jest.fn(),
}));

import { checkUsernameAvailable } from "../../lib/usernameCheck";
import { EditUsernameModal } from "../../components/EditUsernameModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  visible: true,
  currentUsername: "PokerAce",
  onClose: jest.fn(),
  onSave: jest.fn(),
};

function renderModal(overrides = {}) {
  return render(<EditUsernameModal {...DEFAULT_PROPS} {...overrides} />);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("EditUsernameModal — rendering", () => {
  it("renders the modal when visible is true", () => {
    renderModal();
    expect(screen.getByTestId("modal-sheet")).toBeTruthy();
  });

  it("does not render the sheet when visible is false", () => {
    renderModal({ visible: false });
    expect(screen.queryByTestId("modal-sheet")).toBeNull();
  });

  it("pre-fills the input with currentUsername", () => {
    renderModal();
    expect(screen.getByTestId("input-username").props.value).toBe("PokerAce");
  });

  it("shows the correct initial character count", () => {
    renderModal();
    // "PokerAce" = 8 chars
    expect(screen.getByTestId("char-count").props.children).toEqual([8, "/", 20]);
  });

  it("shows the title 'Change Username'", () => {
    renderModal();
    expect(screen.getByText("Change Username")).toBeTruthy();
  });
});

// ─── Character count ──────────────────────────────────────────────────────────

describe("EditUsernameModal — character count", () => {
  it("updates character count as the user types", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "NewPlayer123");
    expect(screen.getByTestId("char-count").props.children).toEqual([12, "/", 20]);
  });

  it("shows count in red when below minimum length", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ab");
    const charCount = screen.getByTestId("char-count");
    expect(charCount.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: "#f87171" })])
    );
  });

  it("shows count in red when at maximum length (edge: exactly 20 is fine, >20 blocked by maxLength)", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "A".repeat(20));
    // 20 chars is valid — count should NOT be red.
    const charCount = screen.getByTestId("char-count");
    expect(charCount.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: "#64748b" })])
    );
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("EditUsernameModal — validation messages", () => {
  it("shows no validation message when value equals currentUsername", () => {
    renderModal();
    // Already pre-filled with currentUsername — status should be idle.
    expect(screen.queryByTestId("validation-status")).toBeNull();
  });

  it("shows length error for input shorter than 3 chars", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ab");
    expect(screen.getByTestId("validation-message").props.children).toMatch(
      /3.{1,5}20 characters/i
    );
  });

  it("shows character error for invalid characters", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "bad name!");
    expect(screen.getByTestId("validation-message").props.children).toMatch(
      /letters, numbers/i
    );
  });

  it("shows checking spinner while debouncing", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");
    // Immediately after typing — spinner should show (before debounce fires).
    expect(screen.getByTestId("checking-spinner")).toBeTruthy();
  });

  it("shows available message after debounce resolves as free", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");

    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(screen.getByTestId("validation-message").props.children).toMatch(
        /available/i
      )
    );
  });

  it("shows taken message after debounce resolves as unavailable", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(false);
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "TakenName1");

    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(screen.getByTestId("validation-message").props.children).toMatch(
        /taken/i
      )
    );
  });

  it("does NOT trigger availability check before debounce fires", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");
    // Advance only 300ms — not enough for the 500ms debounce.
    act(() => { jest.advanceTimersByTime(300); });
    expect(jest.mocked(checkUsernameAvailable)).not.toHaveBeenCalled();
  });

  it("cancels previous debounce when user types again", async () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");
    act(() => { jest.advanceTimersByTime(300); });
    // Type again before debounce fires.
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName2");
    await act(async () => { jest.advanceTimersByTime(500); });

    await waitFor(() =>
      expect(jest.mocked(checkUsernameAvailable)).toHaveBeenCalledTimes(1)
    );
    expect(jest.mocked(checkUsernameAvailable)).toHaveBeenCalledWith("ValidName2");
  });
});

// ─── Save button state ────────────────────────────────────────────────────────

describe("EditUsernameModal — Save button", () => {
  it("is disabled when value equals currentUsername", () => {
    renderModal();
    expect(
      screen.getByTestId("btn-save").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("is disabled when input is too short", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ab");
    expect(
      screen.getByTestId("btn-save").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("is disabled when username is taken", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(false);
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "TakenName1");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() => screen.getByTestId("validation-message"));
    expect(
      screen.getByTestId("btn-save").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("is disabled while availability is still checking", () => {
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");
    // Debounce hasn't fired yet — status is "checking".
    expect(
      screen.getByTestId("btn-save").props.accessibilityState?.disabled
    ).toBe(true);
  });

  it("is enabled when username is valid and available", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    renderModal();
    fireEvent.changeText(screen.getByTestId("input-username"), "ValidName1");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-save").props.accessibilityState?.disabled
      ).toBe(false)
    );
  });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

describe("EditUsernameModal — Cancel", () => {
  it("calls onClose when Cancel button is pressed", () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.press(screen.getByTestId("btn-cancel"));
    // onClose is called after animate-out; fire fake timers.
    act(() => { jest.runAllTimers(); });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the X button is pressed", () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.press(screen.getByTestId("btn-close-modal"));
    act(() => { jest.runAllTimers(); });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is pressed", () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.press(screen.getByTestId("backdrop-press"));
    act(() => { jest.runAllTimers(); });
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── Save flow ────────────────────────────────────────────────────────────────

describe("EditUsernameModal — Save flow", () => {
  async function setupAvailableUsername(username = "NewPlayer1") {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    renderModal({ onSave, onClose });
    fireEvent.changeText(screen.getByTestId("input-username"), username);
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-save").props.accessibilityState?.disabled
      ).toBe(false)
    );
    return { onSave, onClose };
  }

  it("calls onSave with the trimmed new username", async () => {
    const { onSave } = await setupAvailableUsername("NewPlayer1");
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save"));
    });
    expect(onSave).toHaveBeenCalledWith("NewPlayer1");
  });

  it("shows a saving spinner while onSave is pending", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    let resolve!: () => void;
    const onSave = jest.fn(
      () => new Promise<void>((res) => { resolve = res; })
    );
    renderModal({ onSave });
    fireEvent.changeText(screen.getByTestId("input-username"), "NewPlayer1");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-save").props.accessibilityState?.disabled
      ).toBe(false)
    );

    act(() => { fireEvent.press(screen.getByTestId("btn-save")); });
    await waitFor(() =>
      expect(screen.getByTestId("save-spinner")).toBeTruthy()
    );

    // Resolve to clean up.
    await act(async () => { resolve(); });
  });

  it("calls onClose after a successful save", async () => {
    const { onClose } = await setupAvailableUsername();
    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save"));
    });
    act(() => { jest.runAllTimers(); });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error message when onSave throws", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    const onSave = jest.fn().mockRejectedValue(new Error("Username already taken"));
    renderModal({ onSave });
    fireEvent.changeText(screen.getByTestId("input-username"), "NewPlayer1");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-save").props.accessibilityState?.disabled
      ).toBe(false)
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-error")).toBeTruthy();
      expect(screen.getByText("Username already taken")).toBeTruthy();
    });
  });

  it("does not close the modal when onSave throws", async () => {
    jest.mocked(checkUsernameAvailable).mockResolvedValue(true);
    const onSave = jest.fn().mockRejectedValue(new Error("Error"));
    const onClose = jest.fn();
    renderModal({ onSave, onClose });
    fireEvent.changeText(screen.getByTestId("input-username"), "NewPlayer1");
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() =>
      expect(
        screen.getByTestId("btn-save").props.accessibilityState?.disabled
      ).toBe(false)
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("btn-save"));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
