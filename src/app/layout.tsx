import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ClientProviders from "./ClientProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "oxonom iş takip — Proje & İş Yönetimi",
    template: "%s | oxonom iş takip",
  },
  description: "Kapsamlı kurumsal proje, görev, şantiye ve iş takip yönetim platformu.",
  keywords: ["oxonom", "iş takip", "proje yönetimi", "görev takibi", "şantiye", "bütçe", "planlama", "türkiye"],
  authors: [{ name: "oxonom iş takip" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "oxonom iş takip",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "oxonom iş takip",
    title: "oxonom iş takip — Proje & İş Yönetimi Platformu",
    description: "Kapsamlı kurumsal proje, görev, şantiye ve iş takip yönetim platformu.",
  },
  twitter: {
    card: "summary_large_image",
    title: "oxonom iş takip — Proje & İş Yönetimi",
    description: "Kapsamlı kurumsal proje, görev, şantiye ve iş takip yönetim platformu.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#d4b87a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* ── Firebase SDK URLs ── */
const FB_APP = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
const FB_AUTH = "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js";
const FB_FS = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js";
const FB_STORAGE = "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js";

/* Reliable fallback client credentials to prevent empty config crashes */
const FB_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBQOTu97ACa8Im9V8zcvWfEoVRIFDVK1Ho",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "archiflow-prod-2026.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "archiflow-prod-2026",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "archiflow-prod-2026.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1090724963650",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1090724963650:web:28468b10aef5e89c0f54db",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-48.png" />
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon-152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icon-152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icon-128.png" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="oxonom iş takip" />
        {/* PWA Icons */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* ── Firebase SDK — synchronous scripts, MUST be first in <head> ── */}
        {/* Using native <script> (not Next.js <Script>) to guarantee synchronous loading */}
        {/* These run BEFORE React hydrates, so firebase is always available */}
        <script src={FB_APP} />
        <script src={FB_AUTH} />
        <script src={FB_FS} />
        <script src={FB_STORAGE} />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (typeof firebase !== 'undefined' && (!firebase.apps || firebase.apps.length === 0)) {
              firebase.initializeApp({
                apiKey: ${JSON.stringify(FB_CONFIG.apiKey)},
                authDomain: ${JSON.stringify(FB_CONFIG.authDomain)},
                projectId: ${JSON.stringify(FB_CONFIG.projectId)},
                storageBucket: ${JSON.stringify(FB_CONFIG.storageBucket)},
                messagingSenderId: ${JSON.stringify(FB_CONFIG.messagingSenderId)},
                appId: ${JSON.stringify(FB_CONFIG.appId)}
              });
              try { firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function(e){ console.warn('[oxonom] Persistence unavailable:', e); }); } catch(e){ console.warn('[oxonom] Persistence init error:', e); }
              try { firebase.setLogLevel && firebase.setLogLevel('error'); } catch(e){ console.warn('[oxonom] setLogLevel error:', e); }
            }
            window.__AF_FB = true;
          } catch(err) {
            console.error('[oxonom] Firebase init failed:', err);
            window.__AF_FB = false;
          }
        ` }} />

        {/* Theme init — prevent FOUC (dark/light only) */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('archii-theme') || 'dark';
            if (t === 'dark') {
              document.documentElement.classList.add('dark');
              document.documentElement.style.colorScheme = 'dark';
            } else {
              document.documentElement.classList.remove('dark');
              document.documentElement.style.colorScheme = 'light';
            }
          } catch(e) {
            document.documentElement.classList.add('dark');
            document.documentElement.style.colorScheme = 'dark';
          }
        ` }} />

        {/* Color theme init — prevent flash on 7 color themes */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var ct = localStorage.getItem('archii-color-theme');
              if (ct && ct !== 'dorado') {
                document.documentElement.setAttribute('data-color-theme', ct);
              }
            } catch(e) {}
          })();
        ` }} />

        {/* Global error handler — catch and log client-side errors */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror = function(msg, url, line, col, err) {
            console.error('[Archii Global Error]', msg, url, line, col, err);
            return false;
          };
          window.addEventListener('unhandledrejection', function(e) {
            console.error('[Archii Unhandled Promise]', e.reason);
          });
        ` }} />
      </head>
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        {/* Skip to content — keyboard accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--af-accent)] focus:text-background focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none"
        >
          İçeriğe Atla
        </a>
        {/* Register Service Worker */}
        <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(e){ console.warn('[oxonom] SW registration failed:', e); });
            });
          }
        ` }} />

        {/* Listen for navigation messages from the service worker (notification click) */}
        <Script id="sw-message-listener" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function(event) {
              if (event.data && event.data.type === 'NAVIGATE') {
                // Dispatch a custom event that React components can listen to
                window.dispatchEvent(new CustomEvent('sw-navigate', {
                  detail: event.data
                }));
              }
            });
          }
        ` }} />
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
