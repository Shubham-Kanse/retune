import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Brain,
  ClipboardCheck,
  FileText,
  Gauge,
  Mail,
  Sparkles,
} from "lucide-react";

const steps = [
  { title: "Paste the job", body: "Drop a JD, a URL, or describe the role in plain English." },
  { title: "We tune from your profile", body: "Retuned reads your career brain - experience, evidence, links - and rewrites for the role." },
  { title: "Export & apply", body: "Get a tailored resume, cover letter, ATS read‑out, and a focused application strategy." },
];

const features = [
  { icon: FileText, title: "Tailored resume", body: "Rewritten bullets, reordered sections, and quantified evidence aimed at this role." },
  { icon: Mail, title: "Cover letter", body: "A short, specific letter that sounds like you and answers the JD's actual asks." },
  { icon: Gauge, title: "ATS & readiness", body: "Keyword coverage, score, and the precise gaps to close before submitting." },
  { icon: Brain, title: "Profile drift detector", body: "Spots stale links, missing roles, and conflicting claims across your profile." },
  { icon: ClipboardCheck, title: "Application strategy", body: "Who to reach, what to mention, and the strongest angle to lead with." },
  { icon: Sparkles, title: "Brain you can edit", body: "Tunings improve as your career brain grows. Nothing is one‑shot." },
];

const faqs = [
  {
    q: "How is this different from a generic AI resume builder?",
    a: "Retuned doesn't write generic resumes. It reads your career brain (real evidence - projects, metrics, links) and tunes for one specific job at a time. Every line traces back to something you actually did.",
  },
  {
    q: "Will my resume pass ATS systems?",
    a: "Yes. Every tuning includes a keyword‑coverage read‑out, format checks, and the specific gaps to close before submitting.",
  },
  {
    q: "Where does my data go?",
    a: "Your data stays in your Retuned workspace. Generation is processed through Anthropic and OpenAI under explicit consent. You can delete your account and data any time.",
  },
  {
    q: "Do I need to upload a resume?",
    a: "It helps, but isn't required. You can build your career brain in the app or import from LinkedIn / a PDF.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-4xl px-6 pt-24">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">How it works</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        Three minutes from job description to a complete, evidence‑backed application package.
      </p>
      <ol className="mt-12 grid gap-12 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative pl-14">
            <span className="absolute left-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background font-mono text-sm">
              {i + 1}
            </span>
            <h3 className="text-base font-medium">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-5xl px-6 pt-32">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
        What you get on every tuning
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        Six tightly‑scoped artifacts. No fluff, no AI slop. Each one is editable and exportable.
      </p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20"
          >
            <Icon className="size-5 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-2xl px-6 pt-32">
      <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">FAQ</h2>
      <div className="mt-10">
        <Accordion>
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-sm font-medium">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
