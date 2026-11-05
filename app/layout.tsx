import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Coach Dash" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <span className="brand">Coach Dash</span>
          <Link href="/">Queue</Link>
          <Link href="/brief">Daily Brief</Link>
          <Link href="/goals">Goals</Link>
          <Link href="/rankings">Rankings</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
