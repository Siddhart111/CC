# Campus Chat — Product Requirements

## Vision
Anonymous, college-only chat. Students verify with their UPES college email, get an anonymous handle, and chat in DMs + the campus lounge. No real identity is ever shown to peers.

## Stack
- **Frontend**: Expo SDK 54 (React Native), expo-router, React 19
- **Backend**: FastAPI + Motor (MongoDB async)
- **Realtime**: FastAPI WebSocket (`/api/ws?token=...`)
- **Auth**: Email + password (JWT, 30-day TTL), college-domain validated

## Core features
1. **Signup / Login** — JWT auth, only `@upes.ac.in` / `@stu.upes.ac.in` / `@ddn.upes.ac.in` emails accepted
2. **Anonymous identity** — auto-generated handles (e.g. `BlueTiger42`); user can shuffle and/or upload a profile pic (base64)
3. **Campus Lounge** — every UPES user auto-joins the UPES Lounge group on signup
4. **DMs** — between any two users in the same college; opens a per-pair chat room
5. **Friend requests** — send / accept / reject, with realtime notification over WS
6. **Discover** — search/list other anonymous students in your college
7. **Realtime chat** — WS broadcasts new messages to all chat members instantly

## Confessions Wall (v2)
- New `Wall` bottom-tab — anonymous, one-to-many, college-scoped board with **no replies**.
- Each post gets a rotating disguise mask (e.g. `Anon Falcon`) and accent color — different from the user's main handle so confessions can't be linked back.
- Backend stores `author_id` privately for moderation/deletion but never returns it in any response.
- Endpoints: `POST/GET /api/confessions`, `POST /api/confessions/{id}/heart` (toggle), `DELETE /api/confessions/{id}` (author only).
- Sort modes: `new` (default, recency) and `hot` (heart count then recency).
- Mood tags: lol · spicy · tea · love · vent · wholesome.

## Dark Theme (v2)
- Full app-wide dark theme; toggle lives in **Profile → Appearance**.
- Defaults to **system** colour scheme; manual choice persists in storage (`cc_theme_mode`).
- Implemented via `ThemeProvider` + `useTheme()`; every screen rebuilds styles via `makeStyles(colors)`.

## Credit
- "Created by Siddharth Nishad" appears on the Welcome screen and at the bottom of the Profile screen.

## Out of scope (for v1)
