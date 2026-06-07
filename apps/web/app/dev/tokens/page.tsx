import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

const PreviewClient = dynamic(
  () => import('./PreviewClient').then((m) => m.PreviewClient),
  { ssr: false },
);

export const metadata = {
  title: 'Design Tokens — DocFlow',
};

export default function TokensPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <PreviewClient />;
}
