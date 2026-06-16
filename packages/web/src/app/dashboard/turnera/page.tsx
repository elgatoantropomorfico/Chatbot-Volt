'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function TurneraRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'servicios';

  useEffect(() => {
    router.replace(`/dashboard/settings?tab=${tab}`);
  }, [router, tab]);

  return null;
}

export default function TurneraRedirectPage() {
  return (
    <Suspense fallback={null}>
      <TurneraRedirect />
    </Suspense>
  );
}
