/**
 * Tiny TypeScript highlighter for EDITABLE code panes: the editor is a
 * transparent textarea over this highlighted <pre> (re-rendered on input).
 * Same palette as the shiki-rendered blocks (.k/.s/.d/.t/.c/.n on theme
 * variables), no runtime dependency. Not a parser — good enough for the
 * recipes' code shapes.
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const RE =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(@\w+)|\b(await|async|class|const|export|from|function|import|new|return|try|catch|finally|throw|else|if|for|of|in|while|typeof|extends|implements|interface|type|this|true|false|null|undefined|void|let|var|static|readonly|private|public|protected)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Z][A-Za-z0-9_]*)\b/g

export function highlightTS(code: string): string {
  let out = ''
  let last = 0
  const re = new RegExp(RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index))
    const [full, comment, str, dec, kw, num, typ] = m
    const cls = comment ? 'c' : str ? 's' : dec ? 'd' : kw ? 'k' : num ? 'n' : typ ? 't' : ''
    out += cls ? `<span class="${cls}">${esc(full)}</span>` : esc(full)
    last = m.index + full.length
  }
  out += esc(code.slice(last))
  // trailing newline: the last line keeps its height when editing at EOF
  return out + '\n'
}
