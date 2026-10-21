"use client";

import { useWalletAddress, useWalletNetwork } from "@/lib/contexts/WalletContext";
import { useClaimPoolRemainder, type OnChainMarketView } from "@/lib/hooks/useStellar";
import { isWalletCreator, lpView, type LpSeed } from "@/lib/stellar/lp";
import { formatUsdc, bpsToPercent } from "@/lib/stellar/units";
import { explorerAccount, explorerTx } from "@/lib/stellar/config";
import { UserFacingError } from "@/lib/stellar/errors";

export function CreatorPanel({ view, seed }: { view: OnChainMarketView; seed?: LpSeed }) {
  const { address } = useWalletAddress();
  const { isWrongNetwork, rpcNetwork } = useWalletNetwork();
  const claim = useClaimPoolRemainder();
  if (!isWalletCreator(view.market, address) || isWrongNetwork || rpcNetwork?.status === "mismatch") return null;
  const lp = lpView(view.market, seed);
  const claimed = lp.claimed || claim.isSuccess;
  const code = claim.error instanceof UserFacingError ? claim.error.described.code : undefined;
  const error = code === "AlreadyClaimed" ? "This pool has already been claimed." : code === "NotFinal" ? "Available after the market resolves or is voided." : claim.error?.message;
  const onClaim = async () => { try { await claim.mutateAsync({ marketId: view.id }); } catch { /* shown below */ } };
  return (
    <section aria-label="Your market liquidity" className="rounded-lg border border-outline-variant bg-surface-container-low p-4 text-sm space-y-3">
      <h2 className="font-bold">Your market liquidity <span className="text-xs font-normal text-on-surface-variant">chain</span></h2>
      {lp.seed && <div>
        <p>Seed: {formatUsdc(lp.seed.amount)} USDC at {bpsToPercent(lp.seed.initialYesBps)} YES</p>
        <p className="text-on-surface-variant">Seed shares added to your position: {formatUsdc(lp.seed.creatorYes)} YES · {formatUsdc(lp.seed.creatorNo)} NO</p>
      </div>}
      <p>Pool now: {formatUsdc(lp.poolYes)} YES · {formatUsdc(lp.poolNo)} NO</p>
      <p>{lp.isFinal ? "Pool settlement value" : "Estimated pool value"}: {formatUsdc(lp.poolValue)} USDC</p>
      {!lp.isFinal && <p className="text-xs text-on-surface-variant">Estimate if the market settled at today&apos;s price; the final value depends on the outcome.</p>}
      <div>
        <p>Fees accrued: {formatUsdc(lp.feesAccrued)} USDC</p>
        <p className="text-xs text-on-surface-variant">Sent to the OracleDesk treasury, not to you. Fees are excluded from your pool claim.</p>
      </div>
      {claimed ? <p role="status">Claimed. <a href={explorerAccount(view.market.creator)} target="_blank" rel="noopener noreferrer" className="underline">Account history</a></p> : <>
        {lp.claimable !== null && <p>Claimable now: {formatUsdc(lp.claimable)} USDC</p>}
        {lp.claimable === 0n && <p className="text-xs text-on-surface-variant">0 USDC: claiming only marks the pool as settled.</p>}
        <button type="button" disabled={!lp.isFinal || claim.isPending} onClick={() => void onClaim()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">
          {claim.isPending ? "Claiming…" : "Claim pool remainder"}
        </button>
        {!lp.isFinal && <p className="text-xs text-on-surface-variant">Available after the market resolves or is voided.</p>}
      </>}
      {claim.isPending && <p role="status">{claim.phase.name === "awaiting-signature" ? "Asking your wallet to sign…" : "Waiting for the network…"}</p>}
      {error && <p role="alert" className="text-error">{error}</p>}
      {claim.data && <p role="status">Received {formatUsdc(claim.data.payout)} USDC. <a href={explorerTx(claim.data.txHash)} target="_blank" rel="noopener noreferrer" className="underline">View transaction</a></p>}
      <p className="text-xs text-on-surface-variant">Seed shares are part of your ordinary position. Redeem those separately; this action only claims the pool remainder.</p>
    </section>
  );
}
