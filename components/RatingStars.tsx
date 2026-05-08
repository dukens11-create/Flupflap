export default function RatingStars({
  rating,
  className = '',
}: {
  rating: number;
  className?: string;
}) {
  const roundedRating = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${roundedRating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < roundedRating ? 'text-amber-500' : 'text-slate-300'}>
          ★
        </span>
      ))}
    </span>
  );
}
