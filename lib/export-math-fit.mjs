// Keep MathML vector-based while fitting unusually long display equations to
// the fixed document content width. Run after fonts load and before pagination.
/** @param {Document | Element} [root] */
export function fitDisplayMath(root = document) {
  for (const display of root.querySelectorAll(".math-display")) {
    const math = display.querySelector("math");
    if (!math) continue;
    math.style.removeProperty("font-size");
    math.style.removeProperty("transform");
    math.style.removeProperty("transform-origin");
    math.style.display = "inline-block";
    math.style.whiteSpace = "nowrap";
    const available = display.clientWidth || display.parentElement?.clientWidth || 0;
    if (!available) continue;
    let width = math.getBoundingClientRect().width;
    if (width <= available - 4) continue;
    const baseSize = Number.parseFloat(getComputedStyle(math).fontSize) || 16;
    math.style.fontSize = `${Math.max(11, baseSize * (available - 4) / width)}px`;
    width = math.getBoundingClientRect().width;
    if (width > available - 4) {
      math.style.transform = `scaleX(${(available - 4) / width})`;
      math.style.transformOrigin = "center center";
    }
  }
}
