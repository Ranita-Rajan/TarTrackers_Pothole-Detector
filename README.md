Tar Tracker

Tar Tracker is a real-time pothole detector. It uses Yolo based custom trained ML model (edge inference) and a modern web stack to help users report and improve road maintenance.

Objectives

1. High-Accuracy Real-time Detection - Create and use a high-precision ONNX model for real-time pothole detection using on-device machine learning to ensure quick, accurate, and reliable performance.
2. High-Fidelity Geospatial Mapping - Use accurate GPS tracking along with an interactive map (Mapbox GL) and heatmaps to precisely mark defects and show where damage is most common, giving useful insights for decision-making.
3. Robust, Scalable Infrastructure - Build a secure and scalable app using React/TypeScript, with Firebase for storing data and managing users, and Netlify Functions for handling backend tasks without a server.
4. Proactive Maintenance Shift - Change from fixing problems only after they happen to using data to plan maintenance ahead of time, which helps use resources better and schedule repairs more efficiently.
5. Enhance Public Safety and Efficiency - Reduce the time it takes to respond to road issues and improve traffic management by lowering vehicle damage and making repair processes more effective.

Technology Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- AI/ML: ONNX Runtime Web, YOLOv8 model
- Mapping: Mapbox GL, react-map-gl
- Backend: Supabase (Auth, Postgres, PostGIS), Netlify Functions
- State: React Query (TanStack Query)
- Routing: React Router v6

Project Structure

```
src/
   components/      # UI and app components
   contexts/        # React contexts (Auth, etc.)
   hooks/           # Custom React hooks
   lib/             # Core logic: fingerprinting, geospatial, reporting, auth
   pages/           # Route pages (Index, Profile, etc.)
   workers/         # Web Workers for ML inference
public/
   models/          # ONNX model files
   onnxruntime/     # ONNX runtime WASM files
netlify/
   functions/       # Serverless backend functions
scripts/           # Build and env scripts
[config files]     # Vite, Tailwind, Netlify, etc.
```

Custom Technology Highlights

- Pothole fingerprinting: Tracks each pothole by position, size, aspect ratio, and appearance across frames
- Deduplication logic: Uses quantized geospatial cells and visual similarity to avoid double-counting
- Offline queue: IndexedDB stores pending reports, syncing automatically when online
- Supabase RLS: All data protected by row-level security
- Mapbox token security: Tokens are proxied via serverless functions, never exposed directly

Installation

```
npm install
# or
bun install
```

Development

```
npm run dev
# or
bun dev
# App runs at http://localhost:8080
```

Building

```
npm run build
npm run build:dev
npm run preview
```

Deployment

Use Netlify for serverless functions and static hosting. Set environment variables in the Netlify dashboard. The project is configured with `netlify.toml` for automatic builds.

Key Configuration Files

- `vite.config.ts` - Vite bundler configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `netlify.toml` - Netlify deployment settings
- `components.json` - shadcn/ui components config

Scripts

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run build:dev` - Development build
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with camera access

