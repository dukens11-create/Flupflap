'use client';

import { Share2 } from 'lucide-react';

type Props = {
  title: string;
};

export default function GarageSaleShareButton({ title }: Props) {
  async function handleClick() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="btn-outline w-full flex items-center justify-center gap-2"
    >
      <Share2 size={14} /> Share This Sale
    </button>
  );
}
