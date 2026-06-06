'use client';

import { useState } from 'react';
import { Bell, Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Direction = 'ltr' | 'rtl';

export function PreviewClient() {
  const [dir, setDir] = useState<Direction>('ltr');

  return (
    <TooltipProvider>
      <div dir={dir} className="min-h-screen bg-bg text-fg">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-fg-subtle">
                DocFlow design system
              </p>
              <h1 className="mt-1 text-3xl text-fg">Tokens &amp; primitives</h1>
              <p className="mt-2 max-w-xl text-sm text-fg-muted">
                Every component, every variant, in every theme. Use the controls
                on the right to switch theme and writing direction.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDir(dir === 'ltr' ? 'rtl' : 'ltr')}
              >
                Direction: {dir.toUpperCase()}
              </Button>
            </div>
          </header>

          <Section title="Theme">
            <ThemePicker />
          </Section>

          <Section title="Color tokens">
            <SwatchGrid />
          </Section>

          <Section title="Typography">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl">Heading 1 — tracking tight, semibold</h1>
              <h2 className="text-2xl">Heading 2 — tracking tight, semibold</h2>
              <h3 className="text-xl">Heading 3 — tracking tight, semibold</h3>
              <p className="text-base text-fg">Body — default foreground.</p>
              <p className="text-sm text-fg-muted">Muted — secondary text.</p>
              <p className="text-xs text-fg-subtle">Subtle — captions, meta.</p>
            </div>
          </Section>

          <Section title="Button">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </Section>

          <Section title="Form inputs">
            <div className="grid gap-4 sm:max-w-md">
              <div className="grid gap-1.5">
                <Label htmlFor="t-name">Full name</Label>
                <Input id="t-name" placeholder="Jane Doe" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-bio">Bio</Label>
                <Textarea id="t-bio" placeholder="Tell us about yourself" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-role">Role</Label>
                <Select>
                  <SelectTrigger id="t-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="signer">Signer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="t-tos" />
                <Label htmlFor="t-tos">Accept terms</Label>
              </div>
            </div>
          </Section>

          <Section title="Badge">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </Section>

          <Section title="Card">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Lease agreement</CardTitle>
                <CardDescription>
                  Awaiting signature from 2 of 3 signers.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-fg-muted">Updated today</span>
                <Badge>Pending</Badge>
              </CardContent>
            </Card>
          </Section>

          <Section title="Tabs">
            <Tabs defaultValue="all" className="max-w-md">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="pt-3 text-sm text-fg-muted">
                All documents.
              </TabsContent>
              <TabsContent value="mine" className="pt-3 text-sm text-fg-muted">
                Documents you own.
              </TabsContent>
              <TabsContent value="pending" className="pt-3 text-sm text-fg-muted">
                Awaiting your signature.
              </TabsContent>
            </Tabs>
          </Section>

          <Section title="Dialog">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="me-2 h-4 w-4" />
                  Delete document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this document?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. The PDF and all signatures
                    will be permanently removed.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Section>

          <Section title="Dropdown menu">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>
                  <Download className="me-2 h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem className="text-danger focus:text-danger">
                  <Trash2 className="me-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Section>

          <Section title="Tooltip">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>You have 3 new notifications</TooltipContent>
            </Tooltip>
          </Section>

          <Section title="Toast">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => toast('Document saved.')}>Default</Button>
              <Button
                variant="secondary"
                onClick={() => toast.success('Document signed.')}
              >
                Success
              </Button>
              <Button
                variant="destructive"
                onClick={() => toast.error('Delete failed.')}
              >
                Error
              </Button>
            </div>
          </Section>

          <Section title="Skeleton">
            <div className="flex flex-col gap-3 sm:max-w-md">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Section>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-fg-subtle">
        {title}
      </h2>
      <div className="rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </section>
  );
}

function SwatchGrid() {
  const groups: { label: string; tokens: string[] }[] = [
    {
      label: 'Surfaces',
      tokens: [
        '--color-bg',
        '--color-surface',
        '--color-surface-muted',
        '--color-border',
        '--color-border-strong',
      ],
    },
    {
      label: 'Text',
      tokens: ['--color-fg', '--color-fg-muted', '--color-fg-subtle'],
    },
    {
      label: 'Brand',
      tokens: [
        '--color-primary',
        '--color-primary-fg',
        '--color-accent',
        '--color-accent-fg',
      ],
    },
    {
      label: 'Status',
      tokens: [
        '--color-success',
        '--color-warning',
        '--color-danger',
        '--color-info',
      ],
    },
    {
      label: 'Pill',
      tokens: ['--color-pill-bg', '--color-pill-fg'],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {group.tokens.map((token) => (
              <div
                key={token}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface p-2"
              >
                <div
                  className="h-10 w-full rounded border border-border"
                  style={{ backgroundColor: `var(${token})` }}
                />
                <code className="text-[10px] text-fg-muted">{token}</code>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
