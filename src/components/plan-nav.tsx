import Link from 'next/link';

const links = [
  { href: '/plan', label: 'Overview' },
  { href: '/plan/strategic', label: 'Strategic plan & SIs' },
];

export function PlanNav() {
  return (
    <nav aria-label="Plan sections" className="mb-6 border-b border-slate-200">
      <ul className="flex flex-wrap gap-1 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-block rounded-t px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <span className="inline-block px-3 py-2 text-slate-400">Annual plans (next)</span>
        </li>
        <li>
          <span className="inline-block px-3 py-2 text-slate-400">Projects (next)</span>
        </li>
        <li>
          <span className="inline-block px-3 py-2 text-slate-400">Opening balances (next)</span>
        </li>
      </ul>
    </nav>
  );
}
