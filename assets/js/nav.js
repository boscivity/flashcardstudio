// Hash navigation helpers shared by views, plus a hand-off slot for data passed between routes.
let guard = null;
let handoff = null;

export function go(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target) {
    window.dispatchEvent(new CustomEvent('fcs:reload-route'));
  } else if (replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

/** A view can block navigation (e.g. unsaved edits). fn returns boolean or Promise<boolean>. */
export const setGuard = fn => { guard = fn; };
export const getGuard = () => guard;

export const setHandoff = value => { handoff = value; };
export function takeHandoff() {
  const value = handoff;
  handoff = null;
  return value;
}
