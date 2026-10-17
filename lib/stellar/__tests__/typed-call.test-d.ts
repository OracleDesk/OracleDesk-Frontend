import { expectTypeOf, test } from "vitest";
import type { MarketCoreClient, RegistryClient, Value } from "../typed-call";
import type { Market, Outcome, Position } from "../generated/market-core";

type MC = MarketCoreClient;
type RR = RegistryClient;

test("binding method return types are inferred correctly and unwrapped", () => {
  // Pin return types of binding methods the app uses
  expectTypeOf<Value<MC, "market_count">>().toEqualTypeOf<bigint>();
  expectTypeOf<Value<MC, "get_market">>().toEqualTypeOf<Market>();
  expectTypeOf<Value<MC, "get_position">>().toEqualTypeOf<Position>();
  expectTypeOf<Value<MC, "quote_buy">>().toEqualTypeOf<bigint>();
  expectTypeOf<Value<MC, "buy">>().toEqualTypeOf<bigint>();
  expectTypeOf<Value<MC, "sell">>().toEqualTypeOf<bigint>();
  expectTypeOf<Value<MC, "redeem">>().toEqualTypeOf<bigint>();
  expectTypeOf<Value<MC, "get_price">>().toEqualTypeOf<number>();
  expectTypeOf<Value<RR, "get_trace">>().toMatchTypeOf<{
    trace_hash: Uint8Array;
    ipfs_cid: string;
    market_id: bigint;
    agent: string;
    action: string;
    published_at: bigint;
  }>();

  // Guard tests: ensure inference has not collapsed to any (e.g. from broken @ts-nocheck)
  expectTypeOf<Value<MC, "market_count">>().not.toBeAny();
  expectTypeOf<Value<MC, "get_market">>().not.toBeAny();
  expectTypeOf<Value<MC, "get_position">>().not.toBeAny();
  expectTypeOf<Value<MC, "quote_buy">>().not.toBeAny();
  expectTypeOf<Value<MC, "buy">>().not.toBeAny();
  expectTypeOf<Value<MC, "sell">>().not.toBeAny();
  expectTypeOf<Value<MC, "redeem">>().not.toBeAny();
  expectTypeOf<Value<MC, "get_price">>().not.toBeAny();
  expectTypeOf<Value<RR, "get_trace">>().not.toBeAny();
});

test("write transaction argument shapes are pinned", () => {
  // Pin argument shapes for write calls
  expectTypeOf<Parameters<MC["buy"]>[0]>().toEqualTypeOf<{
    trader: string;
    market_id: bigint;
    outcome: Outcome;
    collateral_in: bigint;
    min_shares_out: bigint;
  }>();

  expectTypeOf<Parameters<MC["sell"]>[0]>().toEqualTypeOf<{
    trader: string;
    market_id: bigint;
    outcome: Outcome;
    collateral_out: bigint;
    max_shares_in: bigint;
  }>();

  expectTypeOf<Parameters<MC["redeem"]>[0]>().toEqualTypeOf<{
    holder: string;
    market_id: bigint;
  }>();
});
