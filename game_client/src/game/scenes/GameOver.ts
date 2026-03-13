import Phaser from "phaser";
import { EventBus } from "../EventBus";

/**
 * GameOver scene — shows after match finishes.
 * Results/payouts are displayed by React's ResultsScreen overlay.
 */
export class GameOver extends Phaser.Scene {
  constructor() {
    super("GameOver");
  }

  create(): void {
    // Keep it as a pure dark background — the ResultsScreen React
    // component handles the actual premium UI overlay.
    this.cameras.main.setBackgroundColor(0x060608);

    // Listen for return to menu
    EventBus.on("return-to-menu", () => {
      this.scene.start("MainMenu");
    });

    EventBus.emit("scene-ready", "GameOver");
  }

  shutdown(): void {
    EventBus.off("return-to-menu");
  }
}
