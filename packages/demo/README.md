# demo

Private workspace package — not published. A Vite + React app that consumes
[`react-virtual-dnd-table`](../react-virtual-dnd-table) for real (via npm workspaces), rendering a
10,000-row table with TanStack Table + TanStack Virtual, to prove the hook works end to end.

```bash
npm install   # from the repo root
npm run dev   # from the repo root, or `npm run dev` here directly
```

`e2e/drag-reorder.mjs` is a Playwright smoke test (not a formal test suite) that drags the
first row past the visible viewport, forcing auto-scroll into rows that aren't mounted yet,
and checks that the full 10,000-row array comes out with no duplicates or gaps. Run a dev
server on `:5180` first, then `node e2e/drag-reorder.mjs`.
