import { Schema, type } from "@colyseus/schema";

export class ProjectileSchema extends Schema {
  @type("string") ownerId: string = ""; // sessionId of firer
  @type("string") type: string = ""; // "rocket" | "bullet"
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
  @type("float32") angle: number = 0;
  @type("float64") createdAt: number = 0;
}
