"use client";

/* Copied from shape/features/agent/sidebar/menu.tsx ProfileAvatar
   and features/chat/ui/message/item.tsx UserMessageAvatar.
   Photo: /images/demo/avatar.png */

export function DemoAvatar({
  name = "Alex",
  size = 28,
  className,
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/demo/avatar.png"
      alt={name}
      width={size}
      height={size}
      className={className ?? "shrink-0 rounded-full object-cover"}
      style={{ width: size, height: size }}
    />
  );
}
