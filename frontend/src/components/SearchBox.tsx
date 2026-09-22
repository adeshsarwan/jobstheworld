'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface SearchBoxProps {
  defaultValue?: string;
}

export function SearchBox({ defaultValue = '' }: SearchBoxProps) {
  const [query, setQuery] = useState(defaultValue);
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    router.push(`/find/results${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <form className="search-box" onSubmit={onSubmit}>
      <Search size={20} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by job title or company"
        aria-label="Search jobs"
      />
      <button type="submit">Search</button>
    </form>
  );
}
