"""Crude JS structure checker: strings, comments, regex literals, nested template
literals, and ()/[]/{} balance. Not a parser — catches unbalanced backticks/braces.
Also lists import names that don't match exports of the imported local module.
Usage: python3 -I tools/jscheck.py site
"""
import os, re, sys

PAIRS = {')': '(', ']': '[', '}': '{'}
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^') | {''}
KW = ('return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'yield', 'await')

def check(src, name):
    i, n = 0, len(src)
    stack = []  # entries: '(', '[', '{', '`', '${'
    last = ''   # last significant char/token for regex heuristic
    line = 1
    def err(msg):
        print(f'{name}:{line}: {msg}'); return False
    while i < n:
        c = src[i]
        top = stack[-1] if stack else None
        if top == '`':
            if c == '\\': i += 2; continue
            if c == '\n': line += 1
            if c == '`': stack.pop(); last = 'x'; i += 1; continue
            if src.startswith('${', i): stack.append('${'); last = '{'; i += 2; continue
            i += 1; continue
        if c == '\n': line += 1; i += 1; continue
        if c in ' \t\r': i += 1; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i); line += src[i:j].count('\n'); i = j + 2; continue
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\': j += 1
                if src[j] == '\n': return err('newline in string')
                j += 1
            i = j + 1; last = 'x'; continue
        if c == '`': stack.append('`'); i += 1; continue
        if c == '/':
            word = re.search(r'([A-Za-z_$][\w$]*)\s*$', src[max(0, i - 12):i])
            if last in REGEX_PREV or (word and word.group(1) in KW and last == 'w'):
                j = i + 1; in_cls = False
                while j < n:
                    ch = src[j]
                    if ch == '\\': j += 2; continue
                    if ch == '\n': return err('newline in regex')
                    if ch == '[': in_cls = True
                    elif ch == ']': in_cls = False
                    elif ch == '/' and not in_cls: break
                    j += 1
                j += 1
                while j < n and src[j].isalpha(): j += 1
                i = j; last = 'x'; continue
            last = '/'; i += 1; continue
        if c in '([{': stack.append(c); last = c; i += 1; continue
        if c in ')]}':
            if not stack: return err(f'unmatched {c}')
            t = stack.pop()
            if c == '}' and t == '${': last = 'x'; i += 1; continue
            if t != PAIRS[c]: return err(f'mismatched {c} closes {t}')
            last = ')' if c != '}' else '}'; i += 1; continue
        if c.isalnum() or c in '_$':
            m = re.match(r'[\w$]+', src[i:]); w = m.group(0)
            last = 'w' if w in KW else 'x'; i += len(w); continue
        last = c; i += 1
    if stack: return err(f'unclosed {stack[-1]} (stack={stack[-5:]})')
    return True

def exports_of(src):
    names = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|let|class)\s+([\w$]+)', src))
    for grp in re.findall(r'export\s*\{([^}]*)\}', src):
        names |= {p.split(' as ')[-1].strip() for p in grp.split(',') if p.strip()}
    return names

root = sys.argv[1]
files = []
for dp, _, fs in os.walk(root):
    if 'data' in dp.split(os.sep): continue
    files += [os.path.join(dp, f) for f in fs if f.endswith('.js')]
ok = True
for f in sorted(files):
    src = open(f, encoding='utf-8').read()
    ok &= check(src, os.path.relpath(f, root))
    for names, mod in re.findall(r'import\s*\{([^}]*)\}\s*from\s*[\'"](\.[^\'"]+)[\'"]', src):
        target = os.path.normpath(os.path.join(os.path.dirname(f), mod))
        if not os.path.exists(target):
            print(f'{f}: missing module {mod}'); ok = False; continue
        ex = exports_of(open(target, encoding='utf-8').read())
        for nm in [x.strip().split(' as ')[0] for x in names.split(',') if x.strip()]:
            if nm not in ex: print(f'{os.path.relpath(f, root)}: imports {nm} not exported by {mod}'); ok = False
    for mod in re.findall(r'import\s+\*\s+as\s+\w+\s+from\s*[\'"](\.[^\'"]+)[\'"]', src):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), mod))):
            print(f'{f}: missing module {mod}'); ok = False
print('OK' if ok else 'PROBLEMS FOUND', len(files), 'files')
