import UploadClient from "./UploadClient";

export const dynamic = "force-dynamic";

const isSupabaseConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default function UploadPage({ searchParams }) {
  const requestedNamespace = searchParams?.namespace?.trim?.() || "";

  return (
    <UploadClient
      initialNamespace={requestedNamespace}
      supabaseConfigured={isSupabaseConfigured}
    />
  );
}
