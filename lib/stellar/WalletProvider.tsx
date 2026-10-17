"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearAuthSession, getStoredSessionWallet, signInWithWallet, signInWithContractAccount } from "@/lib/api/auth";
import { EXPERIMENTAL_PASSKEYS, NETWORK_PASSPHRASE } from "./config";
import { describeError } from "./errors";
import {
  clearStoredPasskeyWallet,
  connectPasskeyWallet,
  createPasskeyWallet,
  getStoredPasskeyWallet,
  passkeySigner,
  type StoredPasskeyWallet,
} from "./passkey";
import type { Signer } from "./clients";

type Kit = typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit;

export interface WalletContextValue {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isPasskey: boolean;
  /** Passphrase the wallet reports, or null before it has said. */
  walletNetworkPassphrase: string | null;
  isWrongNetwork: boolean;
  /** Signs as the connected account; null when disconnected. */
  signer: Signer | null;
  /** True when the backend session (JWT) belongs to the connected address. */
  isAuthenticated: boolean;
  /** Last connect/sign-in error, in plain language. */
  error: string | null;
  openModal: () => Promise<void>;
  /** Connect an existing passkey smart-wallet (experimental). */
  connectPasskey?: () => Promise<void>;
  /** Create and deploy a new passkey smart-wallet (experimental). */
  createPasskey?: (opts: { name: string }) => Promise<void>;
  /** Runs the backend challenge login if there's no session for this address. */
  ensureSession: () => Promise<boolean>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 1000 * 60 * 2, refetchOnWindowFocus: false } },
      }),
  );

  const [kit, setKit] = useState<Kit | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [passkeyWallet, setPasskeyWallet] = useState<StoredPasskeyWallet | null>(null);
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The kit reads localStorage when its module is evaluated, which breaks
  // server rendering, so it's only imported in the browser.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe: Array<() => void> = [];
    (async () => {
      // Check stored passkey wallet first if experimental flag is active
      if (EXPERIMENTAL_PASSKEYS) {
        const storedPasskey = getStoredPasskeyWallet();
        if (storedPasskey) {
          setPasskeyWallet(storedPasskey);
          setAddress(storedPasskey.address);
          setWalletNetworkPassphrase(NETWORK_PASSPHRASE);
        }
      }

      const [{ StellarWalletsKit, KitEventType, Networks }, { defaultModules }] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit"),
        import("@creit.tech/stellar-wallets-kit/modules/utils"),
      ]);
      if (cancelled) return;
      StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
      setKit(() => StellarWalletsKit);

      unsubscribe.push(
        StellarWalletsKit.on(KitEventType.STATE_UPDATED, ({ payload }) => {
          const next = payload.address ?? null;
          // A backend session for a different wallet is never reused.
          const stored = getStoredSessionWallet();
          if (stored && next && stored !== next) {
            clearAuthSession();
            setSessionWallet(null);
          }
          setAddress(next);
          setPasskeyWallet(null);
          setWalletNetworkPassphrase(payload.networkPassphrase || null);
        }),
        StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
          setAddress(null);
          setPasskeyWallet(null);
          setWalletNetworkPassphrase(null);
          clearAuthSession();
          setSessionWallet(null);
        }),
      );

      // Restore a session the kit persisted. This is not a fresh connect,
      // so it never redirects and never prompts the wallet.
      try {
        const { address: restored } = await StellarWalletsKit.getAddress();
        if (!cancelled && restored && !getStoredPasskeyWallet()) setAddress(restored);
      } catch {
        // Nothing persisted.
      }
      if (!cancelled) setSessionWallet(getStoredSessionWallet());
    })();
    return () => {
      cancelled = true;
      unsubscribe.forEach((fn) => fn());
    };
  }, []);

  const signer = useMemo<Signer | null>(() => {
    if (!address) return null;
    if (address.startsWith("C") && passkeyWallet) {
      return passkeySigner(passkeyWallet);
    }
    if (!kit) return null;
    return {
      kind: "account",
      publicKey: address,
      signTransaction: (xdr, opts) =>
        kit.signTransaction(xdr, { networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE, address }),
    };
  }, [address, kit, passkeyWallet]);

  const signIn = useCallback(
    async (forAddress: string) => {
      if (forAddress.startsWith("C")) {
        if (!signer || signer.kind !== "contract") {
          throw new Error("Not available for passkey wallets yet.");
        }
        return signInWithContractAccount(forAddress, signer.signAuthEntry);
      }
      if (!kit) throw new Error("Wallet is still loading");
      const session = await signInWithWallet(forAddress, async (xdr, networkPassphrase) => {
        const { signedTxXdr } = await kit.signTransaction(xdr, { networkPassphrase, address: forAddress });
        return signedTxXdr;
      });
      setSessionWallet(session.walletAddress);
    },
    [kit, signer],
  );

  const ensureSession = useCallback(async () => {
    if (!address) return false;
    if (address.startsWith("C")) return false;
    if (sessionWallet === address) return true;
    try {
      setError(null);
      await signIn(address);
      return true;
    } catch (err) {
      setError(describeError(err).message);
      return false;
    }
  }, [address, sessionWallet, signIn]);

  const openModal = useCallback(async () => {
    if (!kit) return;
    setIsConnecting(true);
    setError(null);
    try {
      const { address: connected } = await kit.authModal();
      const stored = getStoredSessionWallet();
      if (stored && stored !== connected) {
        clearAuthSession();
        setSessionWallet(null);
      }
      setAddress(connected);
      setPasskeyWallet(null);
      try {
        const { networkPassphrase } = await kit.getNetwork();
        setWalletNetworkPassphrase(networkPassphrase);
      } catch {
        // Some wallets can't report their network; leave it unknown.
      }
      if (getStoredSessionWallet() !== connected) {
        try {
          await signIn(connected);
        } catch (err) {
          setError(describeError(err).message);
        }
      } else {
        setSessionWallet(connected);
      }
      router.push("/markets");
    } catch (err) {
      const described = describeError(err);
      if (described.kind !== "rejected" && !/closed/i.test(String((err as { message?: string })?.message))) {
        setError(described.message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [kit, router, signIn]);

  const connectPasskey = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await connectPasskeyWallet();
      const data: StoredPasskeyWallet = { address: res.address, credentialId: res.credentialId, network: NETWORK_PASSPHRASE };
      setPasskeyWallet(data);
      setAddress(res.address);
      setWalletNetworkPassphrase(NETWORK_PASSPHRASE);
      router.push("/markets");
    } catch (err) {
      const described = describeError(err, "marketCore", address ?? undefined);
      if (described.kind !== "rejected") setError(described.message);
    } finally {
      setIsConnecting(false);
    }
  }, [address, router]);

  const createPasskey = useCallback(
    async (opts: { name: string }) => {
      setIsConnecting(true);
      setError(null);
      try {
        const res = await createPasskeyWallet(opts);
        const data: StoredPasskeyWallet = { address: res.address, credentialId: res.credentialId, network: NETWORK_PASSPHRASE };
        setPasskeyWallet(data);
        setAddress(res.address);
        setWalletNetworkPassphrase(NETWORK_PASSPHRASE);
        router.push("/markets");
      } catch (err) {
        const described = describeError(err, "marketCore", address ?? undefined);
        if (described.kind !== "rejected") setError(described.message);
      } finally {
        setIsConnecting(false);
      }
    },
    [address, router],
  );

  const disconnect = useCallback(async () => {
    if (address?.startsWith("C")) {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Disconnect passkey wallet? This will remove the active passkey session in this browser.")
      ) {
        return;
      }
      clearStoredPasskeyWallet();
      setPasskeyWallet(null);
    } else {
      try {
        await kit?.disconnect();
      } catch {
        // Nothing to disconnect
      }
    }
    setAddress(null);
    setWalletNetworkPassphrase(null);
    clearAuthSession();
    setSessionWallet(null);
    queryClient.removeQueries({ queryKey: ["stellar"] });
  }, [address, kit, queryClient]);

  const isPasskey = Boolean(address?.startsWith("C"));

  const value: WalletContextValue = {
    address,
    isConnected: Boolean(address),
    isConnecting,
    isPasskey,
    walletNetworkPassphrase,
    isWrongNetwork: Boolean(walletNetworkPassphrase) && walletNetworkPassphrase !== NETWORK_PASSPHRASE && !isPasskey,
    signer,
    isAuthenticated: Boolean(address) && sessionWallet === address,
    error,
    openModal,
    ...(EXPERIMENTAL_PASSKEYS ? { connectPasskey, createPasskey } : {}),
    ensureSession,
    disconnect,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
    </QueryClientProvider>
  );
}
