import {
  Children,
  isValidElement,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textContent(node.props.children);
  return "";
}

function CopyableCodeBlock({
  children,
  ...props
}: ComponentPropsWithoutRef<"pre">): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const firstChild = Children.toArray(children)[0];
  const className = isValidElement<{ className?: string }>(firstChild)
    ? (firstChild.props.className ?? "")
    : "";
  const language = className.match(/language-([\w+-]+)/)?.[1] ?? "code";
  const source = textContent(children).replace(/\n$/, "");

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  };

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <button onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

const components: Components = {
  a: ({ children, href, ...props }) => (
    <a {...props} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  pre: CopyableCodeBlock,
};

export function RichText({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
