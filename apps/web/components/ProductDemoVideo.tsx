'use client';

import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { DEMO_VIDEO_MP4, DEMO_VIDEO_WEBM } from '@/lib/demo-video';
import { cn } from '@/lib/utils';

export function ProductDemoVideo({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-black shadow-sm',
        className,
      )}
    >
      <video
        aria-label={t('demo.videoLabel')}
        className="aspect-video w-full"
        controls
        playsInline
        preload="metadata"
        poster="/videos/product-demo-poster.jpg"
      >
        <source src={DEMO_VIDEO_MP4} type="video/mp4" />
        <source src={DEMO_VIDEO_WEBM} type="video/webm" />
        {t('demo.fallback')}
      </video>
    </div>
  );
}
