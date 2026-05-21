'use client';

export default function PrintLabelActions() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary text-sm print:hidden">
      Print this page
    </button>
  );
}
