import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, hasNextPage, basePath }) {
  if (page === 1 && !hasNextPage) return null;

  return (
    <div className="flex items-center justify-between text-sm text-text-muted">
      <Link
        href={`${basePath}?page=${page - 1}`}
        className={`flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 ${
          page <= 1 ? "pointer-events-none opacity-40" : "hover:text-text"
        }`}
      >
        <ChevronLeft className="size-4" />
        Anterior
      </Link>
      <span>Página {page}</span>
      <Link
        href={`${basePath}?page=${page + 1}`}
        className={`flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 ${
          !hasNextPage ? "pointer-events-none opacity-40" : "hover:text-text"
        }`}
      >
        Siguiente
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
