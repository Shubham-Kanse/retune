import { Separator } from "@/components/ui/separator";
import Link from "next/link";

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#faq", label: "FAQ" },
];

export function MainNav() {
  return (
    <div className="hidden items-center gap-5 md:flex">
      <Link href="/" className="text-base font-semibold tracking-tight">
        Retuned
      </Link>
      <Separator orientation="vertical" className="h-5 w-px" />
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
