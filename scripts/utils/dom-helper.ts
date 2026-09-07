// scripts/utils/dom-helper.ts
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean>,
  children?: (Node | string | number)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'textContent') {
        el.textContent = String(val);
      } else if (key === 'innerHTML') {
        throw new Error('[SECURITY] innerHTML not allowed in DOMHelper');
      } else {
        el.setAttribute(key, String(val));
      }
    });
  }
  if (children) {
    children.forEach(child => {
      if (child === null || child === undefined) return;
      el.appendChild(
        typeof child === 'object' && 'nodeType' in child
          ? child
          : document.createTextNode(String(child))
      );
    });
  }
  return el;
}
