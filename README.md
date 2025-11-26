# Mediscan AI

A monorepo with a Node/Express API and a React + Vite web frontend.

## Prerequisites

- Node.js >= 18 < 21
- npm >= 9

## Getting Started

### API (Node/Express)

1. Open a terminal and navigate to the API folder:
   - `cd api`
2. Create your environment file from the example:
   - PowerShell: `Copy-Item .env.example .env`
   - Bash: `cp .env.example .env`
3. Install dependencies:
   - `npm install`
4. Start the API in development mode:
   - `npm run dev`
5. Verify it is running:
   - Visit `http://localhost:8080/healthz`

### Web (React + Vite)

1. Open another terminal and navigate to the web folder:
   - `cd web`
2. Install dependencies:
   - `npm install`
3. Start the web dev server:
   - `npm run dev`
4. Open the app in your browser:
   - The terminal will display a local URL, usually `http://localhost:5173`

## Project Structure

```
mediscan-ai/
  api/     # Node/Express server
  web/     # React + Vite frontend
```


