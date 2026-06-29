import { isValidRegex, type HighlightRule } from './highlight/matcher';

export function createRule(): HighlightRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    regex: '',
    enabled: true,
    textColor: '#000000',
    bgColor: '#ffff00',
  };
}

export interface RulesPanelHandle {
  render(rules: HighlightRule[]): void;
}

export function mountRulesPanel(
  container: HTMLElement,
  onChange: (rules: HighlightRule[]) => void,
): RulesPanelHandle {
  let rules: HighlightRule[] = [];

  function commit(): void {
    onChange(rules);
  }
  function structuralChange(next: HighlightRule[]): void {
    rules = next;
    draw();
    commit();
  }
  function patch(id: string, p: Partial<HighlightRule>): void {
    rules = rules.map((r) => (r.id === id ? { ...r, ...p } : r));
    commit(); // 재렌더 안 함 → 입력 포커스 유지
  }

  function draw(): void {
    container.innerHTML = '';
    for (const rule of rules) container.appendChild(row(rule));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'rule-add';
    add.textContent = '+ 규칙 추가';
    add.addEventListener('click', () => structuralChange([...rules, createRule()]));
    container.appendChild(add);
  }

  function row(rule: HighlightRule): HTMLElement {
    const el = document.createElement('div');
    el.className = 'rule-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'rule-enabled';
    enabled.checked = rule.enabled;
    enabled.addEventListener('change', () => patch(rule.id, { enabled: enabled.checked }));

    const regex = document.createElement('input');
    regex.type = 'text';
    regex.className = 'rule-regex';
    regex.placeholder = '정규식';
    regex.value = rule.regex;
    regex.classList.toggle('invalid', !isValidRegex(rule.regex));
    regex.addEventListener('input', () => {
      regex.classList.toggle('invalid', !isValidRegex(regex.value));
      patch(rule.id, { regex: regex.value });
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'rule-name';
    name.placeholder = '이름';
    name.value = rule.name;
    name.addEventListener('input', () => patch(rule.id, { name: name.value }));

    const text = colorInput(rule.textColor, (v) => patch(rule.id, { textColor: v }), 'rule-text');
    const bg = colorInput(rule.bgColor, (v) => patch(rule.id, { bgColor: v }), 'rule-bg');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'rule-del';
    del.textContent = '✕';
    del.addEventListener('click', () => structuralChange(rules.filter((r) => r.id !== rule.id)));

    el.append(enabled, regex, name, text, bg, del);
    return el;
  }

  return {
    render(next: HighlightRule[]): void {
      rules = next;
      draw();
    },
  };
}

function colorInput(value: string, on: (v: string) => void, cls: string): HTMLInputElement {
  const c = document.createElement('input');
  c.type = 'color';
  c.className = cls;
  c.value = value;
  c.addEventListener('input', () => on(c.value));
  return c;
}
