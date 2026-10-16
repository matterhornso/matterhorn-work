/** Match IDs as data, never as CSS selector syntax. */
export function findMessageElement<T extends Pick<Element, "getAttribute">>(
  elements: Iterable<T>,
  messageId: string,
): T | null {
  for (const element of elements) {
    if (element.getAttribute("data-message-id") === messageId) return element;
  }
  return null;
}
