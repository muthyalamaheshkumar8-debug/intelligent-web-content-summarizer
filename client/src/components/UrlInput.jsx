import { useState } from 'react';
import Icon from './Icon';

export default function UrlInput({ onSummarize, loading, disabled }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    try {
      const value = new URL(url.trim());
      if (
        !['http:', 'https:'].includes(value.protocol) ||
        value.username ||
        value.password
      )
        throw new Error();
      setError('');
      onSummarize(value.href);
    } catch {
      setError('Enter a complete HTTP or HTTPS article URL.');
    }
  };
  return (
    <form onSubmit={submit} className="url-form">
      <label htmlFor="article-url">Article URL</label>
      <div className={`url-row ${error ? 'invalid' : ''}`}>
        <Icon name="link" />
        <input
          id="article-url"
          name="url"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError('');
          }}
          placeholder="https://example.com/an-interesting-article"
          required
          maxLength={2048}
          disabled={loading || disabled}
          aria-invalid={Boolean(error)}
          aria-describedby="url-hint"
        />
        <button
          type="submit"
          className="button primary"
          disabled={loading || disabled}
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            <Icon name="sparkle" size={18} />
          )}
          {loading ? 'Summarizing…' : 'Summarize article'}
          {!loading && <Icon name="arrow" size={16} />}
        </button>
      </div>
      <p id="url-hint" className={error ? 'field-error' : 'hint'}>
        {error ||
          'Works with public articles, blog posts, and news pages. Login-only pages and PDFs are not supported.'}
      </p>
    </form>
  );
}
