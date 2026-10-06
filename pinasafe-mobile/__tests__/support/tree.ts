import React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

/** Expands hook-free function components and returns every element in the tree. */
export function collectElements(node: unknown, out: React.ReactElement<AnyProps>[] = []): React.ReactElement<AnyProps>[] {
  if (Array.isArray(node)) {
    node.forEach(child => collectElements(child, out));
    return out;
  }
  if (!React.isValidElement<AnyProps>(node)) return out;

  if (typeof node.type === 'function') {
    const rendered = (node.type as (props: AnyProps) => React.ReactNode)(node.props);
    out.push(node);
    return collectElements(rendered, out);
  }

  out.push(node);
  Object.values(node.props).forEach(value => {
    if (Array.isArray(value) || React.isValidElement(value)) collectElements(value, out);
  });
  return out;
}

export function collectText(node: unknown): string[] {
  const texts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') { texts.push(String(value)); return; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!React.isValidElement<AnyProps>(value)) return;
    const element = value;
    const rendered = typeof element.type === 'function'
      ? (element.type as (props: AnyProps) => React.ReactNode)(element.props)
      : null;
    if (rendered !== null) { visit(rendered); return; }
    Object.entries(element.props).forEach(([key, prop]) => {
      if (key === 'style' || key === 'source') return;
      if (typeof prop === 'string' && ['title', 'subtitle', 'label', 'message', 'value'].includes(key)) texts.push(prop);
      else if (Array.isArray(prop) || React.isValidElement(prop) || key === 'children') visit(prop);
    });
  };
  visit(node);
  return texts;
}

export function findAllByType(node: unknown, type: string) {
  return collectElements(node).filter(element => element.type === type);
}

export function findButton(node: unknown, label: string) {
  return findAllByType(node, 'Button').find(element => element.props.label === label);
}

/** Minimal stateful hook harness: slots persist across calls; setters do not re-render. */
export function createHookHarness() {
  const slots: unknown[] = [];
  let cursor = 0;
  let effectCursor = 0;
  const effectRecords: Array<{
    dependencies?: unknown[];
    cleanup?: () => void;
    effect?: () => void | (() => void);
    pending: boolean;
  }> = [];
  return {
    slots,
    resetCursor: () => { cursor = 0; effectCursor = 0; },
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      const setter = jest.fn((value: unknown) => {
        slots[index] = typeof value === 'function' ? (value as (current: unknown) => unknown)(slots[index]) : value;
      });
      return [slots[index], setter];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: unknown };
    },
    useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
      const index = effectCursor++;
      const record = effectRecords[index] ?? { pending: false };
      const unchanged = dependencies && record.dependencies
        && dependencies.length === record.dependencies.length
        && dependencies.every((value, dependencyIndex) => Object.is(value, record.dependencies?.[dependencyIndex]));
      if (!unchanged) {
        record.effect = effect;
        record.dependencies = dependencies;
        record.pending = true;
      }
      effectRecords[index] = record;
    },
    flushEffects: () => {
      effectRecords.forEach(record => {
        if (!record.pending || !record.effect) return;
        record.cleanup?.();
        record.cleanup = record.effect() || undefined;
        record.pending = false;
      });
    },
    unmount: () => effectRecords.forEach(record => {
      record.cleanup?.();
      record.cleanup = undefined;
      record.dependencies = undefined;
      record.effect = undefined;
      record.pending = false;
    }),
  };
}
