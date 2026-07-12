/* Unit tests for the barcode scanner status classifier.
 * Ensures every DOMException name we care about maps to the correct
 * Arabic label so the UI and diagnostics page stay in sync. */

import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyScannerError, reasonLabel, reasonDetail,
  recordScannerStatus, readLastScannerStatus,
} from "../src/lib/scanner-status";

// jsdom provides localStorage
beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

describe("classifyScannerError", () => {
  const cases: Array<[string, string]> = [
    ["NotAllowedError",   "denied"],
    ["SecurityError",     "denied"],
    ["NotFoundError",     "not_found"],
    ["OverconstrainedError", "not_found"],
    ["NotReadableError",  "busy"],
    ["TrackStartError",   "busy"],
    ["AbortError",        "aborted"],
    ["NotSupportedError", "no_api"],
    ["WeirdError",        "unknown"],
  ];
  it.each(cases)("maps %s → %s", (name, expected) => {
    expect(classifyScannerError({ name })).toBe(expected);
  });

  it("labels are non-empty Arabic strings", () => {
    for (const [, r] of cases) {
      expect(reasonLabel(r as never).length).toBeGreaterThan(0);
      expect(reasonDetail(r as never).length).toBeGreaterThan(0);
    }
  });
});

describe("recordScannerStatus", () => {
  it("persists last status to localStorage and reads back", () => {
    const s = recordScannerStatus("busy", { tag: "products.new" });
    expect(s.reason).toBe("busy");
    const back = readLastScannerStatus();
    expect(back?.reason).toBe("busy");
    expect(back?.label).toBe("مشغولة");
    expect(back?.context?.tag).toBe("products.new");
  });

  it("overwrites previous entry", () => {
    recordScannerStatus("denied");
    recordScannerStatus("scanning");
    expect(readLastScannerStatus()?.reason).toBe("scanning");
  });
});
