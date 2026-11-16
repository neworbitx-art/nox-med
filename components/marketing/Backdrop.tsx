/* eslint-disable @next/next/no-img-element */
/** Slowly moving photographic background for a section. Decorative; motion is disabled for reduced-motion users. */
export function Backdrop({ src, variant = "a", dim = 0.5, position = "center" }: { src: string; variant?: "a" | "b" | "c"; dim?: number; position?: string }) {
  return (
    <div className={`mk-bg mk-bg-${variant}`} aria-hidden="true">
      <img src={src} alt="" loading="lazy" decoding="async" style={{ opacity: dim, objectPosition: position }} />
    </div>
  );
}

/** Drifting star field for sections that stay photo-free. */
export function Stars() {
  return <div className="mk-stars" aria-hidden="true"><i /><i /></div>;
}
