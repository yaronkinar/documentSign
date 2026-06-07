import { Skeleton } from '@/components/ui/skeleton';

export function PdfLoadingSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-10"
      aria-busy="true"
      aria-label="Loading document"
    >
      <Skeleton className="aspect-[8.5/11] w-full rounded-lg shadow-md" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}
