import { LockKeyhole, LogIn } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { configureApiClient, fetchSummary, ApiError } from "../api/client";
import { clearStoredToken, readStoredToken, writeStoredToken } from "./token";

interface TokenGateProps {
  children: ReactNode;
}

export function TokenGate({ children }: TokenGateProps) {
  const [token, setToken] = useState(() => readStoredToken());
  const [mode, setMode] = useState<"checking" | "authenticated" | "needs-token">("checking");
  const [error, setError] = useState<string | null>(null);

  const clearToken = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setMode("needs-token");
  }, []);

  useEffect(() => {
    configureApiClient({
      getToken: () => token,
      onUnauthorized: clearToken,
    });
  }, [clearToken, token]);

  const probe = useCallback(
    async (candidate: string | null) => {
      configureApiClient({
        getToken: () => candidate,
        onUnauthorized: clearToken,
      });
      try {
        await fetchSummary({}, { suppressUnauthorized: true });
        if (candidate) {
          writeStoredToken(candidate);
        }
        setToken(candidate);
        setError(null);
        setMode("authenticated");
      } catch (probeError) {
        if (probeError instanceof ApiError && probeError.status === 401) {
          setError(candidate ? "Token rejected" : null);
          setMode("needs-token");
          return;
        }
        setError("API unavailable");
        setMode("authenticated");
      }
    },
    [clearToken],
  );

  useEffect(() => {
    void probe(token);
  }, [probe, token]);

  if (mode === "checking") {
    return <div className="gate-screen">Checking dashboard access...</div>;
  }

  if (mode === "needs-token") {
    return <TokenForm error={error} onSubmit={(candidate) => void probe(candidate)} />;
  }

  return <>{children}</>;
}

function TokenForm({ error, onSubmit }: { error: string | null; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  }

  return (
    <main className="gate-screen">
      <form className="token-form" onSubmit={submit}>
        <div className="gate-mark">
          <LockKeyhole size={26} aria-hidden="true" />
        </div>
        <h1>TokenViewer</h1>
        <label>
          <span>Dashboard token</span>
          <input
            type="password"
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? "true" : "false"}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit">
          <LogIn size={16} aria-hidden="true" />
          Enter
        </button>
      </form>
    </main>
  );
}

