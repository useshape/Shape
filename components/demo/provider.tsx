"use client";

export function ShapeAutoIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo/icon/blue.svg"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, display: "block", width: size, height: size }}
    />
  );
}

export function providerIcon(_modelId: string, size = 16) {
  return <ShapeAutoIcon size={size} />;
}
