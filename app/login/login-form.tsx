"use client";

import { Loader2, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Only allow same-site relative redirects (prevents open redirects). */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/overview";
}

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardContent className="pt-5">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError(null);
            try {
              const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ password }),
              });
              if (res.ok) {
                window.location.href = safeNext(params.get("next"));
                return;
              }
              const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
              setError(json?.error?.message ?? "Sign-in failed.");
            } catch {
              setError("Network error — please try again.");
            } finally {
              setPending(false);
            }
          }}
        >
          <div>
            <label htmlFor="password" className="mb-1.5 block text-body font-medium text-ink">
              Dashboard password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-body shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              />
            </div>
          </div>
          {error && (
            <p id="login-error" role="alert" className="text-body text-negative">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
