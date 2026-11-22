declare const __BUILD_ID__: string;
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  /** Optional donation / support page (Ko-fi, GitHub Sponsors, Tebex...). Set it in the Cloudflare Pages build settings. */
  readonly VITE_SUPPORT_URL?: string;
}
