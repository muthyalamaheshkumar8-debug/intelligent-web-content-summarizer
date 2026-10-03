import { useState } from 'react';
import Icon from './Icon';

export default function SummaryCard({ summary, onDelete, deleting }) {
  const [copyState, setCopyState] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const text = `${summary.title}\n\n${summary.summary}\n\nKey takeaways\n${summary.keyPoints.map((point) => `• ${point}`).join('\n')}\n\nSource: ${summary.url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('Copied');
    } catch {
      setCopyState('Copy failed. Download a text file instead.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'article-summary.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <article className="summary-panel panel">
      <div className="result-topline">
        <span className="eyebrow">
          <Icon name="check" size={15} /> SUMMARY READY
        </span>
        <span className="topic">{summary.topic || 'Article'}</span>
      </div>
      <h2>{summary.title}</h2>
      <div className="source-line">
        <a href={summary.url} target="_blank" rel="noopener noreferrer">
          <Icon name="globe" size={15} />
          {new URL(summary.url).hostname}
          <Icon name="external" size={13} />
        </a>
        <span>·</span>
        <span>
          {new Date(summary.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        {summary.readingMinutes && (
          <>
            <span>·</span>
            <span>{summary.readingMinutes} min source read</span>
          </>
        )}
      </div>
      <section className="overview">
        <h3>The brief</h3>
        <p>{summary.summary}</p>
      </section>
      <section className="takeaways">
        <h3>
          Key takeaways <span>{summary.keyPoints.length}</span>
        </h3>
        <ol>
          {summary.keyPoints.map((point, index) => (
            <li key={index}>
              <span className="point-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p>{point}</p>
            </li>
          ))}
        </ol>
      </section>
      <div className="result-actions">
        <button className="button secondary" onClick={copy}>
          <Icon name={copyState === 'Copied' ? 'check' : 'copy'} size={16} />
          {copyState === 'Copied' ? 'Copied' : 'Copy summary'}
        </button>
        <button className="button quiet" onClick={download}>
          <Icon name="download" size={17} />
          Download
        </button>
        <button
          className="button quiet danger delete-action"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
        >
          <Icon name="trash" size={17} />
          Delete
        </button>
      </div>
      {copyState && (
        <p className="hint" role="status">
          {copyState === 'Copied'
            ? 'Summary and takeaways copied to your clipboard.'
            : copyState}
        </p>
      )}
      {confirmDelete && (
        <div
          className="delete-confirm"
          role="group"
          aria-label="Confirm deletion"
        >
          <p>Delete this summary from your library?</p>
          <button
            className="button secondary"
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
          >
            Keep summary
          </button>
          <button
            className="button destructive"
            onClick={() => onDelete(summary._id)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete summary'}
          </button>
        </div>
      )}
      <p className="ai-note">
        AI summaries can miss context. Check the original article for details.
      </p>
    </article>
  );
}
