'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { matcherQuestions, optionLabel, type MatcherAnswers, type MatcherKey } from '../config/matcherQuestions';
import { apiPost } from '../lib/api';
import type { JobListResult } from '../types/api';
import { JobCard } from './JobCard';
import { OptionCard } from './OptionCard';

interface ChatResponse {
  message: string;
  nextQuestion: {
    key: MatcherKey;
    question: string;
    options: string[];
  } | null;
  answers: MatcherAnswers;
  jobs: JobListResult | null;
}

export function ChatClient() {
  const [answers, setAnswers] = useState<MatcherAnswers>({});
  const [activeKey, setActiveKey] = useState<MatcherKey>('work');
  const [messages, setMessages] = useState(['What kind of work are you looking for?']);
  const [jobs, setJobs] = useState<JobListResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function select(value: string) {
    const nextAnswers = { ...answers, [activeKey]: value };
    setAnswers(nextAnswers);
    setMessages((current) => [...current, optionLabel(activeKey, value)]);
    setLoading(true);

    try {
      const response = await apiPost<ChatResponse>('/api/chat', { answers: nextAnswers });
      setMessages((current) => [...current, response.message]);
      setJobs(response.jobs);
      if (response.nextQuestion) setActiveKey(response.nextQuestion.key);
    } finally {
      setLoading(false);
    }
  }

  const question = matcherQuestions.find((candidate) => candidate.key === activeKey);
  const complete = matcherQuestions.every((candidate) => answers[candidate.key]);

  return (
    <main className="page-shell chat-shell">
      <section className="chat-header">
        <p className="eyebrow">Guided chat</p>
        <h1>Chat to find jobs</h1>
      </section>

      <section className="chat-window" aria-live="polite">
        {messages.map((message, index) => (
          <div className={`chat-bubble ${index % 2 ? 'user' : 'guide'}`} key={`${message}-${index}`}>
            {message}
          </div>
        ))}
        {loading ? <div className="chat-bubble guide">Checking jobs...</div> : null}
      </section>

      {!complete && question ? (
        <section className="option-grid chat-options">
          {question.options.map((option) => (
            <OptionCard key={option.value} label={option.label} onSelect={() => select(option.value)} />
          ))}
        </section>
      ) : null}

      {complete && !jobs && !loading ? (
        <button className="primary-button icon-button" type="button" onClick={() => apiPost<ChatResponse>('/api/chat', { answers }).then((response) => setJobs(response.jobs))}>
          Show jobs
          <Send size={16} aria-hidden="true" />
        </button>
      ) : null}

      {jobs ? (
        <section className="job-list chat-results">
          {jobs.jobs.length ? jobs.jobs.map((job) => <JobCard key={job.id} job={job} />) : <div className="empty-state">No matching jobs were found yet.</div>}
        </section>
      ) : null}
    </main>
  );
}
