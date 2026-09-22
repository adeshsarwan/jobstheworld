import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <p className="footer-brand">Job Guide Match</p>
          <p className="footer-note">
            Job Guide Match helps job seekers explore practical roles and links to external employer or job-board application pages.
            Listings can change, expire, or be updated by the source site.
          </p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/find/work">Find work</Link>
          <Link href="/chat">Chat</Link>
        </nav>
      </div>
    </footer>
  );
}
