'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { matcherQuestions, optionLabel, questionFor, type MatcherAnswers, type MatcherKey } from '../config/matcherQuestions';
import { readAnswers, writeAnswer } from '../lib/matcherState';
import { OptionCard } from './OptionCard';
import { ProgressBar } from './ProgressBar';
import { RectangleAd } from './AdPlaceholder';

export function QuestionStep({ stepKey }: { stepKey: MatcherKey }) {
  const question = questionFor(stepKey);
  const router = useRouter();
  const [answers, setAnswers] = useState<MatcherAnswers>({});

  useEffect(() => {
    setAnswers(readAnswers());
  }, []);

  if (!question) return null;
  const currentQuestion = question;

  function select(value: string) {
    writeAnswer(stepKey, value);
    setAnswers((current) => ({ ...current, [stepKey]: value }));
    router.push(currentQuestion.nextPath);
  }

  const previous = matcherQuestions.find((candidate) => candidate.step === currentQuestion.step - 1);

  return (
    <main className="page-shell question-shell">
      <div className="question-topline">
        {previous ? (
          <Link className="back-link" href={previous.path}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </Link>
        ) : <span />}
        <ProgressBar step={currentQuestion.step} total={matcherQuestions.length} />
      </div>
      <section className="question-section">
        <p className="eyebrow">Job Guide Match</p>
        <h1>{currentQuestion.question}</h1>
        <div className="option-grid">
          {currentQuestion.options.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              selected={answers[stepKey] === option.value}
              onSelect={() => select(option.value)}
            />
          ))}
        </div>
      </section>
      <section className="answer-strip" aria-label="Selected answers">
        {matcherQuestions.map((candidate) => {
          const value = answers[candidate.key];
          return value ? <span key={candidate.key}>{optionLabel(candidate.key, value)}</span> : null;
        })}
      </section>
      <div className="question-bottom-ad">
        <RectangleAd />
      </div>
    </main>
  );
}
