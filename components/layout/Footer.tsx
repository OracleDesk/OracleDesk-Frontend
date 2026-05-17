import React from "react";

export const Footer = () => {
  return (
    <footer className="bg-surface-container-low border-t border-outline-variant mt-12">
      <div className="flex flex-col md:flex-row justify-between items-center w-full py-8 px-gutter max-w-container-max-width mx-auto gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-label-caps text-label-caps font-black text-on-surface-variant">
            ORACLEDESK INSTITUTIONAL
          </span>
          <p className="font-body-md text-body-md text-on-surface-variant opacity-60">
            © 2024 OracleDesk Institutional. All rights reserved.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          <a
            className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-label-caps text-label-caps"
            href="#"
          >
            System Status
          </a>
          <a
            className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-label-caps text-label-caps"
            href="#"
          >
            API Docs
          </a>
          <a
            className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-label-caps text-label-caps"
            href="#"
          >
            Legal
          </a>
          <a
            className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-label-caps text-label-caps"
            href="#"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </footer>
  );
};
