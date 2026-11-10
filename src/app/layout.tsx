import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { SandboxBadge } from "@/components/ui";

export const metadata = { title: "ResolvePay AI", description: "Evidence-first payment resolution for small merchants (PayPal Sandbox demo)" };

export default function RootLayout({ children }: { children: ReactNode }) {
  const link = "text-sm text-slate-600 hover:text-slate-900";
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold">ResolvePay AI</Link>
            <nav className="flex gap-5">
              <Link href="/" className={link}>Dashboard</Link>
              <Link href="/transactions" className={link}>Transactions</Link>
              <Link href="/cases" className={link}>Cases</Link>
              <Link href="/cases/new" className={link}>New complaint</Link>
              <Link href="/audit" className={link}>Audit</Link>
            </nav>
            <div className="ml-auto"><SandboxBadge /></div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}