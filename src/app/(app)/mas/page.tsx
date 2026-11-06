import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions";
import { MORE_LINKS } from "@/lib/more-links";
import { PageTitle } from "@/components/ui";

export default function MorePage() {
  return (
    <>
      <PageTitle title="Más" />
      <div className="card py-1">
        {MORE_LINKS.map(({ href, label, hint, icon: Icon }) => (
          <Link key={href} href={href} className="row">
            <Icon size={20} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p>{label}</p>
              <p className="truncate text-xs text-muted">{hint}</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
      <form action={logout} className="mt-4">
        <button type="submit" className="btn w-full">
          <LogOut size={18} /> Salir
        </button>
      </form>
    </>
  );
}
