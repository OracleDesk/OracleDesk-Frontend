"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/lib/contexts/WalletContext";

const providers = [
  {
    name: "MetaMask",
    icon: "https://lh3.googleusercontent.com/aida-public/AB6AXuBgKhEWO9KG5QawzkKfU6Yyp8jxTcMFTiwB9NbtZIROODG4um_ZXT3kvTX1pkZTVv_GjM7L3FkJo5xACAu4UZRH6EM8podjrFqPHHOKbvRW2rsFhepcSY7nw_N7ekrktGLdM_MYlHorg0FoO5-7x1pjXcdYK4trQ3OygAMxA6F9L2cmnQoy5PQBG5VqIYTqrTKKJvNWt-dJeZ7tkVk8acOxfspPeF-oGmLyf7_wgpP56Ju57A1Hy5gSQunkOQlgeyzGh10QAb-N-w",
    label: "Popular"
  },
  {
    name: "Coinbase Wallet",
    icon: "https://lh3.googleusercontent.com/aida-public/AB6AXuBxTiv88qGMrdPx5E1gIn8QNqFLU8oN-kqXgatt_QK41zP2CwYpqGJZwYyEukinjCOJskNXJX09Z9WASTJt4ci-mZOKNGZEqTlUQDkiEDQ5xC6tVwOgm0HjgjpyPFTsyuLpVnDw08b_3WZIbz1l70ZVUXxExjB-ftxgMbvNOQhPH3iBzCm_i5byoZupi1XLBag0CPLbd_jmULQoG0if1Ix9nUQoMJkIsgFyRoH-X2bew5qNmsZe4bPHTbnjW_PGXUb_-Udke7RItA",
  },
  {
    name: "WalletConnect",
    icon: "https://lh3.googleusercontent.com/aida-public/AB6AXuCVOm0fEu-R4zP6DaWX0Max8XFbMLpw-xjvhh2BQqEpxpKoyj2k1uHzE1XHtPStk8Duf7uYW6KccOd50Vcm6sh0aHzTrvWues_dr73Eb6ECezWJGj0YgAC0czn1K0F6jJKg8n3OzyPL-Kkje_8dqcmzSQzRbrL13S-8OootFIl3AedFKqXJBb-CRAYtjc8NsdM5MYWZlgbqLGjYzNq_KeA3krdX2bbRo3CCHkz8yaIRkGdfEewH3IXQtKDhiVtbmhPdptVLT_LuZA",
  },
  {
    name: "Phantom",
    icon: "https://lh3.googleusercontent.com/aida-public/AB6AXuA3iG8knl-fb14ckcOhnS3D2xFqGixbaPK_hXxjfiE4_sckfW7BSVLvU7gFpxj8YHzIRXMuYskSv2Mc6a9UD0beRd-RxNRwkNpbvIE7igkRWWDHbS4eiYqBQgrDAsk4w0OkkQxNkIMPSHz1K4th8cjEqSvaRouUJrdW0L6SS4PAo2PCQQ16pCmegF_i5hCyl83toi10g7O8rjWUFeOQVjaRuovA7XizRmcbj73wQakd6nk04lBsB44WzWaN8gU38u3YsW8H_kNVWQ",
  }
];

export const ConnectWalletModal = () => {
  const { isModalOpen, closeModal, connect } = useWallet();

  return (
    <AnimatePresence>
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-gutter">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-on-background/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white w-full max-w-[440px] rounded-xl border border-outline shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between border-b border-outline-variant">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Connect Wallet</h2>
              <button 
                className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                onClick={closeModal}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                Connect your wallet to start trading and access institutional-grade prediction data.
              </p>

              {/* Providers List */}
              <div className="space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => connect(provider.name)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-outline-variant bg-surface hover:border-primary hover:bg-surface-container-low transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white border border-outline-variant flex items-center justify-center overflow-hidden p-2">
                        <img 
                          alt={provider.name} 
                          className="w-full h-full object-contain" 
                          src={provider.icon} 
                        />
                      </div>
                      <span className="font-body-lg text-body-lg font-semibold text-on-surface group-hover:text-primary transition-colors">
                        {provider.name}
                      </span>
                    </div>
                    {provider.label && (
                      <span className="font-label-caps text-label-caps text-outline-variant group-hover:text-primary transition-colors text-[10px]">
                        {provider.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Footer / Help */}
              <div className="mt-6 pt-6 border-t border-outline-variant flex flex-col items-center gap-4">
                <p className="font-body-md text-body-md text-on-surface-variant text-center">
                  New to crypto wallets?{" "}
                  <a className="text-primary font-semibold hover:underline" href="#">
                    Learn more
                  </a>
                </p>
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-container-low rounded-full">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span className="font-label-caps text-label-caps text-on-surface-variant text-[10px]">
                    Secure Connection
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
