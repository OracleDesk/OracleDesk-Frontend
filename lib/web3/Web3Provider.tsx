"use client";

import React, { createContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState, useAccountEffect, type Config } from "wagmi";
import { createAppKit } from '@reown/appkit/react'
import { clearAuthSession } from "@/lib/api/client";
import { connectWalletToBackend } from "@/lib/api/auth";
import { wagmiAdapter, projectId, networks } from "./wagmi.config";

// Setup metadata
const metadata = {
  name: 'OracleDesk',
  description: 'Institutional-Grade AI Prediction Terminal',
  url: 'https://oracledesk.com', // origin must match your domain & subdomain
  icons: ['https://assets.reown.com/reown-profile-pic.png']
}

// Create modal
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true
  }
})

interface Web3ModalContextValue {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const Web3ModalContext = createContext<Web3ModalContextValue | undefined>(
  undefined
);

const WalletConnectionRedirect = () => {
  const router = useRouter();

  useAccountEffect({
    onConnect({ address, isReconnected }) {
      connectWalletToBackend(address)
        .catch((error) => {
          console.error("Backend wallet auth failed", error);
        })
        .finally(() => {
          if (!isReconnected) {
            router.push("/markets");
          }
        });
    },
    onDisconnect() {
      clearAuthSession();
    },
  });

  return null;
};

export const Web3Provider = ({ 
  children, 
  cookies 
}: { 
  children: ReactNode, 
  cookies: string | null 
}) => {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  );

  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  );

  const openModal = () => {
    // This is now handled by AppKit hooks in components
  };
  const closeModal = () => {};

  return (
    <WagmiProvider 
      config={wagmiAdapter.wagmiConfig as Config} 
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>
        <WalletConnectionRedirect />
        <Web3ModalContext.Provider
          value={{ isModalOpen: false, openModal, closeModal }}
        >
          {children}
        </Web3ModalContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
