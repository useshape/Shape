export function SlackLogo({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#E01E5A" d="M6.3 15.2a2.1 2.1 0 1 1-2.1-2.1h2.1v2.1zm1.05 0a2.1 2.1 0 1 1 4.2 0v5.25a2.1 2.1 0 1 1-4.2 0z" />
      <path fill="#36C5F0" d="M8.85 6.3a2.1 2.1 0 1 1 2.1-2.1v2.1H8.85zm0 1.05a2.1 2.1 0 1 1 0 4.2H3.6a2.1 2.1 0 1 1 0-4.2z" />
      <path fill="#2EB67D" d="M17.7 8.85a2.1 2.1 0 1 1 2.1 2.1h-2.1V8.85zm-1.05 0a2.1 2.1 0 1 1-4.2 0V3.6a2.1 2.1 0 1 1 4.2 0z" />
      <path fill="#ECB22E" d="M15.15 17.7a2.1 2.1 0 1 1-2.1 2.1v-2.1h2.1zm0-1.05a2.1 2.1 0 1 1 0-4.2h5.25a2.1 2.1 0 1 1 0 4.2z" />
    </svg>
  );
}

export function FirebaseLogo({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#FFCA28" d="M5.2 17.8 8.4 3.6c.2-.7 1.1-.9 1.6-.3l2.6 3.2z" />
      <path fill="#FFA000" d="m5.2 17.8 8.1-11.3 2.5 4.5c.3.5.2 1.1-.2 1.5L12 17.8z" />
      <path fill="#F57C00" d="M5.2 17.8 12 20.6l6.9-2.8-2.3-8.3z" />
      <path fill="#FFECB3" d="m12.6 6.5 2.2 4.1-1.5-3.8c-.2-.6-1-.6-1.2.1z" />
    </svg>
  );
}

export function GmailLogo({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22 6.4v11.1c0 1.4-1.1 2.5-2.5 2.5H16V9.2l-4 2.9-4-2.9V20H4.5C3.1 20 2 18.9 2 17.5V6.4c0-1.9 2.1-3 3.5-1.9L12 9.8l6.5-5.3C20 3.4 22 4.5 22 6.4z"
      />
      <path fill="#34A853" d="M16 20h3.5c1.4 0 2.5-1.1 2.5-2.5V8.6L16 12.3z" />
      <path fill="#FBBC05" d="M2 8.6v8.9C2 18.9 3.1 20 4.5 20H8V12.3z" />
      <path fill="#EA4335" d="M22 6.4c0-1.9-2.1-3-3.5-1.9L12 9.8 5.5 4.5C4.1 3.4 2 4.5 2 6.4v2.2l10 7.2 10-7.2z" />
    </svg>
  );
}
