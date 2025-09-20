export const metadata = {
  title: "Telegram GPT Bot",
  description: "Minimal Next.js control panel for the Telegram ChatGPT bot"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
