export const metadata = { title: "AI Bosses", description: "Human-in-the-loop AI workforce for small businesses" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The operator pages set dark text explicitly and assume a white page.
          Without a background here the body stays transparent, so a browser
          set to prefer dark renders dark ink on a dark canvas and the screens
          are unreadable — a demo laptop's colour setting should not be able to
          do that. The landing page paints its own dark background over this. */}
      <body
        style={{
          fontFamily: "system-ui, sans-serif", margin: 0,
          background: "#FFFFFF", color: "#14171A",
        }}
      >
        {children}
      </body>
    </html>
  );
}
