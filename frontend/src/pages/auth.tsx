import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email"),
  organizationName: z.string().optional(),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[0-9]/, "Include a number"),
});
type LoginInput = z.infer<typeof loginSchema>;
type SignupInput = z.infer<typeof signupSchema>;

function PasswordInput({
  registration,
  error,
  placeholder,
}: {
  registration: UseFormRegisterReturn<"password">;
  error?: string;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor="password">Password</label>
      <div className="relative">
        <input id="password" type={show ? "text" : "password"} className="field pr-11" placeholder={placeholder} {...registration} />
        <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SignInPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const submit = async (input: LoginInput) => {
    try {
      const { user } = await authApi.login(input);
      setUser(user);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);
      navigate(location.state?.from?.pathname || "/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed");
    }
  };
  return <div className="rounded-[30px] border border-black/10 bg-white/65 p-6 shadow-[0_30px_90px_rgba(11,23,20,.09)] backdrop-blur-xl sm:p-8"><p className="eyebrow text-emerald-700">Welcome back / 01</p><h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[.95] tracking-[-.05em]">Enter your<br/>evidence workspace.</h1><p className="mt-4 text-sm leading-6 text-stone">Continue building a credible record of your impact.</p><form className="mt-8 space-y-5" onSubmit={handleSubmit(submit)}><div><label className="label" htmlFor="email">Work email</label><input id="email" type="email" autoComplete="email" className="field" placeholder="you@organization.org" {...register("email")} />{errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}</div><PasswordInput registration={register("password")} error={errors.password?.message} placeholder="••••••••" /><Button className="w-full rounded-full" size="lg" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" size={17} />}Sign in</Button></form><p className="mt-7 text-center text-sm text-stone">New to FieldProof? <Link className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-4" to="/sign-up">Create an account</Link></p></div>;
}

export function SignUpPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });
  const submit = async (input: SignupInput) => {
    try {
      const { user } = await authApi.register(input);
      setUser(user);
      toast.success("Your workspace is ready");
      navigate("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account creation failed");
    }
  };
  return <div className="rounded-[30px] border border-black/10 bg-white/65 p-6 shadow-[0_30px_90px_rgba(11,23,20,.09)] backdrop-blur-xl sm:p-8"><p className="eyebrow text-emerald-700">Start documenting / 01</p><h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[.95] tracking-[-.05em]">Create your<br/>evidence layer.</h1><p className="mt-4 text-sm leading-6 text-stone">Your first project is only a minute away.</p><form className="mt-8 space-y-4" onSubmit={handleSubmit(submit)}><div><label className="label" htmlFor="name">Full name</label><input id="name" autoComplete="name" className="field" placeholder="Aarav Mehta" {...register("name")} />{errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>}</div><div><label className="label" htmlFor="org">Organization <span className="normal-case tracking-normal text-stone/60">(optional)</span></label><input id="org" autoComplete="organization" className="field" placeholder="Green Earth Foundation" {...register("organizationName")} /></div><div><label className="label" htmlFor="email">Work email</label><input id="email" type="email" autoComplete="email" className="field" placeholder="you@organization.org" {...register("email")} />{errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}</div><PasswordInput registration={register("password")} error={errors.password?.message} placeholder="8+ characters" /><Button className="w-full rounded-full" size="lg" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" size={17} />}Create account</Button></form><p className="mt-6 text-center text-sm text-stone">Already have an account? <Link className="font-bold text-ink underline decoration-lime decoration-2 underline-offset-4" to="/sign-in">Sign in</Link></p></div>;
}
