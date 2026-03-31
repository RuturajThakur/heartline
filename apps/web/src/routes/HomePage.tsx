import { AuthPanel } from "../components/AuthPanel";

const cardClass =
  "rounded-[28px] border border-white/80 bg-[rgba(255,251,246,0.76)] p-7 shadow-[0_28px_70px_rgba(87,49,31,0.18)] backdrop-blur-[14px]";
const labelClass = "mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]";
export function HomePage() {
  return (
    <div className="grid gap-5">
      <section className="grid items-start gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="border-b border-white/40 pb-6">
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#db5b43]">
            Heartline
          </p>
          <h1 className="max-w-[10ch] font-serif text-[clamp(3.1rem,8vw,6.4rem)] leading-[0.92] text-[#24162d]">
            Build a dating app with an actual social graph.
          </h1>
        </div>

        <div className="lg:pt-1">
          <AuthPanel />
        </div>
      </section>

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
      </section>
    </div>
  );
}
