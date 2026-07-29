/**
 * Material Symbols Rounded, the icon family the design uses throughout.
 *
 * The font is loaded in index.html and the `.ms` / `.msf` classes live in
 * app/index.css. `fill` switches to the filled variant, which the design uses
 * for earned/active states only.
 */
export function Icon({
  name,
  size = 22,
  fill = false,
  color,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`ms${fill ? ' msf' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: size, color, ...style }}
      aria-hidden
    >
      {name}
    </span>
  );
}
