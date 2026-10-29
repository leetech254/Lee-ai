import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  BookOpen,
  Check,
  Clipboard,
  Code2,
  Compass,
  GraduationCap,
  Lightbulb,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Plus,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type SkillId = "automation" | "code" | "teach" | "learning" | "plans" | "general";
type ChatMessage = { role: "user" | "assistant"; content: string };

const Streamdown = lazy(() => import("streamdown").then(module => ({ default: module.Streamdown })));

const skills: { id: SkillId; label: string; icon: typeof Sparkles; short: string }[] = [
  { id: "automation", label: "Automations", icon: Workflow, short: "Design a workflow" },
  { id: "code", label: "Code debugger", icon: Code2, short: "Find and fix a bug" },
  { id: "teach", label: "Teach me", icon: BookOpen, short: "Make a hard idea clear" },
  { id: "learning", label: "Learning plans", icon: GraduationCap, short: "Build a learning path" },
  { id: "plans", label: "Project plans", icon: Lightbulb, short: "Turn an idea into a plan" },
  { id: "general", label: "General assistant", icon: Compass, short: "Explore any question" },
];

const examples: Record<SkillId, { title: string; prompt: string; icon: typeof Sparkles }[]> = {
  automation: [
    { title: "Tidy up incoming leads", prompt: "Design an automation that captures new website leads, enriches their details, and alerts my sales team.", icon: Workflow },
    { title: "Make a weekly report", prompt: "Create a workflow that gathers my weekly sales numbers and emails a clear Monday morning summary.", icon: Clipboard },
    { title: "Connect the busywork", prompt: "Help me automate repetitive admin work for a small online store. Ask me what you need to know.", icon: Sparkles },
  ],
  code: [
    { title: "Find the bug", prompt: "I'll share a code snippet and the error. Help me identify the root cause, explain it, and suggest a fix.", icon: Code2 },
    { title: "Review this function", prompt: "Review a function for bugs, edge cases, and readability. Tell me what to improve and why.", icon: Clipboard },
    { title: "Explain an error", prompt: "Explain a common JavaScript async error and show a small before-and-after fix.", icon: Lightbulb },
  ],
  teach: [
    { title: "Explain it simply", prompt: "Explain how large language models work as if I'm curious but new to AI.", icon: BookOpen },
    { title: "Use an analogy", prompt: "Teach me recursion using an intuitive analogy, a tiny code example, and a quick check for understanding.", icon: Lightbulb },
    { title: "Quiz me", prompt: "Teach me the basics of APIs, then give me three questions to check what I learned.", icon: GraduationCap },
  ],
  learning: [
    { title: "Learn Python", prompt: "Create a four-week beginner plan for learning Python. I can study 30 minutes a day.", icon: GraduationCap },
    { title: "Study more effectively", prompt: "Build me a practical two-week study plan that uses spaced repetition and active recall.", icon: BookOpen },
    { title: "Learn a new skill", prompt: "Help me learn data visualization from scratch. First ask about my goals and weekly time.", icon: Compass },
  ],
  plans: [
    { title: "Plan a new project", prompt: "Help me turn my idea into a project plan with milestones, risks, and a realistic first week.", icon: Lightbulb },
    { title: "Launch a side project", prompt: "Create a lean 30-day launch plan for a small side project with a limited budget.", icon: Clipboard },
    { title: "Get unstuck", prompt: "I have a big goal but feel stuck. Ask me a few questions and help me find a doable next step.", icon: Compass },
  ],
  general: [
    { title: "Think it through", prompt: "Help me think through a decision by laying out the options, trade-offs, and what matters most.", icon: Compass },
    { title: "Write something", prompt: "Help me write a clear, friendly email asking to reschedule a meeting.", icon: BookOpen },
    { title: "Explore an idea", prompt: "Suggest a few useful ways I could use an AI assistant in my everyday work.", icon: Sparkles },
  ],
};

