import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_INFO } from "@/lib/roles";

const strong = (value: string) => value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);

/** Opened from the emailed link: choose a password, land in the workspace. Also used for password resets. */
export function SetupPage() {
  const { token = "" } = useParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const preview = useQuery({ queryKey: ["setup", token], queryFn: () => authApi.setupPreview(token), retry: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const complete = useMutation({
    mutationFn: () => authApi.completeSetup(token, password),
    onSuccess: (session) => {
      setSession(session);
      toast.success(`Welcome, ${session.user.name.split(" ")[0]}`);
      navigate("/app");
    },
    onError: (error) => toast.error(error.message),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (strong(password) && password === confirm) complete.mutate(); };
  const card = "rounded-[30px] border border-black/10 bg-white/65 p-6 shadow-[0_30px_90px_rgba(11,23,20,.09)] backdrop-blur-xl sm:p-8";
  if (preview.isLoading) return <div className={card}><div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-stone" /></div></div>;
  if (preview.isError || !preview.data) return (
    <div className={card}>
      <p className="eyebrow text-red-700">Link not valid</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[.95] tracking-[-.05em]">This link has expired<br/>or was already used.</h1>
      <p className="mt-4 text-sm leading-6 text-stone">Ask the person who added you to send a new one, or <Link to="/forgot-password" className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-4">request a password reset</Link> if you already have an account.</p>
    </div>
  );
  const { setup } = preview.data;
  return (
    <div className={card}>
      <p className="eyebrow text-emerald-700">{setup.organization ? "Welcome to the team" : "Choose a new password"}</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[.95] tracking-[-.05em]">Hi {setup.name.split(" ")[0]},<br/>choose your password.</h1>
      <div className="mt-5 space-y-1 rounded-2xl bg-fog p-4 text-sm">
        <p className="flex items-center gap-2 text-stone"><Mail size={15} />{setup.email}</p>
        {setup.organization && <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-700" />{setup.organization}{setup.role ? ` · ${ROLE_INFO[setup.role].label}` : ""}</p>}
      </div>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="setup-password">Password</label>
          <div className="relative">
            <input id="setup-password" type={show ? "text" : "password"} autoComplete="new-password" className="field pr-11" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters, a capital letter and a number" />
            <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          {password && !strong(password) && <p className="mt-1.5 text-xs text-amber-700">Use at least 8 characters with a capital letter and a number.</p>}
        </div>
        <div>
          <label className="label" htmlFor="setup-confirm">Confirm password</label>
          <input id="setup-confirm" type={show ? "text" : "password"} autoComplete="new-password" className="field" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          {confirm && confirm !== password && <p className="mt-1.5 text-xs text-red-600">Passwords do not match.</p>}
        </div>
        <Button className="w-full rounded-full" size="lg" disabled={!strong(password) || password !== confirm || complete.isPending}>
          {complete.isPending && <Loader2 className="animate-spin" size={17} />}Save password and sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-stone">Afterwards, use this email and password on the web and in the FieldProof mobile app.</p>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => authApi.forgotPassword(email.trim()), onError: (error) => toast.error(error.message) });
  const card = "rounded-[30px] border border-black/10 bg-white/65 p-6 shadow-[0_30px_90px_rgba(11,23,20,.09)] backdrop-blur-xl sm:p-8";
  return (
    <div className={card}>
      <p className="eyebrow text-emerald-700">Account recovery</p>
      <h1 className="mt-4 font-display text-3xl font-extrabold uppercase leading-[.95] tracking-[-.05em]">Reset your<br/>password.</h1>
      {request.data ? (
        <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">{request.data.message} The link works once and expires in 2 hours.</p>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); if (email.trim()) request.mutate(); }}>
          <div><label className="label" htmlFor="forgot-email">Email</label><input id="forgot-email" type="email" autoComplete="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@organization.org" /></div>
          <Button className="w-full rounded-full" size="lg" disabled={!email.trim() || request.isPending}>{request.isPending && <Loader2 className="animate-spin" size={17} />}Email me a reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-stone"><Link className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-4" to="/sign-in">Back to sign in</Link></p>
    </div>
  );
}
