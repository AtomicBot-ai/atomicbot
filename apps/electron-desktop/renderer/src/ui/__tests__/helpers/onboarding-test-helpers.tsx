import React from "react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { expect } from "vitest";
import { chatReducer } from "../../../store/slices/chatSlice";
import { configReducer } from "../../../store/slices/configSlice";
import { gatewayReducer } from "../../../store/slices/gatewaySlice";
import { onboardingReducer } from "../../../store/slices/onboardingSlice";

/** Create a fresh Redux store for onboarding tests. */
export function createTestStore() {
  return configureStore({
    reducer: {
      chat: chatReducer,
      config: configReducer,
      gateway: gatewayReducer,
      onboarding: onboardingReducer,
    },
  });
}

/** Wraps a component with Redux Provider + MemoryRouter. */
export function TestShell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={createTestStore()}>
      <MemoryRouter>{children}</MemoryRouter>
    </Provider>
  );
}

/** No-op callback for props that require a function. */
export const noop = () => {};

/** Async no-op that resolves to false. */
export const noopAsync = () => Promise.resolve(false);

/** Assert the component rendered non-empty content with at least one styled element. */
export function expectRendered(container: HTMLElement) {
  expect(container.innerHTML.length).toBeGreaterThan(0);
  expect(container.querySelector("[class]")).toBeTruthy();
}
