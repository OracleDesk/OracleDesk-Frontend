import { apiClient, clearAuthSession, getStoredSessionWallet, getStoredToken, storeAuthSession } from "./client";

export interface AuthSession {
  token: string;
  userId: string;
  walletAddress: string;
}

export interface AuthChallenge {
  /** Base64 transaction envelope to sign with the wallet (never submitted). */
  transaction: string;
  networkPassphrase: string;
  expiresAt: string;
}

export async function requestChallenge(address: string) {
  const { data } = await apiClient.post<AuthChallenge>("/auth/challenge", { address });
  return data;
}

export async function verifyChallenge(address: string, signed: string) {
  const { data } = await apiClient.post<AuthSession>("/auth/verify", { address, signed });
  storeAuthSession(data);
  return data;
}

/**
 * SEP-10 style login: the backend issues a challenge transaction, the wallet
 * signs it (signTransaction works in every Stellar wallet), the backend
 * verifies the signature and returns a JWT.
 */
export async function signInWithWallet(
  address: string,
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>,
): Promise<AuthSession> {
  const challenge = await requestChallenge(address);
  const signed = await signTransaction(challenge.transaction, challenge.networkPassphrase);
  return verifyChallenge(address, signed);
}

import { type xdr } from "@stellar/stellar-sdk";

/**
 * Proposed SEP-45 style contract-account login:
 * Issues a contract auth challenge, signs the authorization entry,
 * and verifies it on the backend.
 * Until the backend ships contract-account auth, this surfaces a clear message.
 */
export async function signInWithContractAccount(
  address: string,
  signAuthEntry: (entry: xdr.SorobanAuthorizationEntry, validUntilLedger: number) => Promise<xdr.SorobanAuthorizationEntry>,
): Promise<AuthSession> {
  try {
    const { data: challenge } = await apiClient.post<{ entryXdr?: string; validUntilLedger?: number }>(
      "/auth/challenge",
      { address },
    );
    if (!challenge?.entryXdr) {
      throw new Error("Contract account login is not yet supported by the backend.");
    }
    const entry = (challenge as any).entryXdr;
    const signedEntry = await signAuthEntry(entry, challenge.validUntilLedger ?? 0);
    const { data: session } = await apiClient.post<AuthSession>("/auth/verify", {
      address,
      signed: signedEntry.toXDR("base64"),
    });
    storeAuthSession(session);
    return session;
  } catch {
    throw new Error("Not available for passkey wallets yet.");
  }
}

export { clearAuthSession, getStoredSessionWallet, getStoredToken };
