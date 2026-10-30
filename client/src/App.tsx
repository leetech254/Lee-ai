import { useCallback, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AccessGate from "./components/AccessGate";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
type AccessState = "loading" | "login" | "app";

function Router({ onSignOut }: { onSignOut: () => void }) {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"}>
        <Home onSignOut={onSignOut} />
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [access, setAccess] = useState<AccessState>("loading");
  const refreshAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/access/status");
      if (!response.ok) throw new Error("Access status unavailable");
      const status: { enabled: boolean; authenticated: boolean } =
        await response.json();
      setAccess(status.enabled && !status.authenticated ? "login" : "app");
    } catch {
      setAccess("login");
    }
  }, []);
  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);
  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        localStorage.getItem("vmtech-theme") || "system";
    };
    applyTheme();
    window.addEventListener("storage", applyTheme);
    return () => window.removeEventListener("storage", applyTheme);
  }, []);
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // Home manages the existing light/dark/system preference.
      >
        <TooltipProvider>
          <Toaster />
          {access === "loading" ? (
            <main className="access-loading" role="status" aria-live="polite">
              <span className="access-loading-mark" aria-hidden="true">
                V
              </span>
              <span>Preparing your workspace…</span>
            </main>
          ) : access === "login" ? (
            <AccessGate onAuthenticated={() => setAccess("app")} />
          ) : (
            <Router onSignOut={() => setAccess("login")} />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
