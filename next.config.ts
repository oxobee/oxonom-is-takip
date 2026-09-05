import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ['firebase-admin', 'sharp'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // SAMEORIGIN permite iframes del mismo origen (necesario para Firebase Auth)
          // DENY bloqueaba los iframes intermedios de Firebase Auth en popups OAuth
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // CRITICAL: Firebase Auth popups (Google, Microsoft) require COOP=unsafe-none
          // Vercel defaults to same-origin which blocks window.open() in OAuth flows
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          // Se mantiene permisos pero sin bloquear completamente (algunos flujos OAuth en móvil los necesitan)
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              // default-src: fuentes permitidas por defecto
              "default-src 'self';",
              // script-src: scripts del SDK Firebase, Google Identity Services, Google Maps, UUID CDN, y Microsoft Auth
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "  https://www.gstatic.com",
              "  https://*.googleapis.com",
              "  https://apis.google.com",
              "  https://cdn.jsdelivr.net",
              "  https://aadcdn.msauth.net",
              "  https://aadcdn.msftauth.net",
              "  https://logincdn.msauth.net",
              "  https://*.msauth.net",
              "  https://*.msftauth.net;",
              // style-src: fuentes de Google y estilos inline de Firebase
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
              // font-src: fuentes de Google
              "font-src 'self' https://fonts.gstatic.com;",
              // img-src: imágenes de perfiles, storage, favicons, Microsoft Graph y Microsoft Auth avatars
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://firebasestorage.googleapis.com https://*.graph.facebook.com https://*.googleapis.com https://graph.microsoft.com https://aadcdn.msauth.net https://aadcdn.msftauth.net https://*.msauth.net https://*.msftauth.net;",
              // connect-src: endpoints de Firebase Auth, Firestore, Google Identity Services, Microsoft OAuth
              "connect-src 'self'",
              "  https://*.firebaseio.com",
              "  https://*.googleapis.com",
              "  https://apis.google.com",
              "  https://www.gstatic.com",
              "  https://lh3.googleusercontent.com",
              "  https://securetoken.googleapis.com",
              "  https://identitytoolkit.googleapis.com",
              "  https://accounts.google.com",
              "  https://graph.facebook.com",
              "  https://login.microsoftonline.com",
              "  https://login.live.com",
              "  https://id.live.com",
              "  https://aadcdn.msauth.net",
              "  https://aadcdn.msftauth.net",
              "  https://*.msauth.net",
              "  https://*.msftauth.net",
              "  https://logincdn.msauth.net",
              "  https://browser.pipe.aria.microsoft.com",
              "  wss://*.firebaseio.com",
              "  https://firestore.googleapis.com",
              "  https://graph.microsoft.com;",
              // frame-src: iframes para OAuth popups (Google, Microsoft, Firebase)
              // CRITICAL: *.firebaseapp.com es necesario para los iframes intermedios de Firebase Auth
              "frame-src 'self'",
              "  https://accounts.google.com",
              "  https://login.microsoftonline.com",
              "  https://login.live.com",
              "  https://id.live.com",
              "  https://aadcdn.msauth.net",
              "  https://aadcdn.msftauth.net",
              "  https://*.msauth.net",
              "  https://*.msftauth.net",
              "  https://logincdn.msauth.net",
              "  https://*.google.com",
              "  https://*.firebaseapp.com",
              "  https://*.firebaseio.com;",
              // form-action: permitido para redirects OAuth de Microsoft
              "form-action 'self' https://login.microsoftonline.com https://login.live.com https://accounts.google.com;",
            ].join(' '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
