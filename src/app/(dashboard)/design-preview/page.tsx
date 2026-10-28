import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Money } from "@/components/ui/money";
import { Serial } from "@/components/ui/serial";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/content-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSessionContext } from "@/lib/auth/session";

const colorTokens = [
  ["Brand 900", "bg-brand-900", "#0A2A20"],
  ["Brand 700", "bg-brand-700", "#0F3D2E"],
  ["Brand 50", "bg-brand-50", "#EEF4F0"],
  ["Gold 500", "bg-gold-500", "#C8A24A"],
  ["Ivory", "bg-ivory", "#FAF7F0"],
  ["Ink", "bg-ink", "#14201B"],
  ["Success", "bg-success text-success-foreground", "#DCFCE7 / #14532D"],
  ["Warning", "bg-warning text-warning-foreground", "#FEF3C7 / #713F12"],
  ["Danger", "bg-danger text-danger-foreground", "#FEE2E2 / #7F1D1D"],
  ["Info", "bg-info text-info-foreground", "#DBEAFE / #1E3A8A"],
] as const;

export default async function DesignPreviewPage() {
  const ctx = await getSessionContext();
  if (!ctx || ctx.role !== "ADMIN") notFound();

  return (
    <div className="mx-auto w-full max-w-[360px] space-y-6">
      <PageHeader title="Design preview" description="Prompt 1 · foundations at a 360 px content width" />

      <section aria-labelledby="preview-colors" className="space-y-3">
        <h2 id="preview-colors" className="text-lg font-semibold">Color tokens</h2>
        <div className="grid grid-cols-2 gap-2">
          {colorTokens.map(([name, color, value]) => (
            <div key={name} className="overflow-hidden rounded-lg border bg-card">
              <div className={`flex h-12 items-center justify-center px-2 text-center text-base font-medium ${color}`}>
                {name.startsWith("Success") || name.startsWith("Warning") || name.startsWith("Danger") || name.startsWith("Info") ? "Aa" : ""}
              </div>
              <div className="p-2 text-base">
                <div className="font-medium">{name}</div>
                <div className="text-muted-foreground">{value}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-base text-muted-foreground">Foreground/background contrast ratios are listed in docs/DESIGN-CONTRAST.md.</p>
      </section>

      <section aria-labelledby="preview-type" className="space-y-3">
        <h2 id="preview-type" className="text-lg font-semibold">Type and values</h2>
        <Card>
          <CardHeader><CardTitle>Event admission</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Money amount={150000} className="text-xl font-semibold" />
            <Serial className="text-lg">KSP-00042</Serial>
            <p className="text-base text-muted-foreground">Body text uses a comfortable mobile size.</p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="preview-status" className="space-y-3">
        <h2 id="preview-status" className="text-lg font-semibold">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge domain="event" status="SCHEDULED" />
          <StatusBadge domain="ticket" status="SOLD" />
          <StatusBadge domain="sale" status="PARTIALLY_PAID" />
          <StatusBadge domain="payment" status="RECORDED" />
          <StatusBadge domain="scan" status="ADMITTED" />
          <StatusBadge domain="scan" status="ALREADY_USED" />
          <StatusBadge domain="scan" status="NOT_PAID" />
        </div>
      </section>

      <section aria-labelledby="preview-controls" className="space-y-3">
        <h2 id="preview-controls" className="text-lg font-semibold">Controls</h2>
        <div className="grid gap-3">
          <Button>Primary action</Button>
          <Button size="xl">Large scanner action</Button>
          <Button variant="outline">Secondary action</Button>
          <div className="grid gap-2">
            <Label htmlFor="preview-input">Ticket serial</Label>
            <Input id="preview-input" placeholder="KSP-00042" />
          </div>
          <div className="grid gap-2">
            <Label>Ticket type</Label>
            <Select defaultValue="standard">
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="preview-note">Note</Label>
            <Textarea id="preview-note" placeholder="Add a short note" />
          </div>
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm action</DialogTitle>
                <DialogDescription>Dialog content uses the shared controls and typography.</DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton><Button>Continue</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section aria-labelledby="preview-feedback" className="space-y-3">
        <h2 id="preview-feedback" className="text-lg font-semibold">Feedback and loading</h2>
        <Alert>
          <AlertTitle>Informational alert</AlertTitle>
          <AlertDescription>Clear language remains readable at phone size.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Action needed</AlertTitle>
          <AlertDescription>Check the highlighted field and try again.</AlertDescription>
        </Alert>
        <Badge variant="outline">Neutral badge</Badge>
        <EmptyState title="No tickets yet" description="Generated tickets will appear here." action={<Button>Create tickets</Button>} />
        <ErrorState title="Could not load tickets" description="Check your connection and retry." />
        <ListSkeleton rows={2} />
      </section>

      <section aria-labelledby="preview-tokens" className="space-y-3">
        <h2 id="preview-tokens" className="text-lg font-semibold">Shape and spacing tokens</h2>
        <div className="grid grid-cols-3 gap-3 text-center text-base">
          <div className="rounded-control border bg-card p-3">Control radius</div>
          <div className="rounded-xl border bg-card p-3">Card radius</div>
          <div className="rounded-xl border bg-card p-3 shadow-card">Card shadow</div>
        </div>
        <p className="text-base text-muted-foreground">Spacing samples: 8 px, 16 px and 24 px. Focus ring: brand green on light surfaces, gold on dark surfaces.</p>
      </section>
    </div>
  );
}
