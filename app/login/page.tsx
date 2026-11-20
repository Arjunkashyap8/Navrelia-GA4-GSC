import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // No password configured: there is nothing to sign in to.
  await connection();
  if (!process.env.DASHBOARD_PASSWORD?.trim()) redirect("/overview");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">N</div>
          <div className="leading-tight">
            <p className="font-semibold text-ink">Navrelia</p>
            <p className="text-caption text-muted">Search &amp; Analytics Command Center</p>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
