/**
 * EventBus — simple Phaser EventEmitter used for React ↔ Phaser communication.
 *
 * React → Phaser:
 *   EventBus.emit("room-state-update", state)
 *   EventBus.emit("kill-event", data)
 *   EventBus.emit("explosion-event", data)
 *   EventBus.emit("game-phase-change", phase)
 *
 * Phaser → React:
 *   EventBus.emit("input-update", inputState)
 *   EventBus.emit("attack", { angle })
 *   EventBus.emit("pickup-request", { crateId })
 *   EventBus.emit("scene-ready", sceneName)
 */
import Phaser from "phaser";

export const EventBus = new Phaser.Events.EventEmitter();
