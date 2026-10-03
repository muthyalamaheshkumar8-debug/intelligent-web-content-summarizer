import { useCallback, useEffect, useRef, useState } from 'react';
import UrlInput from './components/UrlInput';
import SummaryCard from './components/SummaryCard';
import Icon from './components/Icon';
import api, { errorMessage, openEvents } from './services/api';

const stages = {
  extracting: 'Reading the article',
  summarizing: 'Finding the important ideas',
  saving: 'Saving to your library',
  complete: 'Summary ready',
};
const steps = ['extracting', 'summarizing', 'saving'];

function History({
  items,
  loading,
  error,
  cursor,
  onMore,
  onSelect,
  onRetry,
  selectedId,
  full = false,
}) {
  const [search, setSearch] = useState('');
  const filtered = items.filter((item) =>
    `${item.title} ${item.topic} ${item.url}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section
      className={`history panel ${full ? 'full-history' : ''}`}
      aria-label="Summary library"
    >
      <div className="section-heading">
        <div>
          <h2>{full ? 'Your summary library' : 'Recent summaries'}</h2>
          <p>Saved privately in this browser</p>
        </div>
        <span className="count">{items.length}</span>
      </div>
      <label className="search-box">
        <Icon name="search" size={17} />
        <input
          type="search"
          placeholder="Search loaded summaries"
          aria-label="Search loaded summaries"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {loading && items.length === 0 && (
        <div
          className="history-skeleton"
          aria-label="Loading summary history"
          role="status"
        >
          {[1, 2, 3].map((value) => (
            <div key={value} className="skeleton" />
          ))}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="history-empty">
          <span className="empty-icon small">
            <Icon name="library" size={22} />
          </span>
          <h3>{search ? 'No matching summaries' : 'A little less to read'}</h3>
          <p>
            {search
              ? 'Try a different search or load more summaries.'
              : 'Your first summary will appear here, ready to revisit.'}
          </p>
        </div>
      )}
      <div className="history-list">
        {filtered.map((item) => (
          <button
            key={item._id}
            className={`history-item ${selectedId === item._id ? 'selected' : ''}`}
            onClick={() => onSelect(item)}
          >
            <span className="history-domain">
              <Icon name="globe" size={13} />
              {new URL(item.url).hostname}
            </span>
            <strong>{item.title}</strong>
            <span className="history-meta">
              <span>{item.topic || 'Article'}</span>
              <span>
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </span>
          </button>
        ))}
      </div>
      {cursor && (
        <button
          className="button secondary load-more"
          onClick={onMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more summaries'}
        </button>
      )}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState('workspace');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [cursor, setCursor] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [connection, setConnection] = useState('connecting');
  const [restart, setRestart] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const requestId = useRef(null);
  const historySequence = useRef(0);
  const resultRef = useRef(null);

  const loadHistory = useCallback(async (nextCursor = '') => {
    const sequence = ++historySequence.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await api.get('/api/summaries', {
        params: { limit: 20, ...(nextCursor ? { cursor: nextCursor } : {}) },
      });
      if (sequence !== historySequence.current) return;
      setHistory((current) =>
        nextCursor
          ? [
              ...current,
              ...response.data.filter(
                (item) => !current.some((saved) => saved._id === item._id),
              ),
            ]
          : response.data,
      );
      setCursor(response.headers['x-next-cursor'] || '');
    } catch (err) {
      if (sequence === historySequence.current)
        setHistoryError(errorMessage(err));
    } finally {
      if (sequence === historySequence.current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let stream;
    async function connect() {
      try {
        await api.get('/api/session');
        if (!active) return;
        setSessionReady(true);
        await loadHistory();
        if (!active) return;
        stream = openEvents();
        stream.addEventListener('ready', () => {
          if (active) {
            setConnection('connected');
            loadHistory();
          }
        });
        stream.addEventListener('progress', (event) => {
          if (!active) return;
          let value;
          try {
            value = JSON.parse(event.data);
          } catch {
            return;
          }
          if (value.requestId === requestId.current && stages[value.stage])
            setStage(value.stage);
          if (value.stage === 'complete' || value.stage === 'deleted')
            loadHistory();
          if (value.stage === 'deleted')
            setSummary((current) =>
              current?._id === value.summaryId ? null : current,
            );
        });
        stream.onerror = () => {
          if (active) setConnection('reconnecting');
        };
      } catch (err) {
        if (active) {
          setConnection('offline');
          setHistoryLoading(false);
          setHistoryError(errorMessage(err));
        }
      }
    }
    connect();
    return () => {
      active = false;
      stream?.close();
    };
  }, [loadHistory, restart]);

  useEffect(() => {
    if (summary) resultRef.current?.focus({ preventScroll: true });
  }, [summary]);

  const handleSummarize = async (url) => {
    if (loading) return;
    setLoading(true);
    setError('');
    setSummary(null);
    setStage('');
    requestId.current = crypto.randomUUID();
    try {
      const response = await api.post('/api/summaries', {
        url,
        requestId: requestId.current,
      });
      setSummary(response.data);
      loadHistory();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      requestId.current = null;
      setStage('');
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/summaries/${id}`);
      setHistory((current) => current.filter((item) => item._id !== id));
      setSummary(null);
      loadHistory();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const select = (item) => {
    if (!loading) {
      setSummary(item);
      setView('workspace');
      setError('');
    }
  };
  const historyProps = {
    items: history,
    loading: historyLoading,
    error: historyError,
    cursor,
    onMore: () => loadHistory(cursor),
    onRetry: () =>
      connection === 'offline'
        ? setRestart((value) => value + 1)
        : loadHistory(),
    onSelect: select,
    selectedId: summary?._id,
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Web Content Summarizer home">
          <span className="brand-mark">
            <Icon name="lines" size={25} />
          </span>
          <span>
            Web Content<span className="brand-sub">SUMMARIZER</span>
          </span>
        </a>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === 'workspace' ? 'active' : ''}`}
            onClick={() => setView('workspace')}
          >
            <Icon name="sparkle" />
            Summarize
          </button>
          <button
            className={`nav-item ${view === 'library' ? 'active' : ''}`}
            onClick={() => setView('library')}
          >
            <Icon name="library" />
            My library<span className="nav-count">{history.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <Icon name="shield" size={22} />
            <h3>Your reading, organized.</h3>
            <p>
              Summaries belong to this browser. Keep its cookies to return to
              your library.
            </p>
          </div>
          <div className="sidebar-footer">
            <span className="avatar">W</span>
            <div>
              Personal workspace<small>Powered by Gemini</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>{view === 'workspace' ? 'Summarize' : 'My library'}</strong>
          </span>
          <div className={`connection ${connection}`} role="status">
            <span className="status-dot" />
            {connection === 'connected'
              ? 'Live updates connected'
              : connection === 'reconnecting'
                ? 'Reconnecting live updates'
                : connection === 'offline'
                  ? 'Service unavailable'
                  : 'Connecting…'}
            {connection === 'offline' && (
              <button
                onClick={() => {
                  setConnection('connecting');
                  setRestart((value) => value + 1);
                }}
                aria-label="Reconnect to the service"
              >
                <Icon name="refresh" size={14} />
              </button>
            )}
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <span className="eyebrow">
              {view === 'workspace'
                ? 'A CLEARER WAY TO READ'
                : 'YOUR READING COLLECTION'}
            </span>
            <h1>
              {view === 'workspace' ? (
                <>
                  Less reading.
                  <br className="mobile-break" /> More understanding.
                </>
              ) : (
                'Good ideas, kept close.'
              )}
            </h1>
            <p>
              {view === 'workspace'
                ? 'Turn a long article into a clear summary and the takeaways that matter.'
                : 'Revisit the articles you’ve summarized, whenever you need a refresher.'}
            </p>
          </div>
          {view === 'workspace' && (
            <section
              className="composer panel"
              aria-label="Summarize an article"
            >
              <div className="composer-heading">
                <span className="mini-mark">
                  <Icon name="sparkle" size={21} />
                </span>
                <div>
                  <h2>What are you reading today?</h2>
                  <p>One link. A clearer picture.</p>
                </div>
                <span className="ai-badge">AI assisted</span>
              </div>
              <UrlInput
                onSummarize={handleSummarize}
                loading={loading}
                disabled={!sessionReady}
              />
            </section>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <div>
                <strong>We couldn’t finish that action</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          {view === 'workspace' ? (
            <div className="workspace-grid">
              <div
                className="result-region"
                role="region"
                ref={resultRef}
                tabIndex={-1}
                aria-label="Summary result"
                aria-busy={loading}
              >
                {loading ? (
                  <section
                    className="progress-panel panel"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="empty-icon">
                      <Icon name="sparkle" size={29} />
                    </span>
                    <h2>{stages[stage] || 'Sending your article…'}</h2>
                    <p>
                      {connection === 'connected'
                        ? 'Progress updates come directly from the service.'
                        : 'The request is running. Live updates will reconnect automatically.'}
                    </p>
                    <ol className="progress-steps">
                      {steps.map((value, index) => (
                        <li
                          key={value}
                          className={
                            stage === value
                              ? 'current'
                              : steps.indexOf(stage) > index ||
                                  stage === 'complete'
                                ? 'done'
                                : ''
                          }
                        >
                          <span>
                            {steps.indexOf(stage) > index ||
                            stage === 'complete' ? (
                              <Icon name="check" size={14} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          {value === 'extracting'
                            ? 'Read article'
                            : value === 'summarizing'
                              ? 'Summarize'
                              : 'Save'}
                        </li>
                      ))}
                    </ol>
                    <div className="skeleton wide" />
                    <div className="skeleton" />
                    <div className="skeleton short" />
                  </section>
                ) : summary ? (
                  <SummaryCard
                    key={summary._id}
                    summary={summary}
                    onDelete={handleDelete}
                    deleting={deleting}
                  />
                ) : (
                  <section className="empty-panel panel">
                    <span className="empty-icon">
                      <Icon name="lines" size={32} />
                    </span>
                    <span className="eyebrow">FROM INFORMATION TO INSIGHT</span>
                    <h2>Make room for the big ideas.</h2>
                    <p>
                      Paste an article above. We’ll pull out its main ideas,
                      write a concise brief, and keep it in your library.
                    </p>
                    <div className="empty-features">
                      <span>
                        <Icon name="lines" size={19} />
                        <strong>A concise brief</strong>
                        <small>The article, at a glance</small>
                      </span>
                      <span>
                        <Icon name="check" size={19} />
                        <strong>Key takeaways</strong>
                        <small>The details worth keeping</small>
                      </span>
                      <span>
                        <Icon name="library" size={19} />
                        <strong>Saved for later</strong>
                        <small>Return to any summary</small>
                      </span>
                    </div>
                    <div className="empty-footnote">
                      <Icon name="link" size={15} />
                      Start with a public article you want to understand.
                    </div>
                  </section>
                )}
              </div>
              <History {...historyProps} />
            </div>
          ) : (
            <History {...historyProps} full />
          )}
          <footer className="page-footer">
            <span>Intelligent Web Content Summarizer</span>
            <span>Read thoughtfully. Verify the source.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
