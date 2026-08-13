import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    base: '/',
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            devOptions: {
                enabled: false, // Disabled in development to prevent API caching issues
                type: "module",
            },
            includeAssets: [
                "favicon.png",
                "apple-touch-icon.png",
                "maskable-icon-512.png",
                "offline.html"
            ],
            manifest: {
                name: "EcomOS",
                short_name: "EcomOS",
                description: "Modern CRM for E-commerce",
                display: "standalone",
                orientation: "portrait",
                start_url: "/",
                scope: "/",
                theme_color: "#0f172a",
                background_color: "#0f172a",
                icons: [
                    { src: "/icon-72.png", sizes: "72x72", type: "image/png" },
                    { src: "/icon-96.png", sizes: "96x96", type: "image/png" },
                    { src: "/icon-128.png", sizes: "128x128", type: "image/png" },
                    { src: "/icon-144.png", sizes: "144x144", type: "image/png" },
                    { src: "/icon-152.png", sizes: "152x152", type: "image/png" },
                    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/icon-384.png", sizes: "384x384", type: "image/png" },
                    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
                    { src: "/maskable-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable any" }
                ]
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
                maximumFileSizeToCacheInBytes: 4000000,
                cleanupOutdatedCaches: true,
                // Skip Supabase API calls - always use network
                navigateFallback: null,
                skipWaiting: true,
                runtimeCaching: [
                    {
                        // Skip all Supabase API calls
                        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                        handler: "NetworkOnly",
                        options: {
                            cacheName: "supabase-api-bypass",
                            expiration: {
                                maxEntries: 0,
                            },
                        },
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*$/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "google-fonts-cache",
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365,
                            },
                        },
                    },
                    {
                        urlPattern: /^https?:.*\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "image-cache",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 30 * 24 * 60 * 60,
                            },
                        },
                    },
                    {
                        urlPattern: /^https?:.*\.(?:js|css)$/i,
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "static-resources",
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 30 * 24 * 60 * 60,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-supabase': ['@supabase/supabase-js'],
                    'vendor-charts': ['recharts'],
                    'vendor-icons': ['lucide-react'],
                    'vendor-utils': ['xlsx', 'jszip'],
                },
            },
        },
    },
    server: {
        port: 8080,
        proxy: {
            '/api-ozon': {
                target: 'https://api.ozonexpress.ma',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api-ozon/, ''); }
            }
        }
    },
});
