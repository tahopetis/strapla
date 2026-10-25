import type { Metadata } from 'next';
import Link from 'next/link';
import { isNull, sql } from 'drizzle-orm';
import { Badge, Card, PageHeader, Stat } from '@/components/ui';
import { getDb } from '@/db/client';
import {
  annualPlans,
  annualPrograms,
  auditEntries,
  projectYearAllocations,
  projects,
  strategicInitiatives,
  users,
} from '@/db/schema';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

interface Counts {
  users: number;
  auditEntries: number;
  initiatives: number;
  annualPlans: number;
  programs: number;
  projects: number;
  allocations: number;
}

async function loadCounts(): Promise<Counts | null> {
  try {
    const db = getDb();
    const count = async (query: PromiseLike<Array<{ value: string }>>) => {
      const rows = await query;
      return Number(rows[0]?.value ?? '0');
    };

    const [userCount, auditCount, initiativeCount, annualPlanCount, programCount, projectCount, allocationCount] =
      await Promise.all([
        count(db.select({ value: sql<string>`count(*)::text` }).from(users)),
        count(db.select({ value: sql<string>`count(*)::text` }).from(auditEntries)),
        count(
          db
            .select({ value: sql<string>`count(*)::text` })
            .from(strategicInitiatives)
            .where(isNull(strategicInitiatives.voidedAt)),
        ),
        count(db.select({ value: sql<string>`count(*)::text` }).from(annualPlans)),
        count(
          db
            .select({ value: sql<string>`count(*)::text` })
            .from(annualPrograms)
            .where(isNull(annualPrograms.voidedAt)),
        ),
        count(db.select({ value: sql<string>`count(*)::text` }).from(projects)),
        count(
          db
            .select({ value: sql<string>`count(*)::text` })
            .from(projectYearAllocations)
            .where(isNull(projectYearAllocations.voidedAt)),
        ),
      ]);

    return {
      users: userCount,
      auditEntries: auditCount,
      initiatives: initiativeCount,
      annualPlans: annualPlanCount,
      programs: programCount,
      projects: projectCount,
      allocations: allocationCount,
    };
  } catch (error) {
    console.error('dashboard: could not load counts', error);
    return null;
  }
}

const linkClass = 'text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900';

const modules = [
  {
    title: 'Plan',
    badge: 'live',
    tone: 'success' as const,
    href: '/plan',
    body: 'Strategic plan and initiatives, annual plans, programs with continuation, projects with ijin prinsip, recurring operations and the opening-balance reconciliation.',
    links: [
      { href: '/plan/strategic', label: 'Strategic plan & SIs' },
      { href: '/plan/annual', label: 'Annual plans & programs' },
      { href: '/plan/projects', label: 'Projects & allocations' },
      { href: '/plan/opening-balances', label: 'Opening balances' },
    ],
  },
  {
    title: 'Funding',
    badge: 'live',
    tone: 'success' as const,
    href: '/funding',
    body: 'Project year allocations per fiscal year, program budget availability, the funding flag engine and the pricing chain.',
    links: [
      { href: '/plan/projects', label: 'Allocations on the project register' },
      { href: '/funding', label: 'Funding overview & flags' },
    ],
  },
  {
    title: 'Reports',
    badge: 'live',
    tone: 'success' as const,
    href: '/reports',
    body: 'SI five-year view, annual plan by SI and program, project register, budget versus actual — with CSV/XLSX exports and print/PDF views.',
    links: [{ href: '/reports', label: 'Open reports' }],
  },
  {
    title: 'Administration',
    badge: 'live',
    tone: 'success' as const,
    href: '/admin',
    body: 'Member accounts, session and password management, and the append-only audit trail with per-record history.',
    links: [
      { href: '/admin/members', label: 'Members' },
      { href: '/admin/audit', label: 'Audit trail' },
    ],
  },
  {
    title: 'Execution',
    badge: 'next',
    tone: 'warning' as const,
    href: '/funding',
    body: 'Commitment entries with settlement, spend entries with spend categories, cross-year settlement and the actual-spend reporting. January 2027 release.',
    links: [],
  },
];

export default async function DashboardPage() {
  const counts = await loadCounts();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Strapla is live for the FY2027 planning cycle: plan, fund and report the IT portfolio in one place."
        actions={<Badge tone={counts ? 'success' : 'danger'}>{counts ? 'Database connected' : 'Database unavailable'}</Badge>}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Administrators" value={counts?.users ?? '—'} />
        <Stat label="Strategic initiatives" value={counts?.initiatives ?? '—'} />
        <Stat label="Annual plans" value={counts?.annualPlans ?? '—'} />
        <Stat label="Programs" value={counts?.programs ?? '—'} />
        <Stat label="Projects" value={counts?.projects ?? '—'} />
        <Stat label="Project year allocations" value={counts?.allocations ?? '—'} />
        <Stat label="Audit entries" value={counts?.auditEntries ?? '—'} />
        <Stat label="Audit" value="append-only" hint="Every change is attributed (ADR-0004)" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {modules.map((module) => (
          <Card
            key={module.title}
            title={module.title}
            actions={<Badge tone={module.tone}>{module.badge}</Badge>}
          >
            <p className="text-sm text-slate-700">{module.body}</p>
            {module.links.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm">
                {module.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </section>

      <Card title="December release — remaining before go-live" description="Tracked in the issue tracker and the go-live checklist.">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Production host, domain/TLS and GHCR access (owner decision)</li>
          <li>Opening balances loaded from the FY2026 spreadsheets and reconciled (owner data + UAT-08)</li>
          <li>User acceptance testing with the real FY2027 plan, then go-live approval</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Readiness documents: UAT plan, opening-balance load workplan, go-live checklist, user guide and
          release notes in <span className="font-mono">docs/</span>.
        </p>
      </Card>

      <p className="text-xs text-slate-500">
        Source of truth: <span className="font-mono">docs/CHARTER.md</span>, ADR-0001..0004,{' '}
        <span className="font-mono">docs/data-model.md</span> and the milestone issues.
      </p>
    </div>
  );
}
