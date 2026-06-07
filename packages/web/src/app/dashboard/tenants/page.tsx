'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function TenantsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tenant = searchParams.get('tenant');
    const tab = searchParams.get('tab');
    const params = new URLSearchParams();
    if (tenant) params.set('tenant', tenant);
    if (tab) params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `/dashboard?${qs}` : '/dashboard');
  }, [router, searchParams]);

  return null;
}

export default function TenantsPage() {
  return (
    <Suspense fallback={null}>
      <TenantsRedirect />
    </Suspense>
  );
}
