import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * useEffect / useLayoutEffect のコールバックが、関数以外を「後片付け」として返していないかを確かめる。
 * React は戻り値を画面を離れるときなどに呼び出すため、関数以外だと「i is not a function」で画面ごと落ちる。
 * 例：`useEffect(() => el.scrollIntoView())` は、Chrome / Edge 150 から scrollIntoView が Promise を返すようになり落ちた。
 */
const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

const isFn = (n: ts.Node) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n);

function badEffects(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node) => `${file.replace(SRC, "src")}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && /^(React\.)?use(Layout)?Effect$/.test(n.expression.getText(sf))) {
      const cb = n.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        // `() => () => cleanup()` のように、関数をそのまま返す書き方は正しい
        if (!ts.isBlock(cb.body)) {
          if (!isFn(cb.body)) out.push(`${at(cb)} 式の値をそのまま返している`);
        } else {
          const walk = (m: ts.Node) => {
            if (m !== cb && isFn(m)) return;
            if (ts.isReturnStatement(m) && m.expression && !isFn(m.expression)) out.push(`${at(m)} 関数以外を返している`);
            ts.forEachChild(m, walk);
          };
          ts.forEachChild(cb.body, walk);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("useEffect の後片付け", () => {
  it("アプリのコードは、後片付けとして関数か何もなしだけを返す", () => {
    const found = sourceFiles(SRC).flatMap((f) => badEffects(f, readFileSync(f, "utf8")));
    expect(found).toEqual([]);
  });

  it("検査は、式をそのまま返す書き方と関数以外の return を見つける", () => {
    const code = [
      "useEffect(() => el.scrollIntoView(), []);",
      "useEffect(() => { return 1; }, []);",
      "useEffect(() => { const t = setTimeout(f); return () => clearTimeout(t); }, []);",
      "useEffect(() => { el.focus(); }, []);",
      "useEffect(() => () => unsubscribe(), []);",
    ].join("\n");
    expect(badEffects(join(SRC, "x.tsx"), code)).toHaveLength(2);
  });
});
