import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';

export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Job Guide Match home">
        <span className="brand-mark"><BriefcaseBusiness size={20} /></span>
        <span>Job Guide Match</span>
      </Link>
      <nav className="top-nav" aria-label="Primary navigation">
        <Link href="/find/work">Find work</Link>
        <Link href="/chat">Chat</Link>
        <Link href="/about">About</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </header>
  );
}
