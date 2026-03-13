import { Schema, type } from "@colyseus/schema";

export class CrateSchema extends Schema {
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("boolean") isAvailable: boolean = true;
  @type("string") weaponType: string = ""; // revealed after pickup
  @type("float64") respawnAt: number = 0; // epoch ms
}
