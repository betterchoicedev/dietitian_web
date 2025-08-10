const listeners = {};
export const EventBus = {
  on(event, cb) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb);
  },
  emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  },
  off(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(fn => fn !== cb);
    if (listeners[event].length === 0) delete listeners[event];
  }
};
