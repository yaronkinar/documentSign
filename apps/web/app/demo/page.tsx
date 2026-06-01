import type { Metadata } from 'next';

import { DemoPageContent } from './DemoPageContent';

export const metadata: Metadata = {
  title: 'Product Demo | DocFlow',
  description: 'Watch a short product demo of DocFlow.',
};

export default function DemoPage() {
  return <DemoPageContent />;
}
