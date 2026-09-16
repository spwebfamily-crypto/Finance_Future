import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function Probe() {
  const { preference, theme, setPreference } = useTheme();
  return <><output aria-label="theme">{`${preference}:${theme}`}</output><button onClick={() => setPreference("dark")}>dark</button></>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("uses system by default and persists an explicit preference", async () => {
    const listener = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: listener, removeEventListener: listener }));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByLabelText("theme")).toHaveTextContent("system:light");
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(localStorage.getItem("expensesnap.theme")).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#12130f");
  });

  it("reacts to a system colour-scheme change while preference is system", async () => {
    let change: (() => void) | undefined;
    const media = { matches: false, addEventListener: (_: string, callback: () => void) => { change = callback; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    media.matches = true;
    change?.();
    await waitFor(() => expect(screen.getByLabelText("theme")).toHaveTextContent("system:dark"));
  });
});
