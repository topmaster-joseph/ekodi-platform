/// <reference types="vite/client" />

declare module '*.css';

declare module 'virtual:ekodi-site-config' {
  const config: {
    siteId: string;
    siteName: string;
    targetDomain: string;
    legacyUrl: string;
    access: 'public' | 'private';
  };
  export default config;
}
