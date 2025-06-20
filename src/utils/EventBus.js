const listeners = {};
export const EventBus = {
  on(event, cb) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(cb);
  },
  emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }
};
