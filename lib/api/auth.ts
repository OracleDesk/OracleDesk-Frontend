import { apiClient, clearAuthSession, getStoredToken, storeAuthSession } from "./client";

export interface AuthSession {
  token: string;
  userId: string;
  walletAddress: string;
}

export async function connectWalletToBackend(walletAddress: string) {
  const { data } = await apiClient.post<AuthSession>("/auth/connect", {
    walletAddress,
  });

  storeAuthSession(data);
  return data;
}

export { clearAuthSession, getStoredToken };
