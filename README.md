# Collaboard Project

A real-time collaborative whiteboard application that allows multiple users to create, edit, and share notes and sketches in real-time.

## Overview

Collaboard is a web-based collaborative canvas where users can:
- Create and manage boards
- Add sticky notes and sketch content
- Collaborate with other users in real-time
- See live presence and updates from team members
- Undo/redo and track note history
- Organize and manage board members

## Screenshots

![Screenshot 1](collabboard_front/src/images/img1.png)

![Screenshot 2](collabboard_front/src/images/img2.png)

![Screenshot 3](collabboard_front/src/images/img3.png)

## Tech Stack

### Frontend (`collabboard_front/`)

- **Next.js 14** — React framework with SSR and static optimization
- **TypeScript** — Type-safe JavaScript
- **Tailwind CSS** — Utility-first styling
- **Zustand** — Lightweight state management
- **Socket.IO Client** — Real-time bidirectional communication with WebSocket fallback
- **React Hook Form + Zod** — Form handling and validation
- **Axios** — HTTP client for API requests
- **Framer Motion** — Smooth animations and transitions
- **React Query** — Server state management

### Backend (`collabboard_api/`)

- **NestJS** — Progressive Node.js framework with dependency injection
- **TypeScript** — Type-safe backend code
- **PostgreSQL** — Relational database with Row-Level Security (RLS)
- **Socket.IO** — Real-time event-driven communication via WebSocket
- **JWT Authentication** — Secure token-based auth with Google OAuth support
- **Passport.js** — Authentication middleware
- **Typeorm** — ORM for database operations

### Infrastructure

- **Docker & Docker Compose** — Containerized deployment
- **PostgreSQL 16 Alpine** — Lightweight database container

## Real-time Features

**WebSocket Communication:**
- Uses **Socket.IO** for real-time collaboration
- Enables live presence detection (who's online)
- Instant note creation, updates, and deletions across all connected clients
- Real-time cursor/activity tracking
- Conflict resolution for concurrent edits

**Presence System:**
- Tracks active board members
- Shows online/offline status
- Real-time activity updates

## Project Structure

This repository contains a collaborative whiteboard application with separate API and frontend services:

- `collabboard_api/` — NestJS backend service
- `collabboard_front/` — Next.js frontend service
- `docker-compose.yml` — root Compose file that starts `postgres`, `api`, and `front`

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development without Docker)

### Using Docker Compose

Use the root `docker-compose.yml` to launch the full stack from the repository root:

```bash
cd "c:\Users\ASUS\Projects\Collaboard project"
docker compose up --build
```

The Compose file builds and starts:

- **postgres** — PostgreSQL database service on port 5432
- **api** — NestJS backend service on port 3050
- **front** — Next.js frontend service on port 3000

Once running, access the app at `http://localhost:3000`

### Environment Configuration

**Frontend** (`collabboard_front/.env.local`):
- `NEXT_PUBLIC_API_URL` — API endpoint (e.g., `http://localhost:3050/api`)
- `NEXT_PUBLIC_SOCKET_URL` — WebSocket server URL (e.g., `http://localhost:3050`)

**Backend** — configured via `docker-compose.yml`:
- Database credentials and connection
- JWT secret and expiry
- Google OAuth settings (optional)
- CORS origin

## Database

PostgreSQL with:
- Row-Level Security (RLS) for multi-tenant data isolation
- Real-time notifications via `pg_notify` for cross-connection updates
- Migrations in `collabboard_api/migrations/`

## Key Features

- ✅ Real-time collaborative editing
- ✅ WebSocket-powered live updates
- ✅ User authentication with JWT + Google OAuth
- ✅ Board and member management
- ✅ Note history and conflict detection
- ✅ Responsive design with Tailwind CSS
- ✅ Type-safe full-stack with TypeScript

## Development

For local development without Docker:

**Backend:**
```bash
cd collabboard_api
npm install
npm run dev
```

**Frontend:**
```bash
cd collabboard_front
npm install
npm run dev
```

## Troubleshooting

If Docker Compose cannot pull `postgres:16-alpine`:
- Confirm Docker daemon is running
- Check internet connectivity to Docker Hub
- Verify no proxy or firewall blocks image pulls

## Notes

The full stack can be deployed using the root `docker-compose.yml` file. For production deployment, update environment variables and enable database SSL encryption.

# Github CI
[![CI](https://github.com/RuckerHans/Collabboard/actions/workflows/ci.yml/badge.svg)](https://github.com/RuckerHans/Collabboard/actions/workflows/ci.yml)