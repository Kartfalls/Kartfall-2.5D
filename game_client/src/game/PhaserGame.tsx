import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { phaserConfig } from "./config";
import { EventBus } from "./EventBus";

interface PhaserGameProps {
  room: Room;
}

/**
 * React wrapper that creates a Phaser.Game instance, passes the room via registry,
 * and cleans up on unmount.
 */
export function PhaserGame({ room }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current) return; // already created

    const config: Phaser.Types.Core.GameConfig = {
      ...phaserConfig,
      parent: containerRef.current!,
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Pass room to Phaser via registry so scenes can access it
    game.registry.set("room", room);

    // When Game scene is ready, emit start-game for MainMenu → Game transition
    EventBus.on("scene-ready", (sceneName: string) => {
      if (sceneName === "MainMenu") {
        // Auto-start game since we already have a room
        EventBus.emit("start-game");
      }
    });

    return () => {
      EventBus.off("scene-ready");
      game.destroy(true);
      gameRef.current = null;
    };
  }, [room]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}
