interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size, className }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined${className != null ? ` ${className}` : ''}`}
      style={size != null ? { fontSize: size } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
