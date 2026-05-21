import { Skeleton } from "@/components/ui/primitives";

/**
 * Default loading skeleton for all dashboard routes.
 * Renders during route transitions so users never see a blank screen.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
