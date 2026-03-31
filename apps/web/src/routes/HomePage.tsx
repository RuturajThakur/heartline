import { Link } from "@tanstack/react-router";
import { AuthPanel } from "../components/AuthPanel";

const cardClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
const primaryButtonClass =
  "inline-flex w-fit items-center justify-center rounded-full border border-[#24162d] bg-[#24162d] px-5 py-3 text-sm font-semibold text-white shadow-[0_28px_70px_rgba(87,49,31,0.18)] transition hover:-translate-y-0.5";
const secondaryButtonClass =
  "inline-flex w-fit items-center justify-center rounded-full border border-[#24162d]/10 bg-white/60 px-5 py-3 text-sm font-semibold text-[#24162d] transition hover:-translate-y-0.5";

export function HomePage() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <section className={cardClass}>
        <p className={labelClass}>Positioning</p>
        <h2 className="max-w-[12ch] font-serif text-[clamp(1.8rem,3vw,2.8rem)] leading-tight text-[#24162d]">
          Not another swipe app.
        </h2>
        <p className="mt-4 max-w-[58ch] text-base leading-7 text-[#65556c]">
          Heartline is designed as a social product where dating emerges through
          prompts, circles, short updates, reactions, and eventually private
          chemistry. The goal is to make discovery feel human before it feels
          transactional.
        </p>

        <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
          <Link className={secondaryButtonClass} to="/onboarding">
            Start onboarding
          </Link>
          <Link className={primaryButtonClass} to="/product">
            Explore the MVP
          </Link>
          <a className={secondaryButtonClass} href="http://localhost:3001/health">
            API health
          </a>
        </div>
      </section>

      <section className={cardClass}>
        <p className={labelClass}>Why this stack</p>
        <ul className="space-y-3 pl-5 text-base leading-7 text-[#65556c] marker:text-[#db5b43]">
          <li>Vite keeps the frontend lean and fast.</li>
          <li>TanStack Router and Query give us typed routes and server state.</li>
          <li>Fastify gives us a clean backend surface for feeds, auth, and chat.</li>
          <li>The app stays self-hostable from day one.</li>
        </ul>
      </section>

      <AuthPanel />
    </div>
  );
}
