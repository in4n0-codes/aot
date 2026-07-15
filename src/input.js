export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this._downHandlers = [];

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (this.locked) for (const h of this._downHandlers) h(e.button);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // Losing focus mid-flight shouldn't leave keys stuck down.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
  }

  onMouseDown(handler) {
    this._downHandlers.push(handler);
  }

  down(code) {
    return this.keys.has(code);
  }

  consumeLook() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }
}
