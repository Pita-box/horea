import Image from 'next/image';

/**
 * Oficiální logo projektu Horea (wordmark + tečka). Zdroj pravdy: `public/logo.svg`.
 * Poměr stran 809.02 : 281.17 (≈ 2.877). Výchozí výška odpovídá běžnému použití
 * v hlavičkách; konkrétní rozměr lze přepsat přes `width`/`height` (zachovej poměr).
 *
 * Použito `unoptimized`, protože jde o důvěryhodný first-party vektor — Next image
 * optimalizér SVG bez `dangerouslyAllowSVG` neprochází a vektoru optimalizace netřeba.
 */
export function Logo({
  className,
  width = 104,
  height = 36,
  priority = false,
}: {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="Horea"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}
