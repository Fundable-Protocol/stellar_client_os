'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { useTranslation } from '@/i18n/I18nProvider';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

export function RootErrorBoundary({ children }: RootErrorBoundaryProps) {
  const { t } = useTranslation();

  return (
    <ErrorBoundary
      boundaryName="root-layout"
      fallback={({ error, reset }) => (
        <ErrorFallback
          title={t('errors.rootTitle')}
          description={t('errors.rootDescription')}
          error={error}
          onRetry={reset}
          className="m-4"
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}