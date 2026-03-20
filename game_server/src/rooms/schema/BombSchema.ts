import { Schema, type } from "@colyseus/schema";

export class BombSchema extends Schema {
  @type("string") ownerId: string = "";
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float64") detonateAt: number = 0; // epoch ms (place time + fuseTime)
  @type("boolean") isDetonated: boolean = false;
  @type("boolean") isMine: boolean = false; // proximity mine vs. timed bomb
  @type("uint8") triggerRadius: number = 0; // mine trigger radius (px)
  @type("float64") armedAt: number = 0;    // epoch ms when mine becomes active
}
