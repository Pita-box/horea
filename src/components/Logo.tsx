import Image from 'next/image';

/**
 * Oficiální logo projektu Horea (wordmark + tečka). Zdroj pravdy: `public/logo.svg`.
 * Poměr stran 809.02 : 281.17 (≈ 2.877). Výchozí výška odpovídá běžnému použití
 * v hlavičkách; konkrétní rozměr lze přepsat přes `width`/`height` (zachovej poměr).
 *
 * Použito `unoptimized`, protože jde o důvěryhodný first-party vektor — Next image
 * optimalizér SVG bez `dangerouslyAllowSVG` neprochází a vektoru optimalizace netřeba.
 *
 * `white` přepne na bílou variantu (`public/logo-white.svg`) pro tmavá pozadí
 * (např. dashboard sidebar). Výchozí je tmavé logo pro světlá pozadí.
 */
export function Logo({
  className,
  width = 104,
  height = 36,
  priority = false,
  white = false,
}: {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  white?: boolean;
}) {
  return (
    <Image
      src={white ? '/logo-white.svg' : '/logo.svg'}
      alt="Horea"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}
