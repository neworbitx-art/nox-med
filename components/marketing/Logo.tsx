/* eslint-disable @next/next/no-img-element */
/** Official NOX wordmark (public/brand/nox-wordmark.png). `size` = rendered height in px. */
export function Logo({ size = 44 }: { size?: number }) {
  const d = Math.round(size * 1.7);
  return <span className="mk-logo-circle" style={{ width: d, height: d }}><img src="/brand/nox-logo-square.png" alt="NOX — New Orbit Exploration" className="mk-logo-img" style={{ width: Math.round(d * 0.68), height: Math.round(d * 0.68) }} /></span>;
}

/** Official NOX embroidered mission patch (public/brand/nox-patch.png). */
export function Patch({ size = 200 }: { size?: number }) {
  return <img src="/brand/nox-patch.png" alt="NOX mission patch" width={size} height={size} className="mk-patch" style={{ width: size, height: size }} />;
}
