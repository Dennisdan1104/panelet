'use strict';
// The window rect equals the visible card except for the four rounded
// corner slivers. Points there are made click-through so the desktop
// underneath stays fully usable.
//
// The card may be CSS-zoomed (size slider), which visually scales the
// corner radius too — read the live scale from settings.js snapshot.
(function () {
  let queued = false;

  function radius() {
    const s = (window.__S && window.__S[`scale_${new URLSearchParams(location.search).get('wid')}`]) || 100;
    return Math.round(26 * Math.min(4, Math.max(0.25, Number(s) / 100)));
  }

  function insideCard(x, y) {
    const R = radius();
    const w = innerWidth, h = innerHeight;
    const cx = Math.min(Math.max(x, R), w - R);
    const cy = Math.min(Math.max(y, R), h - R);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= R * R;
  }

  function update(e) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (window.widget && window.widget.setClickThrough) {
        window.widget.setClickThrough(!insideCard(e.clientX, e.clientY));
      }
    });
  }

  document.addEventListener('mousemove', update);
  document.addEventListener('mouseleave', update);
})();
