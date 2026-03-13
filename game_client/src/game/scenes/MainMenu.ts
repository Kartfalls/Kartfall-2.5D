import Phaser from "phaser";
import { EventBus } from "../EventBus";
import { TEX_TITLE_LOGO, TEX_BG_FAR } from "../spriteKeys";

/**
 * MainMenu scene — title screen shown before joining a room.
 * The actual room joining is handled by React; this is visual chrome.
 */
export class MainMenu extends Phaser.Scene {
  constructor() {
    super("MainMenu");
  }

  create(): void {
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    // Background
    if (this.textures.exists(TEX_BG_FAR)) {
      const bg = this.add.image(cx, cy, TEX_BG_FAR);
      bg.setDisplaySize(this.cameras.main.width, this.cameras.main.height);
      bg.setAlpha(0.4);
    } else {
      this.cameras.main.setBackgroundColor(0x080809);
    }

    // Title logo
    if (this.textures.exists(TEX_TITLE_LOGO)) {
      const logo = this.add.image(cx, cy - 60, TEX_TITLE_LOGO);
      logo.setScale(4);
    } else {
      this.add
        .text(cx, cy - 60, "KARTFALL", {
          fontFamily: "Space Mono",
          fontSize: "48px",
          color: "#E5FF00",
        })
        .setOrigin(0.5);
    }

    // Subtitle
    this.add
      .text(cx, cy + 20, "2D KART BATTLE ARENA", {
        fontFamily: "Space Mono",
        fontSize: "12px",
        color: "#666677",
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    // Instruction
    this.add
      .text(cx, cy + 80, "JOIN FROM THE LOBBY PANEL", {
        fontFamily: "Space Mono",
        fontSize: "10px",
        color: "#444455",
      })
      .setOrigin(0.5);

    // Listen for game start event from React
    EventBus.on("start-game", () => {
      this.scene.start("Game");
    });

    EventBus.emit("scene-ready", "MainMenu");
  }

  shutdown(): void {
    EventBus.off("start-game");
  }
}
