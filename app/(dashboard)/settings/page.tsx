import { CheckCircle2, CircleDashed, Lock } from "lucide-react";
import type { Metadata } from "next";
import { ConnectionStatus } from "@/components/settings/connection-status";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EnvError, envSummary, type EnvVarStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function EnvTable({ rows }: { rows: EnvVarStatus[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body">
        <thead className="border-b border-line text-caption text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Variable</th>
            <th className="py-2 pr-4 font-medium">Group</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="py-2 pr-4 font-mono text-[13px] text-ink">{r.name}</td>
              <td className="py-2 pr-4 text-muted">{r.group}</td>
              <td className="py-2 pr-4">
                {r.set ? (
                  <Badge tone="positive">
                    <CheckCircle2 aria-hidden /> Set
                  </Badge>
                ) : r.required ? (
                  <Badge tone="negative">
                    <CircleDashed aria-hidden /> Missing
                  </Badge>
                ) : (
                  <Badge>
                    <CircleDashed aria-hidden /> {r.value ? "Default" : "Not set"}
                  </Badge>
                )}
              </td>
              <td className="py-2 text-muted">
                {r.secret ? (
                  <span className="inline-flex items-center gap-1 text-caption">
                    <Lock className="size-3.5" aria-hidden /> hidden (server-only)
                  </span>
                ) : (
                  <span className="font-mono text-[13px]">{r.value ?? "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsPage() {
  let rows: EnvVarStatus[] | null = null;
  let envError: string[] | null = null;
  try {
    rows = envSummary();
  } catch (err) {
    envError = err instanceof EnvError ? err.issues : ["Environment could not be read."];
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="conn-heading" className="space-y-4">
        <div>
          <h2 id="conn-heading" className="text-xl font-semibold text-ink">
            Connection status
          </h2>
          <p className="text-body text-muted">
            Live checks against Google. Each check runs on its own, so one failure never hides the others.
          </p>
        </div>
        {envError ? (
          <Card className="border-red-200">
            <CardContent className="pt-5 text-body text-red-800">
              <p className="font-medium">The environment configuration is invalid:</p>
              <ul className="mt-2 list-disc pl-5">
                {envError.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <ConnectionStatus />
        )}
      </section>

      <section aria-labelledby="cfg-heading" className="space-y-4">
        <h2 id="cfg-heading" className="text-xl font-semibold text-ink">
          Configuration
        </h2>
        <SettingsPanel />
      </section>

      {rows && (
        <section aria-labelledby="env-heading">
          <Card>
            <CardHeader>
              <div>
                <CardTitle id="env-heading">Environment</CardTitle>
                <CardDescription>
                  Read from <code className="font-mono">.env.local</code> on the server. Secret values are never sent to
                  the browser.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <EnvTable rows={rows} />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
