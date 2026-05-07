import { ShoppingBag } from 'lucide-react';

interface FlupFlapLogoProps {
  size?: 'sm' | 'md' | 'lg';
  dark?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { icon: 16 as const, text: 'text-base' },
  md: { icon: 20 as const, text: 'text-xl' },
  lg: { icon: 36 as const, text: 'text-4xl' },
};

export default function FlupFlapLogo({ size = 'md', dark = false, className = '' }: FlupFlapLogoProps) {
  const { icon, text } = sizeMap[size];
  const orangeClass = dark ? 'text-orange-400' : 'text-orange-500';
  const greenClass = dark ? 'text-green-400' : 'text-green-600';
  return (
    <span className={`flex items-center gap-1.5 ${className}`} aria-label="FlupFlap">
      <ShoppingBag size={icon} className={orangeClass} aria-hidden="true" />
      <span className={`font-black leading-none ${text}`}>
        <span className={orangeClass}>Flup</span>
        <span className={greenClass}>Flap</span>
      </span>
    </span>
  );
}
