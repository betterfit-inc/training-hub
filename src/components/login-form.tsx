"use client";

import { useState, useTransition } from "react";
import { LogInIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { loginAction } from "@/lib/actions";

// The password login form. loginAction redirects to "/" on success (so the
// success branch never returns here); on a wrong password it returns the failure
// result, which is surfaced inline.
export function LoginForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">{t.login.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        <LogInIcon data-icon="inline-start" />
        {t.login.submit}
      </Button>
    </form>
  );
}
