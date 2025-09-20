# Telegram ↔ ChatGPT Bot (Next.js + Supabase RAG)

Next.js App Router project that connects a Telegram bot to OpenAI with Retrieval-Augmented Generation backed by Supabase + `pgvector`.
- Serverless API routes for Telegram webhook, webhook setup, and health checks
- Supabase schema for storing documents, metadata, and chunk embeddings
- Upload console at `/upload` to ingest text/markdown files per Telegram namespace
- OpenAI function calling so the assistant can look up files by name on demand (`/files` command too)

## 1) Prerequisites
- Node.js 18+ (for local development) and npm
- Supabase project with the SQL from [`sql/01_init_rag.sql`](sql/01_init_rag.sql) executed (enables `pgvector`, creates `rag.*` tables and RPC)
- Telegram bot token & secret (from **@BotFather**)
- OpenAI API key

## 2) Environment variables
Create `.env.local` (or configure on Vercel) with:

```
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
TELEGRAM_BOT_TOKEN=1234567890:ABCDEF...
TELEGRAM_SECRET_TOKEN=choose-a-strong-random-string
PUBLIC_BASE_URL=https://your-project.vercel.app
CHANNEL_ID=-1001234567890
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
ADMIN_PASSWORD=super-secret-password
ACCESS_TOKEN_TTL_HOURS=24
ALLOWED_CHAT_ID=-1001234567890
```

Only the Supabase **service role** key can bypass RLS for ingestion and retrieval—store it as a server-side secret only.

## 3) Local development
```bash
npm install
npm run dev
```
Open `http://localhost:3000` for the dashboard and `http://localhost:3000/upload` for the knowledge-base manager.

## 4) Deploy to Vercel
1. Push this repository to GitHub and import it into Vercel (or link directly).
2. Copy every environment variable above into **Project → Settings → Environment Variables**.
3. Deploy.
4. After deployment, run once:
   - `https://<your-domain>/api/set-webhook`

## 5) Admin login & access tokens
- Go to `https://<your-domain>/login`
- Enter `ADMIN_PASSWORD` to generate a temporary access token (stored in the browser and returned in the response)
- Include `Authorization: Bearer <token>` for every protected API call
- The upload UI reads the token from `localStorage`; other tools/scripts must supply the header themselves
- Middleware enforces the presence of the `accessToken` cookie on `/upload` and redirects to `/login` when missing

## 6) Uploading documents (RAG)
- Visit `https://<your-domain>/upload` after logging in (requires a stored access token)
- Enter the namespace you want to use (free-form, e.g. `Planen, Vorbereiten …` or `telegram:-1001234567890`)
- Upload plain-text/Markdown/JSON documents or specify a source URL for reference
- Each file is chunked, embedded with OpenAI, and stored in Supabase (`rag.files` + `rag.chunks`)
- After uploading, run `/namespace <name>` in Telegram with the exact same namespace so the bot uses the right context

## 7) Selecting document namespaces in Telegram
- The bot responds only in the chat whose ID is set via `ALLOWED_CHAT_ID`. Any other chat receives a polite rejection.
- `/namespace` – show the currently selected namespace and a list of available options (namespaces with uploaded files)
- `/namespace <name>` – set the active namespace for the chat; all answers will use only files within that namespace
- `/namespace clear` – remove the selection so the bot stops answering until a new namespace is chosen

## 8) Telegram commands & behaviour
- `/help` – quick reference
- `/reset` – stateless confirmation (clears nothing but informs user)
- `/files <query>` – list files in the active namespace whose names contain `<query>`
- Any other message triggers RAG retrieval confined to the active namespace. The assistant embeds the query, fetches the most similar chunks, and includes them in the OpenAI prompt. It can also call the `find_files_by_name` tool when the user asks about specific documents.
- The last 10 user/assistant messages in the chat are persisted (Supabase `rag.chat_history`) and sent with each new prompt for lightweight conversational memory.

## 9) API routes
- `POST /api/login` – exchange the admin password for a temporary access token
- `POST /api/telegram` – Telegram webhook (requires a valid access token or the Telegram secret header)
- `GET/POST /api/set-webhook` – register the webhook with Telegram (requires `Authorization: Bearer <token>`)
- `GET/POST /api/send-test` – send a test message to the configured channel (requires `Authorization: Bearer <token>`)
- `GET /api/health` – simple liveness probe (requires `Authorization: Bearer <token>`)
- `GET/POST /api/files` – list or ingest documents for a namespace (requires `Authorization: Bearer <token>`)

## 10) Supabase schema
Run [`sql/01_init_rag.sql`](sql/01_init_rag.sql) in the Supabase SQL editor. It:
- Enables the `vector` extension
- Creates `rag.files`, `rag.chunks`, `rag.chat_namespaces`, `rag.chat_history`, and `rag.auth_tokens`
- Adds a cosine-similarity RPC helper `rag.match_chunks` (and a public wrapper)
- Grants Supabase roles access to the new schema (ensure `rag` is added to **Project → Settings → API → Exposed schemas**)
- Turns on RLS so only the service role key can read/write

## 11) Notes
- The upload flow currently expects UTF-8 text/markdown/JSON files. Extend `app/api/files/route.js` if you need PDF parsing.
- Telegram responses are HTML-escaped and chunked to respect the 4096-character limit.
- Adjust `OPENAI_CHAT_MODEL` / `OPENAI_EMBEDDING_MODEL` to use different OpenAI models if desired.

Enjoy! 🚀
