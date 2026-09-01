import { useMemo, useState } from "react";
import type { NewsItem } from "@rotunda/engine";
import { categorizeNews, stripPrefix, collectCategories } from "./categories.js";
import "./news.css";

interface Props {
  news: readonly NewsItem[] | null | undefined;
  onBack: () => void;
  worldTurn: number;
  worldDate: string;
}

function safeNewsList(input: readonly NewsItem[] | null | undefined): NewsItem[] {
  if (!Array.isArray(input)) return [];
  // Defensive: filter to well-formed items, preserve order
  return input.filter(
    (n) =>
      n != null &&
      typeof (n as NewsItem).headline === "string" &&
      typeof (n as NewsItem).turn === "number" &&
      typeof (n as NewsItem).date === "string",
  ) as NewsItem[];
}

export function NewsScreen({ news, onBack, worldTurn, worldDate }: Props) {
  const allItems = useMemo(() => safeNewsList(news), [news]);
  // Newest-first: engine stores newest last, so reverse. Also sort by turn descending as defensive.
  const reversed = useMemo(() => {
    // Create newest-first array without mutating original
    // If multiple items share turn, preserve insertion order reversed (LIFO within turn)
    return [...allItems].reverse();
  }, [allItems]);

  const categories = useMemo(() => collectCategories(allItems), [allItems]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reversed.filter((item) => {
      const cat = categorizeNews(item);
      if (activeCategory !== "all" && cat !== activeCategory) return false;
      if (!q) return true;
      // Search headline, date, turn
      const h = item.headline.toLowerCase();
      if (h.includes(q)) return true;
      if (String(item.turn).includes(q)) return true;
      if (item.date.toLowerCase().includes(q)) return true;
      if (cat.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [reversed, activeCategory, query]);

  const totalCount = allItems.length;
  const shownCount = filtered.length;

  return (
    <div className="news-screen">
      <header className="news-header">
        <div className="row spread news-header-inner">
          <div className="row" style={{ gap: 12 }}>
            <h1 className="news-title">NEWS</h1>
            <span className="muted small news-subtitle">
              Turn {worldTurn} · {worldDate} · {totalCount} {totalCount === 1 ? "item" : "items"} retained
            </span>
          </div>
          <div className="row">
            <button className="secondary small-btn" onClick={onBack}>
              Back to dashboard
            </button>
          </div>
        </div>
        <div className="news-controls">
          <div className="news-search-wrap">
            <input
              className="news-search"
              placeholder="Search headlines, turn, date, category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search news"
            />
            {query && (
              <button className="secondary small-btn news-clear" onClick={() => setQuery("")}>
                Clear
              </button>
            )}
          </div>
          <div className="news-chips" role="group" aria-label="Filter by category">
            <button
              className={`news-chip ${activeCategory === "all" ? "active" : ""}`}
              onClick={() => setActiveCategory("all")}
              aria-pressed={activeCategory === "all"}
            >
              all
              <span className="news-chip-count">{reversed.length}</span>
            </button>
            {categories.map((cat) => {
              const count = reversed.filter((n) => categorizeNews(n) === cat).length;
              return (
                <button
                  key={cat}
                  className={`news-chip ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                  aria-pressed={activeCategory === cat}
                >
                  {cat}
                  <span className="news-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="news-body">
        {totalCount === 0 ? (
          <div className="panel news-empty">
            <p className="muted">No news yet.</p>
            <p className="muted small">Events will appear here as turns advance. Legacy saves with no news show this empty state.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel news-empty">
            <p className="muted">No items match your filters.</p>
            <button className="secondary small-btn" onClick={() => { setQuery(""); setActiveCategory("all"); }}>
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="muted small news-count-line">
              Showing {shownCount} of {totalCount}
              {query.trim() ? ` for "${query.trim()}"` : ""}
              {activeCategory !== "all" ? ` in ${activeCategory}` : ""}
            </div>
            <ul className="news-feed" aria-label="News feed">
              {filtered.map((item, idx) => {
                const cat = categorizeNews(item);
                const displayHeadline = stripPrefix(item.headline);
                // Defensive key: turn + date + idx
                const key = `${item.turn}-${item.date}-${idx}`;
                return (
                  <li key={key} className="news-feed-item">
                    <div className="news-feed-meta">
                      <span className="news-cat">{cat}</span>
                      <span className="news-turn">t{item.turn}</span>
                      <span className="news-date">{item.date}</span>
                    </div>
                    <div className="news-headline">{displayHeadline}</div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function NewsWidget({
  news,
  onOpen,
}: {
  news: readonly NewsItem[] | null | undefined;
  onOpen: () => void;
}) {
  const items = useMemo(() => {
    const list = safeNewsList(news);
    return [...list].reverse().slice(0, 5);
  }, [news]);

  const total = Array.isArray(news) ? news.length : 0;

  return (
    <div className="panel news-widget">
      <div className="row spread news-widget-head">
        <h2>News</h2>
        <button className="secondary small-btn" onClick={onOpen} aria-label="Open full news feed">
          OPEN FEED {total > 0 ? `· ${total}` : ""}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>No news yet.</p>
      ) : (
        <ul className="news news-widget-list">
          {items.map((n, i) => {
            const cat = categorizeNews(n);
            const display = stripPrefix(n.headline);
            return (
              <li key={`${n.turn}-${i}`} className="news-widget-item">
                <span className="news-widget-meta">
                  <span className="news-cat small">{cat}</span>
                  <span className="muted small">t{n.turn}</span>
                  <span className="muted small">{n.date}</span>
                </span>
                <span className="news-widget-headline">{display}</span>
              </li>
            );
          })}
        </ul>
      )}
      {total > 5 && (
        <div className="muted small" style={{ marginTop: 8 }}>
          Showing 5 of {total}. Open feed for all.
        </div>
      )}
    </div>
  );
}
