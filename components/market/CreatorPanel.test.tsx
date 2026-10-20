import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorPanel } from "./CreatorPanel";
import { creator, makeLpMarket } from "@/lib/stellar/__tests__/fixtures/lp-market";
import { CONTRACTS } from "@/lib/stellar/config";

const mocks = vi.hoisted(() => ({ address: "", wrong: false, claim: vi.fn() }));
vi.mock("@/lib/contexts/WalletContext", () => ({ useWalletAddress: () => ({ address: mocks.address }), useWalletNetwork: () => ({ isWrongNetwork: mocks.wrong, rpcNetwork: { status: "ok" } }) }));
vi.mock("@/lib/hooks/useStellar", () => ({ useClaimPoolRemainder: () => ({ mutateAsync: mocks.claim, isPending: false, isSuccess: false, phase: { name: "building" }, data: null, error: null }) }));
const view = (market = makeLpMarket()) => ({ id: "7", market, yesBps: 5000, ledger: 100 });
beforeEach(() => { mocks.address = creator; mocks.wrong = false; mocks.claim.mockReset().mockResolvedValue({}); });
describe("creator panel", () => {
  it("hides for another creator and for treasury-created markets", () => {
    const rendered = render(<CreatorPanel view={view(makeLpMarket({ creator: CONTRACTS.treasury }))} />);
    expect(screen.queryByRole("region", { name: "Your market liquidity" })).toBeNull();
    mocks.address = CONTRACTS.treasury; rendered.rerender(<CreatorPanel view={view(makeLpMarket({ creator: CONTRACTS.treasury }))} />);
    expect(screen.queryByText(/Your market liquidity/)).toBeNull();
  });
  it("hides on the wrong network", () => {
    mocks.wrong = true; render(<CreatorPanel view={view()} />); expect(screen.queryByText(/Your market liquidity/)).toBeNull();
  });
  it("labels the open pool estimate and treasury fees and disables claiming", () => {
    render(<CreatorPanel view={view()} />);
    expect(screen.getByText(/Estimated pool value/)).toBeTruthy(); expect(screen.getByText(/treasury, not to you/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Claim pool remainder" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("allows a zero-value claim after finality", () => {
    render(<CreatorPanel view={view(makeLpMarket({ reserve_yes: 0n, reserve_no: 0n, status: { tag: "Void", values: undefined } }))} />);
    expect(screen.getByText(/claiming only marks the pool as settled/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Claim pool remainder" }); expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button); expect(mocks.claim).toHaveBeenCalledWith({ marketId: "7" });
  });
  it("shows claimed history without offering a second claim", () => {
    render(<CreatorPanel view={view(makeLpMarket({ lp_claimed: true, status: { tag: "Void", values: undefined } }))} />);
    expect(screen.getByRole("link", { name: "Account history" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Claim pool remainder" })).toBeNull();
  });
});
