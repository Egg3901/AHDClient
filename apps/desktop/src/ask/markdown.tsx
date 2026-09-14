import { useEffect, useState } from "react";
import { askRenderMap } from "./api.js";

/**
 * Answer renderer. Ports the Ask site's own markdown shaping (inline
 * code/bold/italic/links, fenced code, tables, headings, lists, quotes) so
 * answers read the same here as on the web. React escapes every text node
 * by construction; the only raw HTML in this file is a map SVG fetched
 * from the Ask service itself, exactly like the web client injects.
 */

function fmtCell(cell: string): string {
  const text = cell.trim();
  if (/^[+-]?\d{7,}$/.test(text)) return text.replace(/\B(?=(\d{3})+$)/g, ",");
  const signed = text.match(/^([+-])\d[\d.,]*%/);
  if (signed) return `${signed[1] === "+" ? "▲ " : "▼ "}${text}`;
  return cell;
}

function Inline({ text, scope }: { text: string; scope: string }): JSX.Element {
  const nodes: JSX.Element[] = [];
  // code, bold, italic, markdown link. Order matters: code first so its
  // contents are never re-shaped.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let cursor = 0;
  let index = 0;
  const push = (node: JSX.Element) => {
    nodes.push(node);
  };
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) push(<span key={`${scope}-${index++}`}>{text.slice(cursor, start)}</span>);
    const token = match[0];
    if (token.startsWith("`")) {
      push(<code key={`${scope}-${index++}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      push(<strong key={`${scope}-${index++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      push(<em key={`${scope}-${index++}`}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      if (link) {
        push(
          <a key={`${scope}-${index++}`} href={link[2]} target="_blank" rel="noopener">
            {link[1]}
          </a>,
        );
      } else {
        push(<span key={`${scope}-${index++}`}>{token}</span>);
      }
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) push(<span key={`${scope}-${index++}`}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

function splitCells(line: string): string[] {
  return line.replace(/^\s*\||\|\s*$/g, "").split("|").map((cell) => cell.trim());
}

function TableBlock({ lines, scope }: { lines: string[]; scope: string }): JSX.Element | null {
  if (lines.length < 2 || !lines[0]?.includes("|") || !/^\s*\|?[\s:|-]+$/.test(lines[1] ?? "")) return null;
  const head = splitCells(lines[0] ?? "");
  const rows = lines.slice(2).filter((line) => line.includes("|")).map(splitCells);
  return (
    <div className="av-tbl-wrap">
      <table className="av-table">
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={i}><Inline text={cell} scope={`${scope}-h${i}`} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}><Inline text={fmtCell(cell)} scope={`${scope}-r${i}c${j}`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapBlock({ spec, scope }: { spec: string; scope: string }): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let parsed: object;
    try {
      parsed = JSON.parse(spec);
    } catch {
      setFailed(true);
      return;
    }
    askRenderMap(parsed).then(
      (text) => { if (live) setSvg(text); },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [spec]);
  if (failed) return <div className="av-map-err" key={scope}>This map could not be rendered.</div>;
  if (svg === null) return <div className="av-map-err" key={scope}>Rendering map…</div>;
  // Keep service-produced SVG in the browser's image sandbox. Injecting it as
  // document markup would let an event handler inherit this window's Ask IPC.
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return <div className="av-map-wrap" key={scope}><img src={src} alt="Generated map" /></div>;
}

function ProseBlock({ block, scope }: { block: string; scope: string }): JSX.Element {
  const text = block.replace(/^\n+|\n+$/g, "");
  if (!text.trim()) return <></>;
  const lines = text.split("\n");
  const table = TableBlock({ lines, scope });
  if (table) return table;
  if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(text)) return <hr key={scope} />;
  if (/^\s*>/.test(text)) {
    return (
      <blockquote key={scope}>
        {text.replace(/^\s*>\s?/gm, "").split("\n").map((line, i, all) => (
          <span key={i}><Inline text={line} scope={`${scope}-q${i}`} />{i < all.length - 1 ? <br /> : null}</span>
        ))}
      </blockquote>
    );
  }
  const heading = /^\s*(#{1,4})\s+(.+)$/.exec(lines[0] ?? "");
  if (heading && lines.length === 1) {
    const level = heading[1]?.length ?? 1;
    const content = <Inline text={heading[2] ?? ""} scope={`${scope}-h`} />;
    if (level <= 2) return <h2 key={scope}>{content}</h2>;
    if (level === 3) return <h3 key={scope}>{content}</h3>;
    return <h4 key={scope}>{content}</h4>;
  }
  if (lines.every((line) => /^\s*[-*] /.test(line))) {
    return (
      <ul key={scope}>
        {lines.map((line, i) => (
          <li key={i}><Inline text={line.replace(/^\s*[-*] /, "")} scope={`${scope}-u${i}`} /></li>
        ))}
      </ul>
    );
  }
  if (lines.every((line) => /^\s*\d+[.)] /.test(line))) {
    return (
      <ol key={scope}>
        {lines.map((line, i) => (
          <li key={i}><Inline text={line.replace(/^\s*\d+[.)] /, "")} scope={`${scope}-o${i}`} /></li>
        ))}
      </ol>
    );
  }
  return (
    <p key={scope}>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          <Inline text={line} scope={`${scope}-p${i}`} />
        </span>
      ))}
    </p>
  );
}

export function Md({ text, scope }: { text: string; scope: string }): JSX.Element {
  const parts = (text || "").split("```");
  const nodes: JSX.Element[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const newline = part.indexOf("\n");
      const lang = newline > 0 ? part.slice(0, newline).trim().toLowerCase() : "";
      const code = newline > 0 ? part.slice(newline + 1) : part;
      if (lang === "mermaid" || lang === "mmd") {
        nodes.push(
          <div className="av-codeblock" key={`${scope}-f${i}`}>
            <pre><code>{code}</code></pre>
          </div>,
        );
      } else if (lang === "ahd-map") {
        nodes.push(<MapBlock key={`${scope}-f${i}`} spec={code} scope={`${scope}-f${i}`} />);
      } else {
        nodes.push(
          <div className="av-codeblock" key={`${scope}-f${i}`}>
            <pre><code>{code}</code></pre>
          </div>,
        );
      }
      return;
    }
    part.split(/\n{2,}/).forEach((block, j) => {
      nodes.push(<ProseBlock key={`${scope}-b${i}-${j}`} block={block} scope={`${scope}-b${i}-${j}`} />);
    });
  });
  return <>{nodes}</>;
}
