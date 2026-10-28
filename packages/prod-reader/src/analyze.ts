import { parse } from 'acorn';

// Static analysis: read a minified Svelte 5 production bundle (no sourcemaps) and recover
// the component tree + signal shape. The dev capture seam (`svelte/internal/client` import) is
// inlined away in a build, and push/pop component boundaries are tree-shaken out — so we fingerprint
// the mangled runtime exports by how they are USED (letters vary per build; usage shape is stable)
// and rebuild the tree from the static call graph. The tests run it on a SvelteKit production build
// (test/fixtures). Acorn nodes are typed loosely as `any`.

type Node = any;

function walk(node: Node, visit: (n: Node) => void): void {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else if (child && typeof child.type === 'string') walk(child, visit);
  }
}

export function collect(node: Node, type: string): Node[] {
  const out: Node[] = [];
  walk(node, (n) => {
    if (n.type === type) out.push(n);
  });
  return out;
}

export function parseModule(code: string): Node {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
}

// Minifiers turn string literals into no-expression template literals (`start` not "start").
function staticString(node: Node): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1)
    return node.quasis[0].value.cooked;
  return null;
}

const calleeName = (call: Node): string | null =>
  call.callee && call.callee.type === 'Identifier' ? call.callee.name : null;

// runtime locals = identifiers imported from a chunk (the bundled internals live in a chunk)
function runtimeImports(ast: Node): Set<string> {
  const locals = new Set<string>();
  for (const imp of collect(ast, 'ImportDeclaration')) {
    if (typeof imp.source.value !== 'string' || !imp.source.value.includes('chunks/')) continue;
    for (const spec of imp.specifiers) {
      if (spec.type === 'ImportSpecifier') locals.add(spec.local.name);
    }
  }
  return locals;
}

export interface RuntimeRoles {
  state?: string;
  derived?: string;
  get?: string;
  set?: string;
  template?: string;
  prop?: string;
  event?: string;
}

