"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Redirect to dashboard if already authenticated
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem("user");
      if (user) {
        router.push("/dashboard");
      } else {
        setIsChecking(false);
      }
    }
  }, [router]);

  // Show nothing while checking auth to prevent flash
  if (isChecking) {
    return null;
  }

  return <>{children}</>;
}
