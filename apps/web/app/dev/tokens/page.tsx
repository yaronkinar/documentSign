import { notFound } from 'next/navigation';

import { PreviewClient } from './PreviewClient';

export const metadata = {
  title: 'Design Tokens — DocFlow',
};

export default function TokensPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <PreviewClient />;
}
