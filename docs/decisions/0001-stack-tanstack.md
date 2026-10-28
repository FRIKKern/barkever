# 0001 Stack: TanStack Start

Accepted 2026-10-28.

**Decision.** TanStack Start, Router and Query on React 19 and Vite. Node 22, pnpm, exact version pins.

**Why.** Barkpark Studio runs this stack against Barkpark with live editing; Pensum proves it for a fresh app. We copy their data layer instead of inventing one.

**Instead of.** Next.js (no Barkpark app uses it); plain JS like Barkdown (no router, no query cache).
