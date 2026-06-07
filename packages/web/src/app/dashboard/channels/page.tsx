'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ChannelsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tenant = searchParams.get('tenant');
    const params = new URLSearchParams();
    if (tenant) params.set('tenant', tenant);
    params.set('tab', 'channels');
    router.replace(`/dashboard?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={null}>
      <ChannelsRedirect />
    </Suspense>
  );
}
