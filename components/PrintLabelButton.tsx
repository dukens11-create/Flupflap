"use client";

export default function PrintLabelButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary"
    >
      Print label
    </button>
  );
}
