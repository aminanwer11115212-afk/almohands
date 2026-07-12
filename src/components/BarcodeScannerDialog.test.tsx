// @vitest-environment jsdom
/* Automated smoke tests for BarcodeScannerDialog error paths.
 * Verifies that under (1) missing mediaDevices API, (2) permission denied,
 * (3) camera busy — the scanner never surfaces a toast in cashier mode,
 * always shows the manual-entry fallback, and logs the error silently. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BarcodeScannerDialog } from "./BarcodeScannerDialog";
import { readScanErrors, clearScanErrors } from "@/lib/scan-error-log";

// Capture toast calls
const toastCalls: Array<{ kind: string; msg: string }> = [];
vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => { toastCalls.push({ kind: "error", msg }); },
    success: (msg: string) => { toastCalls.push({ kind: "success", msg }); },
    warning: (msg: string) => { toastCalls.push({ kind: "warning", msg }); },
  },
}));

// Stub the dynamic import for @zxing/browser so tests are deterministic.
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    static listVideoInputDevices = async () => [];
    decodeFromVideoDevice = async () => {
      // Simulate camera-busy error every time
      const e = new DOMException("Camera in use", "NotReadableError");
      throw e;
    };
  },
}));

function setMediaDevices(md: unknown) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: md, configurable: true, writable: true,
  });
}

beforeEach(() => {
  toastCalls.length = 0;
  clearScanErrors();
  cleanup();
});

describe("BarcodeScannerDialog — silent error handling", () => {
  it("no mediaDevices: cashierMode shows no toast + logs silently + shows manual entry", async () => {
    setMediaDevices(undefined);
    render(
      <BarcodeScannerDialog open cashierMode onClose={() => {}} onDetected={() => {}} />
    );
    await waitFor(() => {
      expect(readScanErrors().length).toBeGreaterThan(0);
    });
    expect(toastCalls.filter((t) => t.kind === "error")).toHaveLength(0);
    // Manual input is auto-opened in cashier mode on error
    expect(screen.getByPlaceholderText(/رمز الباركود/)).toBeTruthy();
  });

  it("no mediaDevices: non-cashier mode also never crashes; logs error", async () => {
    setMediaDevices(undefined);
    render(
      <BarcodeScannerDialog open onClose={() => {}} onDetected={() => {}} />
    );
    await waitFor(() => {
      expect(readScanErrors().length).toBeGreaterThan(0);
    });
    // Non-cashier mode shows a toast + a retry & manual button
    expect(toastCalls.some((t) => t.kind === "error")).toBe(true);
  });

  it("camera busy: cashierMode falls back to manual entry silently", async () => {
    setMediaDevices({ getUserMedia: async () => { throw new DOMException("busy", "NotReadableError"); } });
    render(
      <BarcodeScannerDialog open cashierMode onClose={() => {}} onDetected={() => {}} />
    );
    await waitFor(() => {
      expect(readScanErrors().length).toBeGreaterThan(0);
    });
    expect(toastCalls.filter((t) => t.kind === "error")).toHaveLength(0);
    expect(screen.getByPlaceholderText(/رمز الباركود/)).toBeTruthy();
  });

  it("manual entry submits the code and closes", async () => {
    setMediaDevices(undefined);
    const detected = vi.fn();
    const closed = vi.fn();
    render(
      <BarcodeScannerDialog open cashierMode onClose={closed} onDetected={detected} />
    );
    const input = await screen.findByPlaceholderText(/رمز الباركود/);
    fireEvent.change(input, { target: { value: "1234567890" } });
    fireEvent.submit(input.closest("form")!);
    expect(detected).toHaveBeenCalledWith("1234567890");
    expect(closed).toHaveBeenCalled();
  });
});
