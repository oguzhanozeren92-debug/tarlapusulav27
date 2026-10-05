import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// StackBlitz/WebContainer preview içinde ArcGIS raster karoları doğrudan
// üçüncü taraf origin'den yüklenirken tarayıcı güvenlik politikalarına
// takılabildiği için uydu karolarını Vite üzerinden aynı-origin proxy'liyoruz.
export default defineConfig({
  plugins: [react()],
  server: {
    // StackBlitz/WebContainer önizlemesinde HMR websocket'i 404/ERR_CONNECTION_REFUSED
    // üretebiliyor. Son test aşamasında konsolu temiz tutmak için HMR kapalı.
    // Production build etkilenmez; kod değişiminden sonra önizlemeyi manuel yenile.
    hmr: false,
    proxy: {
      '/arcgis-world-imagery': {
        target: 'https://services.arcgisonline.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(
            /^\/arcgis-world-imagery/,
            '/ArcGIS/rest/services/World_Imagery/MapServer',
          ),
      },
    },
  },
});
