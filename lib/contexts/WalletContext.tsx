"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  isModalOpen: boolean;
  connect: (provider?: string) => void;
  disconnect: () => void;
  openModal: () => void;
  closeModal: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const connect = (provider: string = "MetaMask") => {
    setIsConnected(true);
    // Simulate different addresses for different providers if needed
    setAddress("0x71C...4f92");
    setIsModalOpen(false);
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <WalletContext.Provider 
      value={{ 
        isConnected, 
        address, 
        isModalOpen, 
        connect, 
        disconnect, 
        openModal, 
        closeModal 
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
