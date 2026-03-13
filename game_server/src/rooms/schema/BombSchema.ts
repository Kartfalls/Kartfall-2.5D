import { Schema, type } from "@colyseus/schema";

export class BombSchema extends Schema {
  @type("string") ownerId: string = "";
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float64") detonateAt: number = 0; // epoch ms (place time + 5000ms)
  @type("boolean") isDetonated: boolean = false;
}
