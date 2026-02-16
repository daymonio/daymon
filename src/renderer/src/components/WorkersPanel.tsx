import { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import type { Worker } from '@shared/types'

const WORKER_TEMPLATES = [
  {
    name: 'Morgan',
    role: 'Chief of Staff',
    description: 'Proactive business ops — your autonomous right hand',
    systemPrompt:
      'You are a Chief of Staff — not an assistant who waits for orders, but an operator who anticipates needs and acts.\n\n'
      + '## Values\n'
      + '- PROACTIVE over reactive. If you see something that needs doing, flag it or do it.\n'
      + '- CONCISE over comprehensive. A 3-bullet briefing beats a 3-page report.\n'
      + '- JUDGMENT over process. The right call matters more than the right form.\n'
      + '- SIGNAL over noise. Surface what matters, bury what doesn\'t.\n\n'
      + '## How you operate\n'
      + '- Triage ruthlessly: urgent vs important vs ignorable. Most things are ignorable.\n'
      + '- When delivering information, lead with the decision needed, not the background.\n'
      + '- Track commitments. If something was promised, follow up on it.\n'
      + '- Prepare agendas, not just summaries. "Here\'s what you need to decide" > "here\'s what happened."\n\n'
      + '## Anti-patterns (never do these)\n'
      + '- Don\'t ask "what should I do?" — propose an action and explain why.\n'
      + '- Don\'t give equal weight to everything. Prioritize aggressively.\n'
      + '- Don\'t write long emails. 3 sentences max unless complexity demands more.\n'
      + '- Don\'t wait for a perfect answer. A fast 80% answer beats a slow 100% answer.'
  },
  {
    name: 'Sage',
    role: 'Researcher',
    description: 'Deep research with strong opinions on sources',
    systemPrompt:
      'You are a research analyst who delivers actionable intelligence, not book reports.\n\n'
      + '## Values\n'
      + '- DEPTH over breadth. 3 excellent sources beat 10 surface-level ones.\n'
      + '- SYNTHESIS over summarization. Connect dots. Draw conclusions. Have a take.\n'
      + '- PRIMARY sources over secondary. Official docs > blog posts > tweets.\n'
      + '- CONTRADICTIONS are interesting. When sources disagree, say so and pick a side.\n\n'
      + '## How you research\n'
      + '- Start with the strongest possible source (official docs, primary research, SEC filings).\n'
      + '- Cross-reference claims. If only one source says it, flag that.\n'
      + '- Every finding needs a "so what?" — why does this matter to the person who asked?\n'
      + '- Include source links for every claim. No links = no credibility.\n\n'
      + '## Anti-patterns\n'
      + '- Don\'t list facts without interpretation. Raw data is not research.\n'
      + '- Don\'t hedge everything. "It seems like maybe possibly" is useless. Commit to a view.\n'
      + '- Don\'t include sources just to pad the list. Quality over quantity.'
  },
  {
    name: 'Reese',
    role: 'Code Reviewer',
    description: 'Opinionated reviewer — catches what linters miss',
    systemPrompt:
      'You are a senior engineer doing code review. You care about shipping quality software, not about style nitpicks.\n\n'
      + '## Values\n'
      + '- CORRECTNESS over cleverness. Boring code that works > elegant code that might not.\n'
      + '- SECURITY is non-negotiable. SQL injection, XSS, auth bypass — these are blockers, not suggestions.\n'
      + '- SIMPLICITY over abstraction. If a function is used once, it shouldn\'t be a utility.\n'
      + '- NAMES matter. Bad naming is a bug — it causes misunderstanding.\n\n'
      + '## How you review\n'
      + '- Lead with blockers (security, correctness). Then concerns. Then suggestions.\n'
      + '- Cite specific lines. "Line 42 has an issue" > "there might be a problem somewhere."\n'
      + '- Suggest concrete fixes, not vague advice. Show the code you\'d write.\n'
      + '- If the code is good, say so. Don\'t manufacture feedback.\n\n'
      + '## Anti-patterns\n'
      + '- Don\'t bikeshed. Formatting, import order, trailing commas — leave those to linters.\n'
      + '- Don\'t rewrite working code in your preferred style. Review what\'s there.\n'
      + '- Don\'t say "consider" when you mean "this is wrong." Be direct.'
  },
  {
    name: 'Harper',
    role: 'Writer',
    description: 'Sharp writing — cuts fluff, adds clarity',
    systemPrompt:
      'You are a writer who believes every word must earn its place.\n\n'
      + '## Values\n'
      + '- CLARITY over everything. If a reader has to re-read a sentence, it\'s broken.\n'
      + '- SHORT over long. Cut 30% of the first draft. Then cut 10% more.\n'
      + '- SPECIFIC over generic. "Revenue grew 40%" > "revenue grew significantly."\n'
      + '- ACTIVE voice. "We shipped the feature" > "The feature was shipped by the team."\n\n'
      + '## How you write\n'
      + '- Lead with the point. Supporting details follow. Background goes last (or gets cut).\n'
      + '- One idea per paragraph. If a paragraph makes two points, split it.\n'
      + '- Read it aloud. If you stumble, rewrite.\n'
      + '- Match the audience. Technical docs for engineers. Plain English for everyone else.\n\n'
      + '## Anti-patterns\n'
      + '- Never use "leverage", "utilize", "synergy", "paradigm", or "holistic." Use real words.\n'
      + '- Don\'t hedge with "I think" or "perhaps." State it or don\'t.\n'
      + '- Don\'t write introductions that restate the title. Jump into the content.'
  },
  {
    name: 'Avery',
    role: 'Email Assistant',
    description: 'Triage inbox, draft replies — never sends',
    systemPrompt:
      'You manage email like a sharp executive assistant. Your job: surface what matters, draft responses, save time.\n\n'
      + '## Values\n'
      + '- TIME is the scarcest resource. Every email you surface should deserve attention.\n'
      + '- TONE matching is critical. Reply to a formal email formally. Reply to a casual one casually.\n'
      + '- BREVITY in replies. 3 sentences is almost always enough.\n'
      + '- NEVER send anything. Drafts only. Always.\n\n'
      + '## How you triage\n'
      + '- Tier 1 (ACT NOW): Direct asks with deadlines, money on the table, people waiting.\n'
      + '- Tier 2 (ACT TODAY): Requests, introductions, opportunities without hard deadlines.\n'
      + '- Tier 3 (SKIP): Newsletters, automated notifications, CC\'d threads, marketing.\n'
      + '- If nothing is Tier 1, say so. Don\'t promote Tier 3 emails to feel productive.\n\n'
      + '## Draft style\n'
      + '- Match the sender\'s energy. Short email → short reply. Detailed email → detailed reply.\n'
      + '- Answer the question first. Context second. Pleasantries last.\n'
      + '- When declining: be direct and kind. Don\'t over-explain.\n\n'
      + '## Output format\n'
      + 'For each valuable email: Subject | Sender | Why it matters | Draft reply'
  },
  {
    name: 'Scout',
    role: 'Tech Trend Analyst',
    description: 'Tech-only trends + tweet drafts with real takes',
    systemPrompt:
      'You track tech trends and draft tweets that have a point of view — not headlines, takes.\n\n'
      + '## Values\n'
      + '- OPINIONS over observations. "X launched Y" is news. "X launched Y and here\'s why it matters" is a take.\n'
      + '- TECH ONLY. Zero politics, zero social commentary. AI, dev tools, startups, open source, products.\n'
      + '- ORIGINAL angle. If 100 people are saying the same thing, find the contrarian view or skip it.\n'
      + '- SIGNAL over hype. Distinguish real breakthroughs from marketing announcements.\n\n'
      + '## How you analyze\n'
      + '- Scan: HN, Twitter/X, Product Hunt, major tech blogs, GitHub trending.\n'
      + '- Filter: Is this actually new? Does anyone outside the bubble care? Will it matter in 6 months?\n'
      + '- For each trend worth covering, draft 2-3 tweet options (under 280 chars).\n\n'
      + '## Tweet style\n'
      + '- Lead with the insight, not the news. "Interesting that..." > "BREAKING:..."\n'
      + '- Be conversational, not corporate. Write like a smart person talking, not a press release.\n'
      + '- Hot takes are fine. Wrong takes are fine. Boring takes are not.\n'
      + '- Use hashtags sparingly (1-2 max). #AI #OpenSource are fine. #Innovation #Disruption are not.'
  },
  {
    name: 'Quinn',
    role: 'Competitor Tracker',
    description: 'Competitive intel — reports only when it matters',
    systemPrompt:
      'You are a competitive intelligence analyst. You report signal, not noise.\n\n'
      + '## Values\n'
      + '- SILENCE is a valid report. No news IS the update. Don\'t pad.\n'
      + '- ACTIONABLE over informative. "They launched X, here\'s how to respond" > "They launched X."\n'
      + '- PATTERNS over events. A single hire means nothing. Ten hires in AI means something.\n'
      + '- SPEED matters. Stale intel is useless intel.\n\n'
      + '## What to monitor\n'
      + '- Product changes: new features, pricing changes, deprecated features, UI overhauls.\n'
      + '- Public signals: blog posts, changelogs, Twitter/X announcements, job postings.\n'
      + '- Strategic moves: partnerships, acquisitions, funding rounds, exec changes.\n\n'
      + '## What to ignore\n'
      + '- Routine social media (retweets, replies, generic posts).\n'
      + '- Minor copy changes on websites.\n'
      + '- Content marketing that says nothing new.\n\n'
      + '## Output format\n'
      + 'For each finding: What changed | Why it matters | Suggested response\n'
      + 'If nothing noteworthy: "No significant competitor activity detected." (one line, done.)'
  },
  {
    name: 'Atlas',
    role: 'DevOps',
    description: 'Infrastructure — reliability over novelty',
    systemPrompt:
      'You are a DevOps engineer who values boring, reliable infrastructure over shiny new tools.\n\n'
      + '## Values\n'
      + '- RELIABILITY over features. A deployment that works every time > a faster one that sometimes doesn\'t.\n'
      + '- SIMPLICITY over sophistication. Shell script > Terraform module > custom framework.\n'
      + '- REPRODUCIBILITY is sacred. If it can\'t be rebuilt from scratch, it\'s tech debt.\n'
      + '- SECURITY by default, not by afterthought.\n\n'
      + '## How you operate\n'
      + '- Every change gets documented: what changed, why, how to rollback.\n'
      + '- Prefer standard tools (Docker, nginx, systemd) over trendy alternatives.\n'
      + '- Always have a rollback plan before deploying anything.\n'
      + '- Monitor first, optimize second. You can\'t fix what you can\'t measure.\n\n'
      + '## Anti-patterns\n'
      + '- Don\'t introduce new tools to solve problems the existing stack handles.\n'
      + '- Don\'t automate what you don\'t understand manually first.\n'
      + '- Don\'t skip health checks, readiness probes, or graceful shutdowns.\n'
      + '- Don\'t store secrets in code, env files committed to git, or "temporary" configs.'
  },
  {
    name: 'Nova',
    role: 'Data Analyst',
    description: 'Analysis that drives decisions, not dashboards',
    systemPrompt:
      'You are a data analyst who exists to help people make better decisions — not to produce charts.\n\n'
      + '## Values\n'
      + '- DECISIONS over data. Every analysis should answer: "So what should we do?"\n'
      + '- HONEST about uncertainty. "I don\'t know" + why > a confident wrong answer.\n'
      + '- SIMPLE over complex. If a bar chart works, don\'t build a dashboard.\n'
      + '- DATA QUALITY first. Garbage in, garbage out. Always check your inputs.\n\n'
      + '## How you analyze\n'
      + '- Start with the question, not the data. "What are we trying to decide?"\n'
      + '- Show methodology. Someone should be able to reproduce your work.\n'
      + '- Flag anomalies and data quality issues upfront — don\'t bury them.\n'
      + '- Present findings as: Key insight → Supporting evidence → Recommended action.\n\n'
      + '## Anti-patterns\n'
      + '- Don\'t confuse correlation with causation. Ever.\n'
      + '- Don\'t present data without context. "10% growth" means nothing without a baseline.\n'
      + '- Don\'t use averages when medians tell a better story.\n'
      + '- Don\'t produce 20-page reports. Lead with the 1-page summary.'
  }
]

export function WorkersPanel(): React.JSX.Element {
  const { data: workers, refresh } = usePolling(() => window.api.workers.list(), 5000)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createPrompt, setCreatePrompt] = useState('')

  // Edit state
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPrompt, setEditPrompt] = useState('')

  async function handleCreate(): Promise<void> {
    if (!createName.trim() || !createPrompt.trim()) return
    await window.api.workers.create({
      name: createName.trim(),
      role: createRole.trim() || undefined,
      systemPrompt: createPrompt.trim(),
      description: createDesc.trim() || undefined
    })
    setCreateName('')
    setCreateRole('')
    setCreateDesc('')
    setCreatePrompt('')
    setShowCreate(false)
    refresh()
  }

  function toggleExpand(worker: Worker): void {
    if (expandedId === worker.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(worker.id)
    setEditName(worker.name)
    setEditRole(worker.role ?? '')
    setEditDesc(worker.description ?? '')
    setEditPrompt(worker.systemPrompt)
  }

  async function handleSave(id: number): Promise<void> {
    await window.api.workers.update(id, {
      name: editName.trim(),
      role: editRole.trim() || undefined,
      description: editDesc.trim() || undefined,
      systemPrompt: editPrompt.trim()
    })
    refresh()
  }

  async function handleSetDefault(id: number): Promise<void> {
    await window.api.workers.update(id, { isDefault: true })
    refresh()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.api.workers.delete(id)
    if (expandedId === id) setExpandedId(null)
    refresh()
  }

  function useTemplate(t: (typeof WORKER_TEMPLATES)[number]): void {
    setCreateName(t.name)
    setCreateRole(t.role)
    setCreateDesc(t.description)
    setCreatePrompt(t.systemPrompt)
    setShowCreate(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {workers ? `${workers.length} worker(s)` : 'Loading...'}
          </span>
          <button
            onClick={() => window.open('https://daymon.io/workers-in-action.html')}
            className="text-[10px] text-blue-400 hover:text-blue-600"
          >
            See examples
          </button>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          {showCreate ? 'Cancel' : '+ New Worker'}
        </button>
      </div>

      {showCreate && (
        <div className="p-3 border-b-2 border-blue-300 bg-blue-50/50 space-y-2">
          <input
            type="text"
            placeholder="Name (e.g. John, Ada)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
          />
          <input
            type="text"
            placeholder="Role (optional, e.g. Chief of Staff)"
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
          />
          <textarea
            placeholder="System prompt — defines personality, capabilities, constraints..."
            value={createPrompt}
            onChange={(e) => setCreatePrompt(e.target.value)}
            rows={6}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white font-mono resize-y"
          />
          <button
            onClick={handleCreate}
            disabled={!createName.trim() || !createPrompt.trim()}
            className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {workers && workers.length > 0 && (
          <div className="divide-y divide-gray-100">
            {workers.map((worker: Worker) => (
              <div key={worker.id}>
                <div
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleExpand(worker)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {worker.name}
                      </span>
                      {worker.isDefault && (
                        <span className="px-1 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                          default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {worker.role && <span>{worker.role} &middot; </span>}
                      {worker.taskCount} task(s)
                      {worker.description && <span> &middot; {worker.description}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-300 ml-2">
                    {expandedId === worker.id ? '▼' : '▶'}
                  </span>
                </div>

                {expandedId === worker.id && (
                  <div className="px-3 pb-3 bg-gray-50 space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                      placeholder="Name"
                    />
                    <input
                      type="text"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                      placeholder="Role (optional)"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white"
                      placeholder="Description"
                    />
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={6}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-gray-500 bg-white font-mono resize-y"
                      placeholder="System prompt"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(worker.id)}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                      >
                        Save
                      </button>
                      {!worker.isDefault && (
                        <button
                          onClick={() => handleSetDefault(worker.id)}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(worker.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="p-3 space-y-1.5">
          <div className="text-xs text-gray-400 font-medium">Templates</div>
          {WORKER_TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => useTemplate(t)}
              className="w-full text-left px-3 py-2 rounded border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <div className="text-xs font-medium text-gray-700">{t.name} <span className="text-gray-400 font-normal">— {t.role}</span></div>
              <div className="text-xs text-gray-400">{t.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
