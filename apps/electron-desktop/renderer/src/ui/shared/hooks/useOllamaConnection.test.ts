// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOllamaConnection } from "./useOllamaConnection";

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOllamaConnection", () => {
  it("initializes with default values", () => {
    const { result } = renderHook(() => useOllamaConnection());
    expect(result.current.mode).toBe("local");
    expect(result.current.baseUrl).toBe("http://127.0.0.1:11434");
    expect(result.current.apiKey).toBe("");
    expect(result.current.connectionStatus).toBe("idle");
    expect(result.current.connectionError).toBe("");
  });

  it("accepts custom initial values", () => {
    const { result } = renderHook(() =>
      useOllamaConnection({ initialMode: "cloud", initialBaseUrl: "http://custom:1234" })
    );
    expect(result.current.mode).toBe("cloud");
    expect(result.current.baseUrl).toBe("http://custom:1234");
  });

  it("resets connectionStatus to idle when baseUrl changes", () => {
    const { result } = renderHook(() => useOllamaConnection());

    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    act(() => {
      result.current.setBaseUrl("http://new-url:1234");
    });
    expect(result.current.connectionStatus).toBe("idle");
  });

  it("sets status to ok on successful connection", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const { result } = renderHook(() => useOllamaConnection());

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.connectionStatus).toBe("ok");
    expect(result.current.connectionError).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ headers: {} })
    );
  });

  it("sets status to error on HTTP failure", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    const { result } = renderHook(() => useOllamaConnection());

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.connectionStatus).toBe("error");
    expect(result.current.connectionError).toBe("HTTP 503");
  });

  it("sets Connection timed out on abort error", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
    const { result } = renderHook(() => useOllamaConnection());

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.connectionStatus).toBe("error");
    expect(result.current.connectionError).toBe("Connection timed out");
  });

  it("sets error message on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useOllamaConnection());

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.connectionStatus).toBe("error");
    expect(result.current.connectionError).toBe("Failed to fetch");
  });

  it("sends Authorization header in cloud mode", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const { result } = renderHook(() =>
      useOllamaConnection({ initialMode: "cloud" })
    );

    act(() => {
      result.current.setApiKey("my-key");
    });

    await act(async () => {
      await result.current.testConnection();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({
        headers: { Authorization: "Bearer my-key" },
      })
    );
  });

  it("does not send Authorization header in local mode", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const { result } = renderHook(() => useOllamaConnection());

    act(() => {
      result.current.setApiKey("some-key");
    });

    await act(async () => {
      await result.current.testConnection();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ headers: {} })
    );
  });

  it("calls onConnectionSuccess when connection succeeds", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useOllamaConnection({ onConnectionSuccess: onSuccess })
    );

    await act(async () => {
      await result.current.testConnection();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not call onConnectionSuccess on failure", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useOllamaConnection({ onConnectionSuccess: onSuccess })
    );

    await act(async () => {
      await result.current.testConnection();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("strips trailing slashes from baseUrl before fetching", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const { result } = renderHook(() =>
      useOllamaConnection({ initialBaseUrl: "http://host:1234///" })
    );

    await act(async () => {
      await result.current.testConnection();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://host:1234/api/tags",
      expect.anything()
    );
  });

  it("resetConnection clears status and error", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    const { result } = renderHook(() => useOllamaConnection());

    await act(async () => {
      await result.current.testConnection();
    });
    expect(result.current.connectionStatus).toBe("error");

    act(() => {
      result.current.resetConnection();
    });
    expect(result.current.connectionStatus).toBe("idle");
    expect(result.current.connectionError).toBe("");
  });
});