// Fingerprint runtime roles from usage shape (not from the mangled name).
export function fingerprintRoles(ast: Node): RuntimeRoles {
  const rt = runtimeImports(ast);
  const calls = collect(ast, 'CallExpression').filter((c) => {
    const n = calleeName(c);
    return n != null && rt.has(n);
  });

  const roles: RuntimeRoles = {};
  roles.template = calls.find((c) => c.arguments[0]?.type === 'TemplateLiteral')?.callee.name;
  roles.event = calls.find(
    (c) =>
      c.arguments.length >= 3 &&
      staticString(c.arguments[0]) != null &&
      (c.arguments[2]?.type === 'ArrowFunctionExpression' ||
        c.arguments[2]?.type === 'FunctionExpression'),
  )?.callee.name;
  roles.prop = calls.find(
    (c) => c.arguments[0]?.type === 'Identifier' && staticString(c.arguments[1]) != null,
  )?.callee.name;

  const getCounts = new Map<string, number>();
  for (const c of calls) {
    if (c.arguments.length === 1 && c.arguments[0]?.type === 'Identifier') {
      const n = c.callee.name;
      getCounts.set(n, (getCounts.get(n) ?? 0) + 1);
    }
  }
  roles.get = [...getCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const getName = roles.get;
  const createsRead = new Set<string>();
  for (const decl of collect(ast, 'VariableDeclarator')) {
    if (decl.id.type !== 'Identifier' || decl.init?.type !== 'CallExpression') continue;
    const callee = calleeName(decl.init);
    if (callee && rt.has(callee)) {
      let read = false;
      walk(ast, (n) => {
        if (
          n.type === 'CallExpression' &&
          calleeName(n) === getName &&
          n.arguments[0]?.type === 'Identifier' &&
          n.arguments[0].name === decl.id.name
        )
          read = true;
      });
      if (read) createsRead.add(decl.id.name);
    }
  }
  for (const decl of collect(ast, 'VariableDeclarator')) {
    if (!createsRead.has(decl.id?.name)) continue;
    const callee = decl.init.callee.name;
    const arg0 = decl.init.arguments[0];
    if (arg0?.type === 'ArrowFunctionExpression') roles.derived ??= callee;
    else roles.state ??= callee;
  }
  roles.set = calls.find(
    (c) =>
      c.arguments.length === 2 &&
      c.arguments[0]?.type === 'Identifier' &&
      createsRead.has(c.arguments[0].name),
  )?.callee.name;

  return roles;
}

export interface ComponentInfo {
  fn: string;
  stateCount: number;
  derivedCount: number;
  props: string[];
  children: { fn: string; props: Record<string, unknown> }[];
  isRoot: boolean;
}

export interface TreeNode {
  fn: string;
  label: string;
  props: Record<string, unknown>;
  signals: { state: number; derived: number };
  children: TreeNode[];
}

function findComponents(ast: Node, roles: RuntimeRoles): ComponentInfo[] {
  const fns = collect(ast, 'FunctionDeclaration').filter((f) => f.id);
  const fnNames = new Set(fns.map((f) => f.id.name));

  const templateVars = new Set<string>();
  for (const decl of collect(ast, 'VariableDeclarator')) {
    if (
      decl.id?.type === 'Identifier' &&
      decl.init?.type === 'CallExpression' &&
      calleeName(decl.init) === roles.template
    )
      templateVars.add(decl.id.name);
  }

  let rootFn: string | undefined;
  for (const ex of collect(ast, 'ExportNamedDeclaration')) {
    for (const spec of ex.specifiers ?? []) {
      if (spec.exported.name === 'component') rootFn = spec.local.name;
    }
  }

  const infos: ComponentInfo[] = [];
  for (const fn of fns) {
    const calls = collect(fn, 'CallExpression');
    const stateCount = calls.filter((c) => calleeName(c) === roles.state).length;
    const derivedCount = calls.filter((c) => calleeName(c) === roles.derived).length;
    const usesTemplate = calls.some((c) => {
      const n = calleeName(c);
      return n === roles.template || (n != null && templateVars.has(n));
    });

    const props: string[] = [];
    for (const c of calls) {
      if (calleeName(c) === roles.prop) {
        const nm = staticString(c.arguments[1]);
        if (nm != null) props.push(nm);
      }
    }

    const children: ComponentInfo['children'] = [];
    for (const c of calls) {
      const name = calleeName(c);
      if (!name || !fnNames.has(name) || name === fn.id.name) continue;
      const propObj: Record<string, unknown> = {};
      const arg1 = c.arguments[1];
      if (arg1?.type === 'ObjectExpression') {
        for (const p of arg1.properties) {
          if (p.type !== 'Property' || p.key.type !== 'Identifier') continue;
          propObj[p.key.name] = p.value.type === 'Literal' ? p.value.value : '<dynamic>';
        }
      }
      children.push({ fn: name, props: propObj });
    }

    if (usesTemplate || stateCount > 0 || children.length > 0) {
      infos.push({
        fn: fn.id.name,
        stateCount,
        derivedCount,
        props,
        children,
        isRoot: fn.id.name === rootFn,
      });
    }
  }
  return infos;
}

function buildTree(components: ComponentInfo[]): TreeNode | null {
  const byFn = new Map(components.map((c) => [c.fn, c]));
  // root = the component exported `as component`, else a component nobody else renders
  const rendered = new Set(components.flatMap((c) => c.children.map((ch) => ch.fn)));
  const root = components.find((c) => c.isRoot) ?? components.find((c) => !rendered.has(c.fn));
  if (!root) return null;

  const make = (info: ComponentInfo, props: Record<string, unknown>): TreeNode => ({
    fn: info.fn,
    label: `<${info.fn}>`, // anonymous — real name needs a sourcemap
    props,
    signals: { state: info.stateCount, derived: info.derivedCount },
    children: info.children
      .map((ch) => {
        const cInfo = byFn.get(ch.fn);
        return cInfo ? make(cInfo, ch.props) : null;
      })
      .filter((x): x is TreeNode => x != null),
  });
  return make(root, {});
}

export interface ProdReadResult {
  roles: RuntimeRoles;
  tree: TreeNode | null;
}

export function readProdNodeChunk(code: string): ProdReadResult {
  const ast = parseModule(code);
  const roles = fingerprintRoles(ast);
  const components = findComponents(ast, roles);
  return { roles, tree: buildTree(components) };
}
