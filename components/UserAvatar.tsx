import Image from 'next/image';

type UserAvatarProps = {
  imageUrl?: string | null;
  name?: string | null;
  className?: string;
};

function getInitials(name?: string | null) {
  const cleaned = (name ?? '').trim();
  if (!cleaned) return 'U';
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'U';
}

export default function UserAvatar({ imageUrl, name, className = 'h-10 w-10' }: UserAvatarProps) {
  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden rounded-full bg-slate-100 ${className}`}>
        <Image
          src={imageUrl}
          alt={name ? `${name} profile photo` : 'User profile photo'}
          fill
          className="object-cover"
          sizes="96px"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-slate-200 text-xs font-semibold uppercase text-slate-600 ${className}`}
      aria-label="Default avatar"
    >
      {getInitials(name)}
    </div>
  );
}

