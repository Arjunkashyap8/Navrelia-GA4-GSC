import type { Metadata } from "next";
import { ReportBuilder } from "@/components/report/report-builder";
import { Section } from "@/components/section";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <Section title="Report builder" description="A branded, light-themed PDF: cover page, executive summary, KPIs, charts, insights and next steps.">
        <ReportBuilder serverPdf={!process.env.VERCEL} />
      </Section>
    </div>
  );
}
