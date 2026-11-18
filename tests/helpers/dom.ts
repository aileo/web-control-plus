import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { DOMWindow } from 'jsdom';

export function present<T>(
  value: T,
  message = 'Expected a value'
): NonNullable<T> {
  assert.ok(value != null, message);
  return value;
}

export function errorMessage(error: unknown): string {
  assert.ok(error instanceof Error, 'Expected an Error');
  return error.message;
}

export function query(parent: ParentNode, selector: string): Element {
  return present(
    parent.querySelector(selector),
    `Missing element: ${selector}`
  );
}

export function asHtml(element: unknown): HTMLElement {
  assert.ok(element instanceof HTMLElement, 'Expected an HTML element');
  return element;
}

export function html(parent: ParentNode, selector: string): HTMLElement {
  return asHtml(query(parent, selector));
}

export function asInput(element: unknown): HTMLInputElement {
  assert.ok(element instanceof window.HTMLInputElement, 'Expected an input');
  return element;
}

export function inputField(
  parent: ParentNode,
  selector: string
): HTMLInputElement {
  return asInput(query(parent, selector));
}

export function asButton(element: unknown): HTMLButtonElement {
  assert.ok(element instanceof window.HTMLButtonElement, 'Expected a button');
  return element;
}

export function buttonElement(
  parent: ParentNode,
  selector: string
): HTMLButtonElement {
  return asButton(query(parent, selector));
}

export function installDOM(t: TestContext, window: DOMWindow): void {
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    DocumentFragment: window.DocumentFragment,
    ShadowRoot: window.ShadowRoot,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  t.after(() => {
    window.close();
    for (const key of Object.keys(globals)) {
      const descriptor = previous[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
}
