-- Enable pgvector (in Supabase: SQL Editor → run this file)
create extension if not exists vector;

create schema if not exists rag;

-- Files metadata
create table if not exists rag.files (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  source_type text check (source_type in ('upload','url')) default 'upload',
  source_url text,
  file_name text,
  mime_type text,
  size_bytes int,
  tokens int,
  created_at timestamptz not null default now()
);

-- Text chunks with embeddings
create table if not exists rag.chunks (
  id bigserial primary key,
  file_id uuid not null references rag.files(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  token_count int,
  created_at timestamptz not null default now()
);

-- Chat namespace preferences (per Telegram chat)
create table if not exists rag.chat_namespaces (
  chat_id text primary key,
  namespace text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat history (chronological log of messages per chat)
create table if not exists rag.chat_history (
  id bigserial primary key,
  chat_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Access tokens (hashed)
create table if not exists rag.auth_tokens (
  token_hash text primary key,
  issued_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_chunks_file_order on rag.chunks(file_id, chunk_index);
create index if not exists idx_chunks_embedding on rag.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_history_chat_created on rag.chat_history(chat_id, created_at desc);

-- Similarity search function (cosine). Returns most similar chunks within a namespace.
create or replace function rag.match_chunks(
  query_embedding vector(1536),
  match_count int,
  ns text,
  min_similarity float default 0.0
)
returns table (
  id bigint,
  file_id uuid,
  content text,
  similarity float,
  file_namespace text,
  file_name text,
  source_type text,
  source_url text,
  mime_type text,
  size_bytes int,
  tokens int,
  file_created_at timestamptz
)
language sql stable
as $$
  select
    c.id,
    c.file_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    f.namespace as file_namespace,
    f.file_name,
    f.source_type,
    f.source_url,
    f.mime_type,
    f.size_bytes,
    f.tokens,
    f.created_at as file_created_at
  from rag.chunks c
  join rag.files f on f.id = c.file_id
  where f.namespace = ns
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count
$$;

-- Optional RLS (service role bypasses RLS)
alter table rag.files enable row level security;
alter table rag.chunks enable row level security;
alter table rag.chat_namespaces enable row level security;
alter table rag.chat_history enable row level security;
alter table rag.auth_tokens enable row level security;

-- Grants for Supabase roles (service role needs insert/update access and sequence usage).
grant usage on schema rag to service_role, authenticated, anon;
grant select, insert, update, delete on rag.files to service_role, authenticated;
grant select, insert, update, delete on rag.chunks to service_role, authenticated;
grant select, insert, update, delete on rag.chat_namespaces to service_role, authenticated;
grant select, insert, update, delete on rag.chat_history to service_role, authenticated;
grant select, insert, update, delete on rag.auth_tokens to service_role, authenticated;
grant usage, select on all sequences in schema rag to service_role, authenticated;

alter default privileges in schema rag grant select, insert, update, delete on tables to service_role, authenticated;
alter default privileges in schema rag grant usage, select on sequences to service_role, authenticated;

grant execute on function rag.match_chunks(vector(1536), int, text, float) to service_role, authenticated;

-- Convenience views/functions in the public schema so Supabase REST can access them without exposing the rag schema.
create or replace view public.rag_files as
  select * from rag.files;

create or replace view public.rag_chunks as
  select * from rag.chunks;

create or replace view public.rag_chat_namespaces as
  select * from rag.chat_namespaces;

create or replace view public.rag_chat_history as
  select * from rag.chat_history;

create or replace view public.rag_auth_tokens as
  select * from rag.auth_tokens;

grant select, insert, update, delete on public.rag_files to service_role, authenticated;
grant select, insert, update, delete on public.rag_chunks to service_role, authenticated;
grant select, insert, update, delete on public.rag_chat_namespaces to service_role, authenticated;
grant select, insert, update, delete on public.rag_chat_history to service_role, authenticated;
grant select, insert, update, delete on public.rag_auth_tokens to service_role, authenticated;

create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int,
  ns text,
  min_similarity float default 0.0
)
returns table (
  id bigint,
  file_id uuid,
  content text,
  similarity float,
  file_namespace text,
  file_name text,
  source_type text,
  source_url text,
  mime_type text,
  size_bytes int,
  tokens int,
  file_created_at timestamptz
)
language sql stable
as $$
  select * from rag.match_chunks(query_embedding, match_count, ns, min_similarity);
$$;

grant execute on function public.match_chunks(vector(1536), int, text, float) to service_role, authenticated;
