import { describe, it, expect, vi } from "vitest";
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { findForming, greyToC } from "./nowcast";

const W = 190, H = 220;
const toGrey = (c: number) => Math.round(((40 - c) / 120) * 255);
function blob(img: Uint8Array, x0: number, y0: number, size: number, grey: number) {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) img[y * W + x] = grey;
}

describe("storm formation from infrared", () => {
  it("finds a cloud top that turned cold fast, and ignores one that was already cold", () => {
    const before = new Uint8Array(W * H).fill(toGrey(30)), now = new Uint8Array(W * H).fill(toGrey(30));
    blob(before, 50, 50, 4, toGrey(0)); blob(now, 50, 50, 4, toGrey(-45));      // forming: 0 → −45 °C
    blob(before, 120, 120, 4, toGrey(-50)); blob(now, 120, 120, 4, toGrey(-52)); // mature, barely changing
    const cells = findForming(now, before);
    expect(cells).toHaveLength(1);
    expect(cells[0].strong).toBe(true);
    expect(cells[0].minTopC).toBeLessThanOrEqual(-44);
    expect(cells[0].coolingPer15).toBeLessThanOrEqual(-20);
  });

  it("drops tiny specks", () => {
    const before = new Uint8Array(W * H).fill(toGrey(30)), now = new Uint8Array(W * H).fill(toGrey(30));
    blob(now, 10, 10, 2, toGrey(-40));
    expect(findForming(now, before)).toHaveLength(0);
    expect(Math.round(greyToC(255))).toBe(-80);
  });
});
