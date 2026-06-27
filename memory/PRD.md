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

## Out of scope (for v1)
- Push notifications (intended for later, requires native build)
- Multiple colleges (only UPES for now; backend supports adding more via COLLEGES list)
- Voice / image messages
- Block / report flow
- Group creation by users (only seeded campus lounge for now)

## Design
- Personality: "Tactile / Playful Light" — warm oat surface, coral / marigold / mint accents
- Bottom-tab navigation: Chats · Discover · Friends · Profile
- Chunky rounded buttons (pill), 56pt list rows, glass-style sticky headers