const welcome: Record<SkillId, { eyebrow: string; title: string; subtitle: string }> = {
  automation: { eyebrow: "AUTOMATION STUDIO", title: "Make busywork a thing of the past.", subtitle: "Describe the work you repeat. Get a clear, reviewable automation plan." },
  code: { eyebrow: "CODE DEBUGGER", title: "Let’s get to the root of it.", subtitle: "Share your code and what went wrong. We’ll reason through the fix together." },
  teach: { eyebrow: "YOUR PERSONAL TEACHER", title: "Curiosity looks good on you.", subtitle: "Ask about anything. Get a patient explanation that meets you where you are." },
  learning: { eyebrow: "LEARNING DESIGNER", title: "Build a path to what’s next.", subtitle: "Tell me what you want to learn and the time you have. We’ll map it out." },
  plans: { eyebrow: "PLANNING PARTNER", title: "Big idea. Clear next steps.", subtitle: "Turn an open-ended goal into a thoughtful, actionable plan." },
  general: { eyebrow: "VMTECH AI ASSISTANT", title: "What are we figuring out?", subtitle: "An idea, a question, a tricky task—start anywhere and we’ll work it out." },
};

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark${small ? " brand-mark-small" : ""}`} aria-hidden="true"><span>V</span><i /></span>;
}

export default function Home() {
  const [activeSkill, setActiveSkill] = useState<SkillId>("automation");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [retryMessages, setRetryMessages] = useState<ChatMessage[] | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationVersion = useRef(0);
  const chat = trpc.assistant.generate.useMutation();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chat.isPending]);

  const resetChat = (skill = activeSkill) => {
    conversationVersion.current += 1;
    setActiveSkill(skill);
    setMessages([]);
    setInput("");
    setError("");
    setRetryMessages(null);
    setMobileNavOpen(false);
  };

  const runAssistant = async (history: ChatMessage[], skill = activeSkill) => {
    const requestVersion = conversationVersion.current;
    setError("");
    try {
      const result = await chat.mutateAsync({ skill, messages: history.slice(-12) });
      if (requestVersion !== conversationVersion.current) return;
      setMessages([...history, { role: "assistant", content: result.content }]);
      setRetryMessages(null);
      setInput("");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch {
      if (requestVersion !== conversationVersion.current) return;
      setError("I couldn’t reach the AI service just now. Your message is still here—try again in a moment.");
      setRetryMessages(history);
    }
  };

  const send = (value = input) => {
    const content = value.trim();
    if (!content || chat.isPending) return;
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setRetryMessages(null);
    void runAssistant(history);
  };

  const selectSkill = (skill: SkillId) => {
    if (skill !== activeSkill) resetChat(skill);
    setMobileNavOpen(false);
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1600);
    } catch {
      setError("Clipboard access isn’t available in this browser. You can still select and copy the text.");
    }
  };

  const active = skills.find(skill => skill.id === activeSkill)!;
  const intro = welcome[activeSkill];

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="/" onClick={event => { event.preventDefault(); resetChat("automation"); }} aria-label="VMTech AI home">
            <BrandMark />
            <span className="brand-word">VMTECH<span className="brand-ai">AI</span></span>
          </a>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={() => resetChat()}><Plus size={17} strokeWidth={2.4} /> <span>New conversation</span><span className="shortcut">⌘ K</span></button>
        <div className="sidebar-section-label">YOUR AI WORKSPACE</div>
        <nav className="skill-nav" aria-label="Assistant skills">
          {skills.map(skill => {
            const Icon = skill.icon;
            return <button key={skill.id} className={`skill-link${activeSkill === skill.id ? " skill-link-active" : ""}`} onClick={() => selectSkill(skill.id)} aria-current={activeSkill === skill.id ? "page" : undefined}>
              <Icon size={17} strokeWidth={1.85} /><span>{skill.label}</span>{skill.id === "automation" && <span className="skill-new">NEW</span>}
            </button>;
          })}
        </nav>
        <div className="sidebar-note"><span className="note-spark"><Sparkles size={14} /></span><div><strong>Ideas into action.</strong><p>One thoughtful step at a time.</p></div></div>
        <div className="sidebar-bottom">
          <div className="service-status"><span className="status-dot" /><span>AI workspace ready</span></div>
          <div className="profile-row"><div className="profile-avatar">V</div><div className="profile-copy"><strong>VMTech workspace</strong><span>Personal assistant</span></div><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button><span className="breadcrumb-muted">Workspace</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">{active.label}</span></div>
          <div className="topbar-right"><span className="topbar-chip"><span className="status-dot" />AI assistant</span><button className="help-button" aria-label="Help" title="Your AI responses are drafts—review important details."><span>?</span></button></div>
        </header>

        <div className={`work-area${messages.length ? " work-area-chat" : ""}`}>
          {messages.length === 0 ? <section className="welcome-state">
            <div className="welcome-heading">
              <div className="eyebrow"><span className="eyebrow-line" />{intro.eyebrow}<span className="eyebrow-line" /></div>
              <h1>{intro.title}</h1>
              <p className="welcome-subtitle">{intro.subtitle}</p>
            </div>
            <div className="examples-grid">
              {examples[activeSkill].map((example, index) => {
                const Icon = example.icon;
                return <button className="example-card" key={example.title} onClick={() => send(example.prompt)}>
                  <span className={`example-icon example-icon-${index}`}><Icon size={18} strokeWidth={1.8} /></span>
                  <span className="example-copy"><strong>{example.title}</strong><span>{example.prompt}</span></span>
                  <ArrowUp size={15} className="example-arrow" />
                </button>;
              })}
            </div>
          </section> : <section className="conversation" aria-live="polite" aria-label="Conversation">
            <div className="conversation-meta"><span className="conversation-tag"><active.icon size={14} />{active.label}</span><span className="meta-divider" />A good first draft, ready to make yours.</div>
            {messages.map((message, index) => message.role === "user" ? <div className="message-row message-user" key={`${index}-${message.role}`}><div className="user-bubble">{message.content}</div></div> : <article className="assistant-message" key={`${index}-${message.role}`}>
              <div className="assistant-avatar"><BrandMark small /></div>
              <div className="assistant-body"><div className="assistant-label">VMTech <span>· AI assistant</span></div><div className="markdown-content"><Suspense fallback={<span className="answer-loading">Preparing your answer…</span>}><Streamdown>{message.content}</Streamdown></Suspense></div><button className="copy-button" onClick={() => void copyMessage(message.content, index)}>{copiedIndex === index ? <Check size={13} /> : <Clipboard size={13} />}{copiedIndex === index ? "Copied" : "Copy response"}</button></div>
            </article>)}
            {chat.isPending && <div className="assistant-message pending-message"><div className="assistant-avatar"><BrandMark small /></div><div className="thinking"><span className="thinking-dots"><i /><i /><i /></span><span>Thinking it through</span></div></div>}
            <div ref={endRef} />
          </section>}

          <div className="composer-zone">
            {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => retryMessages ? void runAssistant(retryMessages) : setError("")} disabled={chat.isPending}>{retryMessages ? "Try again" : "Dismiss"}</button></div>}
            <form className="composer" onSubmit={event => { event.preventDefault(); send(); }}>
              <textarea ref={textareaRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={activeSkill === "code" ? "Paste code, an error, or describe what’s not working…" : activeSkill === "automation" ? "Describe a task you’d love to automate…" : "Ask VMTech AI anything…"} rows={2} maxLength={6000} disabled={chat.isPending} aria-label="Message VMTech AI" />
              <div className="composer-footer"><div className="composer-hint"><span><Sparkles size={13} />Thoughtful help, one prompt away</span><span className="hint-divider" />Enter to send</div><button className="send-button" type="submit" aria-label="Send message" disabled={!input.trim() || chat.isPending}>{chat.isPending ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} strokeWidth={2.4} />}</button></div>
            </form>
            <p className="disclaimer">AI can make mistakes. Review code before running it and check important plans before acting.</p>
          </div>
        </div>
        <footer className="app-footer"><span>Built for ideas in progress.</span><span className="footer-status"><span className="status-dot" /> VMTech AI</span></footer>
      </main>
    </div>
  );
}
