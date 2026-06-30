/**
 * DVD-style screensaver floater for the player stage.
 */
import { mainBody } from '../dom.js';
import { isTouchUi } from '../platform.js';

export class DvdFloater {
    constructor(el) {
        this.el = el;
        this.running = false;
        this.raf = null;
        this.lastTick = 0;
        this.x = 0;
        this.y = 0;
        this.vx = 1.1;
        this.vy = 0.85;
        this.halfW = 0;
        this.halfH = 0;
    }

    measure() {
        const scale = 0.75;
        this.el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        const cover = this.el.querySelector('.cover-wrapper');
        const info = this.el.querySelector('.info');
        if (cover && info) {
            const coverR = cover.getBoundingClientRect();
            const infoR = info.getBoundingClientRect();
            const blockW = Math.max(coverR.width, infoR.width);
            const blockH = infoR.bottom - coverR.top;
            this.halfW = (blockW / 2) * scale + 16;
            this.halfH = (blockH / 2) * scale + 28;
        } else {
            const rect = this.el.getBoundingClientRect();
            this.halfW = (rect.width / 2) * scale + 16;
            this.halfH = (rect.height / 2) * scale + 28;
        }
        if (this.running) {
            this.clampToBounds();
            this.applyTransform();
        }
    }

    clampToBounds() {
        const touchUi = isTouchUi();
        const padX = touchUi
            ? Math.max(12, Math.round(window.innerWidth * 0.015))
            : Math.max(32, Math.round(window.innerWidth * 0.035));
        const leftFrac = mainBody.classList.contains('lyrics-open') ? 0.67 : 1;
        const maxX = window.innerWidth * leftFrac - this.halfW - padX;
        const minX = this.halfW + padX;
        if (this.x > maxX) this.x = maxX;
        if (this.x < minX) this.x = minX;
    }

    start(seedPos) {
        if (this.running) return;
        mainBody.classList.add('dvd-float');
        this.measure();
        if (seedPos) {
            this.x = seedPos.x;
            this.y = seedPos.y;
        } else {
            const rect = this.el.getBoundingClientRect();
            this.x = rect.left + rect.width / 2;
            this.y = rect.top + rect.height / 2;
        }
        const speed = 23;
        const diagonals = [45, 135, 225, 315].map((d) => d * Math.PI / 180);
        const angle = diagonals[Math.floor(Math.random() * diagonals.length)];
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.el.style.left = '0px';
        this.el.style.top = '0px';
        this.lastTick = 0;
        this.applyTransform();
        this.running = true;
        this.tick(performance.now());
    }

    applyTransform() {
        this.el.style.transform =
            `translate3d(${this.x}px, ${this.y}px, 0) translate(-50%, -50%) scale(0.75)`;
    }

    stop(snap = true) {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        mainBody.classList.remove('dvd-float');
        if (snap) {
            this.el.style.left = '50%';
            this.el.style.top = '50%';
            this.el.style.transform = 'translate(-50%, -50%)';
            window.setTimeout(() => {
                if (!this.running) {
                    this.el.style.left = '';
                    this.el.style.top = '';
                    this.el.style.transform = '';
                }
            }, 450);
        } else {
            this.el.style.left = '';
            this.el.style.top = '';
            this.el.style.transform = '';
        }
    }

    tick(now) {
        if (!this.running) return;
        if (!this.lastTick) this.lastTick = now;
        let dt = (now - this.lastTick) / 1000;
        this.lastTick = now;
        if (dt > 0.1) dt = 0.1;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const touchUi = isTouchUi();
        const padX = touchUi
            ? Math.max(12, Math.round(window.innerWidth * 0.015))
            : Math.max(32, Math.round(window.innerWidth * 0.035));
        const padY = touchUi
            ? Math.max(16, Math.round(window.innerHeight * 0.025))
            : Math.max(44, Math.round(window.innerHeight * 0.05));
        const minX = this.halfW + padX;
        const leftFrac = mainBody.classList.contains('lyrics-open') ? 0.67 : 1;
        const maxX = window.innerWidth * leftFrac - this.halfW - padX;
        const minY = this.halfH + padY;
        const maxY = window.innerHeight - this.halfH - padY;
        if (this.x <= minX) { this.x = minX; this.vx = Math.abs(this.vx); }
        if (this.x >= maxX) { this.x = maxX; this.vx = -Math.abs(this.vx); }
        if (this.y <= minY) { this.y = minY; this.vy = Math.abs(this.vy); }
        if (this.y >= maxY) { this.y = maxY; this.vy = -Math.abs(this.vy); }
        this.applyTransform();
        this.raf = requestAnimationFrame((t) => this.tick(t));
    }
}

export function createDvdFloater(el) {
    return new DvdFloater(el);
}
