import { notFound } from 'next/navigation';

// Renders the localized not-found page for unknown paths inside a locale.
export default function CatchAllPage() {
  notFound();
}
