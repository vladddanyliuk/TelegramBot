const cardStyle = {
  maxWidth: "640px",
  margin: "64px auto",
  padding: "32px",
  borderRadius: "16px",
  border: "1px solid #e0e0e0",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
  background: "#ffffff"
};

export default function Home() {
  return (
    <main style={{ padding: "32px" }}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Telegram ChatGPT Bot</h1>
        <p>
          Deploy this Next.js app to Vercel, set the webhook once, and Telegram updates will be
          handled by the serverless route at <code>/api/telegram</code>.
        </p>
        <ol>
          <li>Define the environment variables in Vercel or locally via <code>.env</code>.</li>
          <li>Log in at <code>/login</code> to generate an access token for protected routes.</li>
          <li>Visit <code>/api/set-webhook</code> once (GET) after deploying.</li>
          <li>Upload documents at <code>/upload</code>, then choose the same namespace inside Telegram with <code>/namespace &lt;name&gt;</code>.</li>
        </ol>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Routes are all dynamic and respond with JSON. This dashboard is intentionally minimal.
        </p>
        <p style={{ marginTop: "24px" }}>
          Need to manage your knowledge base? Visit <a href="/upload">/upload</a> to ingest files
          into Supabase for retrieval-augmented responses after authenticating via <a href="/login">/login</a>, then switch namespaces from Telegram with
          <code>/namespace</code>.
        </p>
      </section>
    </main>
  );
}
