/* eslint-disable @next/next/no-img-element */
/** Official NOX wordmark (public/brand/nox-wordmark.png). `size` = rendered height in px. */
export function Logo({ size = 44 }: { size?: number }) {
  return <img src="/brand/nox-wordmark.png" alt="NOX — New Orbit Exploration" height={size} width={Math.round(size * (262 / 206))} className="mk-logo-img" style={{ height: size, width: "auto" }} />;
}

/** Official NOX embroidered mission patch (public/brand/nox-patch.png). */
export function Patch({ size = 200 }: { size?: number }) {
  return <img src="/brand/nox-patch.png" alt="NOX mission patch" width={size} height={size} className="mk-patch" style={{ width: size, height: size }} />;
}
