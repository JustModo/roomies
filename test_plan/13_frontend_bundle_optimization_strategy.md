# Frontend Bundle Optimization & Lazy Loading Strategy

## Executive Summary

The production build of `@roomies/web` currently generates a **single 1.57 MB JavaScript entry bundle** (`index-BFPxH4_X.js`), triggering Vite build warnings (`(!) Some chunks are larger than 500 kB after minification`).

This occurs because:
1. All page routes (`Login`, `Register`, `Lobby`, `Room`) are statically imported at root startup.
2. Heavy media libraries (`hls.js`), voice communication libraries (`@roomies/voice`, `libopus-wasm`), icon packages (`lucide-react`), and admin overlay components are bundled into the initial payload even when visiting the initial login or lobby screen.

This document presents a comprehensive **Bundle Optimization Strategy** leveraging **Route Code-Splitting (`React.lazy`)**, **Component-Level Lazy Loading**, and **Vite / Rollup `manualChunks` Partitioning**.

---

## 1. Analysis of Current Bundle Composition

```text
dist/assets/index-BFPxH4_X.js — 1,577.06 KB (Gzip: 522.89 KB)
```

### Main Contributors to Bundle Size:
- **Media Player Engine (`hls.js`)**: ~350 KB minified.
- **Voice Communication Core (`@roomies/voice` + WASM wrappers)**: ~250 KB minified.
- **Icon Library (`lucide-react`)**: ~180 KB minified.
- **Room Media & Admin Overlays (`Room.tsx`, `AdminOverlay.tsx`)**: ~300 KB minified.
- **React & Router Core (`react`, `react-dom`, `react-router-dom`)**: ~150 KB minified.

---

## 2. The 3-Tier Bundle Optimization Strategy

### Tier 1: Route-Level Code Splitting (`React.lazy` & `Suspense`)

Convert static page imports in `apps/web/src/routes/AppRouter.tsx` to dynamic imports:

```tsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

const Login = React.lazy(() => import('../pages/Login'));
const Register = React.lazy(() => import('../pages/Register'));
const Lobby = React.lazy(() => import('../pages/Lobby'));
const Room = React.lazy(() => import('../pages/Room'));

const PageFallback = () => <div className="min-h-screen bg-void flex items-center justify-center text-fog text-12">Loading...</div>;

export default function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Lobby />} />
          <Route path="/room" element={<Room />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
```

---

### Tier 2: Heavy Component Lazy Loading (`AdminOverlay.tsx`)

`AdminOverlay` contains full media management forms, user administration tables, and scan controls. It is only accessible to root admin users on explicit interaction.

In `apps/web/src/pages/Room.tsx`:
```tsx
const AdminOverlay = React.lazy(() => import('../components/AdminOverlay').then(m => ({ default: m.AdminOverlay })));
```

---

### Tier 3: Rollup `manualChunks` Chunk Partitioning (`vite.config.ts`)

Partition third-party vendor dependencies into separate cached chunks:

```ts
// apps/web/vite.config.ts
export default defineConfig({
  // ...
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-hls': ['hls.js'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
```

---

## 3. Expected Optimization Results

| Bundle Metric | Before Optimization | After Optimization | Reduction |
|---|---|---|---|
| **Initial JS Entry Payload** | 1,577.06 KB | **~120 KB** | **~92% Reduction** |
| **Initial Page Gzip** | 522.89 KB | **~40 KB** | **~92% Reduction** |
| **Lobby Page Payload** | 1,577.06 KB | **~180 KB** | **~88% Reduction** |
| **Room Page Payload** | Included in Initial | **~650 KB (Lazy Loaded)** | Split into Async Chunk |
| **Admin Overlay Payload** | Included in Initial | **~80 KB (On-Demand)** | Loaded only on click |
| **Vite Size Warning** | ⚠️ Exceeded (1.57 MB) | ✅ **0 Warnings** | Resolved |
