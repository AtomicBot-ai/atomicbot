// @vitest-environment jsdom
/**
 * Tests for ChatMessageList — specifically the history-loading branch
 * that renders a centered spinner while the session history RPC is in flight.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChatMessageList } from "./ChatMessageList";

afterEach(cleanup);

function makeScrollRef() {
  return React.createRef<HTMLDivElement>();
}

const baseProps = {
  displayMessages: [],
  streamByRun: {},
  liveToolCalls: [],
  optimisticFirstMessage: null,
  optimisticFirstAttachments: null,
  matchingFirstUserFromHistory: null,
  waitingForFirstResponse: false,
  markdownComponents: {},
} as const;

describe("ChatMessageList history loader", () => {
  it("shows the loader when loadingHistory is true and there are no messages", () => {
    render(
      <ChatMessageList
        {...baseProps}
        loadingHistory
        scrollRef={makeScrollRef()}
      />
    );
    expect(screen.getByTestId("chat-history-loader")).not.toBeNull();
  });

  it("hides the loader once messages are present", () => {
    render(
      <ChatMessageList
        {...baseProps}
        loadingHistory
        displayMessages={[{ id: "1", role: "user", text: "hi" }]}
        scrollRef={makeScrollRef()}
      />
    );
    expect(screen.queryByTestId("chat-history-loader")).toBeNull();
  });

  it("does not show the loader when loadingHistory is false", () => {
    render(<ChatMessageList {...baseProps} scrollRef={makeScrollRef()} />);
    expect(screen.queryByTestId("chat-history-loader")).toBeNull();
  });

  it("does not show the loader when an optimistic first message is being displayed", () => {
    render(
      <ChatMessageList
        {...baseProps}
        loadingHistory
        optimisticFirstMessage="hello"
        scrollRef={makeScrollRef()}
      />
    );
    expect(screen.queryByTestId("chat-history-loader")).toBeNull();
  });

  it("does not show the loader while a live stream or typing indicator is active", () => {
    render(
      <ChatMessageList
        {...baseProps}
        loadingHistory
        waitingForFirstResponse
        scrollRef={makeScrollRef()}
      />
    );
    expect(screen.queryByTestId("chat-history-loader")).toBeNull();
  });
});
