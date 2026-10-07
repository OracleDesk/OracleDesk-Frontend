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

export { clearAuthSession, getStoredSessionWallet, getStoredToken };
