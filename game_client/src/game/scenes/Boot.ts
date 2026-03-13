import Phaser from "phaser";

/**
 * Boot scene — minimal setup, then go to Preloader.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x080809);
    this.scene.start("Preloader");
  }
}
